/**
 * mc-human — agent tool definitions
 *
 * ask_human: pause agent execution and hand control to Michael via noVNC
 */

import type { AnyAgentTool } from "openclaw/plugin-sdk";
import * as child_process from "node:child_process";
import { sendTelegramMessage } from "../src/tg-notify.js";
import type { HumanConfig } from "../cli/commands.js";

const SEND_ALERT_BIN = `${process.env.HOME}/am/miniclaw/SYSTEM/bin/send-alert`;
const DEFAULT_EMAIL_TO = "michael@claimhawk.app";

async function sendEmail(to: string, reason: string, url: string, timeoutSec: number): Promise<void> {
  const subject = `AM needs your help: ${reason}`;
  const body =
    `AM is blocked and needs a human to take over briefly.\n\n` +
    `Reason: ${reason}\n\n` +
    `Open this link to take control of the desktop:\n${url}\n\n` +
    `Click "Done — Resume AM" when finished. Session expires in ${timeoutSec}s.`;
  return new Promise((resolve, reject) => {
    const proc = child_process.spawn(SEND_ALERT_BIN, [
      "--subject", subject,
      "--body", body,
      "--to", to,
    ], { stdio: "pipe" });
    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`send-alert exited ${code}: ${stderr.trim()}`));
    });
    proc.on("error", reject);
  });
}

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

function ok(text: string) {
  return { content: [{ type: "text" as const, text: text.trim() }], details: {} };
}

export function createHumanTools(cfg: HumanConfig, logger: Logger): AnyAgentTool[] {
  return [
    {
      name: "ask_human",
      label: "ask_human",
      description:
        "Pause agent execution and hand control to Michael via an interactive noVNC browser session. " +
        "Use this when you encounter a captcha, login UI, or any browser interaction you cannot automate. " +
        "Blocks until Michael closes the session or the timeout elapses. " +
        "Returns 'done' when Michael signals completion, or throws on timeout.",
      parameters: {
        type: "object",
        required: ["reason"],
        properties: {
          reason: {
            type: "string",
            description: "Why human help is needed (shown in the session UI and Telegram message)",
          },
          timeout_seconds: {
            type: "number",
            description: `Session timeout in seconds (default: ${cfg.defaultTimeout})`,
          },
          via: {
            type: "string",
            enum: ["tg", "email", "both", "none"],
            description: "How to deliver the URL to Michael (default: tg)",
          },
        },
      },
      async execute(_toolCallId: string, params: unknown) {
        const input = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
        const reason = String(input["reason"] ?? "Unspecified reason");
        const timeoutSec = typeof input["timeout_seconds"] === "number"
          ? input["timeout_seconds"]
          : cfg.defaultTimeout;
        const via = String(input["via"] ?? "tg");
        const timeoutMs = timeoutSec * 1000;

        logger.info(`mc-human: ask_human tool invoked — reason="${reason}" timeout=${timeoutSec}s`);

        // Use the persistent board web session server (port 4220)
        const boardBase = "http://localhost:4220";
        let sessionUrl: string;
        let sessionToken: string;
        try {
          const createRes = await fetch(`${boardBase}/api/human-session/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reason, timeoutMs }),
          });
          if (!createRes.ok) {
            throw new Error(`session create failed: ${createRes.status}`);
          }
          const data = await createRes.json() as { ok: boolean; url: string; token: string };
          sessionUrl = data.url;
          sessionToken = data.token;
        } catch (err) {
          throw new Error(`mc-human: failed to create session: ${err}`);
        }

        logger.info(`mc-human: session URL: ${sessionUrl}`);

        const message =
          `🖥️ *AM needs your help!*\n\n` +
          `*Reason:* ${reason}\n\n` +
          `[Open Remote Desktop Session](${sessionUrl})\n\n` +
          `_Session expires in ${timeoutSec}s. Click "Done — Resume AM" when finished._`;

        if ((via === "tg" || via === "both") && cfg.tgBotToken && cfg.tgChatId) {
          try {
            await sendTelegramMessage(cfg.tgBotToken, cfg.tgChatId, message);
            logger.info(`mc-human: TG message sent`);
          } catch (err) {
            logger.error(`mc-human: TG send failed: ${err}`);
          }
        }

        if (via === "email" || via === "both") {
          try {
            await sendEmail(DEFAULT_EMAIL_TO, reason, sessionUrl, timeoutSec);
            logger.info(`mc-human: email sent to ${DEFAULT_EMAIL_TO}`);
          } catch (err) {
            logger.error(`mc-human: email send failed: ${err}`);
          }
        }

        // Poll the status endpoint until the session is closed or timeout
        const pollIntervalMs = 5000;
        const deadline = Date.now() + timeoutMs + 10_000; // extra 10s grace
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, pollIntervalMs));
          try {
            const statusRes = await fetch(
              `${boardBase}/api/human-session/status?token=${encodeURIComponent(sessionToken)}`,
            );
            if (statusRes.ok) {
              const status = await statusRes.json() as { closed?: boolean };
              if (status.closed) {
                logger.info("mc-human: session closed by human");
                break;
              }
            }
          } catch {
            // keep polling
          }
        }

        return ok("done — human closed session");
      },
    } as AnyAgentTool,
  ];
}
