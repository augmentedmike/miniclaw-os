/**
 * mc-human — OpenClaw plugin
 *
 * Ask-a-human: deliver an interactive noVNC browser session to Michael when
 * AM hits captchas, login flows, or any UI it cannot automate.
 *
 * Usage:
 *   openclaw mc-human ask "solve CAPTCHA on login page" --timeout 300
 *   openclaw mc-human status
 *
 * Agent tool:
 *   ask_human({ reason: "...", timeout_seconds: 300, via: "tg" })
 */

import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerHumanCommands, type HumanConfig } from "./cli/commands.js";
import { createHumanTools } from "./tools/definitions.js";

interface RawConfig {
  tgBotToken?: string;
  tgChatId?: string | number;
  vncHost?: string;
  vncPort?: number;
  proxyPort?: number;
  defaultTimeout?: number;
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveConfig(api: OpenClawPluginApi): HumanConfig {
  const raw = (api.pluginConfig ?? {}) as RawConfig;

  // Fall back to the global Telegram channel config
  const globalTg = (api as unknown as Record<string, unknown>)?.["globalConfig"]?.["channels"]?.["telegram"] as Record<string, unknown> | undefined;

  let tgBotToken = raw.tgBotToken
    ?? (globalTg?.["botToken"] as string | undefined)
    ?? "";

  let tgChatId: string | number = raw.tgChatId
    ?? (globalTg?.["allowFrom"] as Array<string | number> | undefined)?.[0]
    ?? "";

  // Fall back to reading openclaw.json directly if SDK doesn't expose global TG config
  if (!tgBotToken) {
    try {
      const ocPath = resolvePath("~/.openclaw/openclaw.json");
      const oc = JSON.parse(fs.readFileSync(ocPath, "utf-8")) as Record<string, unknown>;
      const tg = (oc?.["channels"] as Record<string, unknown>)?.["telegram"] as Record<string, unknown> | undefined;
      if (tg?.["botToken"]) tgBotToken = tg["botToken"] as string;
      const allowFrom = tg?.["allowFrom"] as Array<string | number> | undefined;
      if (allowFrom?.[0] !== undefined && !tgChatId) tgChatId = allowFrom[0];
    } catch {
      // ignore
    }
  }

  return {
    tgBotToken,
    tgChatId,
    vncHost: raw.vncHost ?? "127.0.0.1",
    vncPort: raw.vncPort ?? 5900,
    proxyPort: raw.proxyPort,
    defaultTimeout: raw.defaultTimeout ?? 300,
  };
}

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);

  api.logger.info(`mc-human loading (vncHost=${cfg.vncHost}:${cfg.vncPort} tgChat=${cfg.tgChatId})`);

  api.registerCli((ctx) => {
    registerHumanCommands({ program: ctx.program, logger: api.logger }, cfg);
  });

  for (const tool of createHumanTools(cfg, api.logger)) {
    api.registerTool(tool);
  }

  api.logger.info("mc-human loaded");
}
