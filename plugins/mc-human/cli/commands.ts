/**
 * mc-human — CLI commands
 *
 * openclaw mc-human ask <reason>   Block until human closes noVNC session
 *   --via      tg|email|both|none  Delivery method (default: tg)
 *   --timeout  <seconds>           Session timeout (default: 300)
 *   --vnc-host <host>              VNC host (default: 127.0.0.1)
 *   --vnc-port <port>              VNC port (default: 5900)
 *   --proxy-port <port>            Local proxy port (default: auto)
 */

import type { Command } from "commander";
import * as path from "node:path";
import * as os from "node:os";
import * as child_process from "node:child_process";
import { startSession } from "../src/session-manager.js";
import { sendTelegramMessage } from "../src/tg-notify.js";
import { enableMacOsVnc } from "../src/macos-vnc.js";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
const SEND_ALERT_BIN = path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "send-alert");
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

export interface CliContext {
  program: Command;
  logger: { info(m: string): void; warn(m: string): void; error(m: string): void };
}

export interface HumanConfig {
  tgBotToken: string;
  tgChatId: string | number;
  vncHost: string;
  vncPort: number;
  proxyPort?: number;
  defaultTimeout: number;
}

export function registerHumanCommands(ctx: CliContext, cfg: HumanConfig): void {
  const { program, logger } = ctx;

  const cmd = program
    .command("mc-human")
    .description("Ask-a-human — deliver interactive session to Michael for unblocking");

  cmd
    .command("ask <reason>")
    .description("Block until Michael closes the noVNC session or timeout elapses")
    .option("--via <method>", "Delivery method: tg|email|both|none", "tg")
    .option("--timeout <seconds>", "Session timeout in seconds", String(cfg.defaultTimeout))
    .option("--vnc-host <host>", "VNC server host", cfg.vncHost)
    .option("--vnc-port <port>", "VNC server port", String(cfg.vncPort))
    .option("--proxy-port <port>", "Local HTTP proxy port (auto if omitted)")
    .action(async (reason: string, opts: Record<string, string>) => {
      const via = (opts["via"] as string) ?? "tg";
      const timeoutSec = parseInt(opts["timeout"] as string, 10);
      const vncHost = (opts["vncHost"] as string) ?? cfg.vncHost;
      const vncPort = parseInt((opts["vncPort"] as string) ?? String(cfg.vncPort), 10);
      const proxyPort = opts["proxyPort"] ? parseInt(opts["proxyPort"] as string, 10) : cfg.proxyPort;
      const timeoutMs = (isNaN(timeoutSec) ? cfg.defaultTimeout : timeoutSec) * 1000;

      logger.info(`mc-human: ask — reason="${reason}" via=${via} timeout=${timeoutMs / 1000}s`);

      // 1. Try to enable macOS VNC if not running
      const vncReady = await enableMacOsVnc(vncHost, vncPort, logger);
      if (!vncReady) {
        console.error(
          `mc-human: VNC not available at ${vncHost}:${vncPort}.\n` +
          `Enable macOS Screen Sharing in System Settings → General → Sharing → Screen Sharing.`
        );
        process.exit(2);
      }

      // 2. Start session server
      let session;
      try {
        session = await startSession({
          reason,
          vncHost,
          vncPort,
          proxyPort: proxyPort ?? cfg.proxyPort ?? 4221,
          timeoutMs,
          logger,
        });
      } catch (err) {
        console.error(`mc-human: failed to start session server: ${err}`);
        process.exit(1);
      }

      const { url, waitForClose, shutdown } = session;
      logger.info(`mc-human: session URL: ${url}`);

      // 3. Deliver URL
      const message =
        `🖥️ *AM needs your help!*\n\n` +
        `*Reason:* ${reason}\n\n` +
        `[Open Remote Desktop Session](${url})\n\n` +
        `_Session expires in ${timeoutMs / 1000}s. Click "Done — Resume AM" when finished._`;

      if (via === "tg" || via === "both") {
        if (!cfg.tgBotToken || !cfg.tgChatId) {
          logger.warn("mc-human: Telegram not configured — skipping TG delivery");
          console.error("Warning: Telegram bot token or chat ID not configured.");
        } else {
          try {
            await sendTelegramMessage(cfg.tgBotToken, cfg.tgChatId, message);
            console.log(`mc-human: URL sent via Telegram to chat ${cfg.tgChatId}`);
            logger.info(`mc-human: Telegram message sent to ${cfg.tgChatId}`);
          } catch (err) {
            logger.error(`mc-human: Telegram send failed: ${err}`);
            console.error(`Warning: Telegram delivery failed: ${err}`);
          }
        }
      }

      if (via === "email" || via === "both") {
        const emailTo = DEFAULT_EMAIL_TO;
        try {
          await sendEmail(emailTo, reason, url, timeoutMs / 1000);
          console.log(`mc-human: URL sent via email to ${emailTo}`);
          logger.info(`mc-human: email sent to ${emailTo}`);
        } catch (err) {
          logger.error(`mc-human: email send failed: ${err}`);
          console.error(`Warning: email delivery failed: ${err}`);
        }
      }

      if (via === "none") {
        // No delivery — just log the URL so it appears in agent output
        console.log(`mc-human: session URL (no delivery): ${url}`);
      }

      if (via !== "tg" && via !== "both" && via !== "none" && via !== "email") {
        console.log(`mc-human: session URL: ${url}`);
      }

      console.log(`mc-human: waiting for human to close session (timeout: ${timeoutMs / 1000}s)…`);

      // 4. Block until done or timeout
      process.on("SIGINT", () => { shutdown(); });
      process.on("SIGTERM", () => { shutdown(); });

      try {
        await waitForClose();
        console.log("mc-human: human closed session — resuming");
        process.exit(0);
      } catch (err) {
        console.error(`mc-human: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  // Health check subcommand
  cmd
    .command("status")
    .description("Check if VNC is reachable")
    .option("--vnc-host <host>", "VNC server host", cfg.vncHost)
    .option("--vnc-port <port>", "VNC server port", String(cfg.vncPort))
    .action(async (opts: Record<string, string>) => {
      const vncHost = (opts["vncHost"] as string) ?? cfg.vncHost;
      const vncPort = parseInt((opts["vncPort"] as string) ?? String(cfg.vncPort), 10);
      const ok = await enableMacOsVnc(vncHost, vncPort, logger);
      if (ok) {
        console.log(`mc-human: VNC reachable at ${vncHost}:${vncPort} ✓`);
        process.exit(0);
      } else {
        console.log(`mc-human: VNC NOT reachable at ${vncHost}:${vncPort} ✗`);
        process.exit(1);
      }
    });
}
