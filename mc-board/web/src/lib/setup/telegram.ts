import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { vaultSet } from "@/lib/vault";
import { STATE_DIR, findBin } from "./constants";

export function normalizeBotId(username: string): string {
  return username.replace(/^@/, "").trim();
}

/**
 * Register the telegram channel with openclaw and store the bot token in vault.
 * The botId is written under `meta.botId` (NOT top-level) so openclaw config
 * validation doesn't reject it.
 */
export function configureGateway(botId: string, botToken: string, chatId?: string) {
  const configPath = path.join(STATE_DIR, "openclaw.json");
  let cfg: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch { /* start fresh */ }

  // Remove any botId from config — openclaw doesn't recognize it
  delete cfg.botId;
  const meta = (cfg.meta ?? {}) as Record<string, unknown>;
  delete meta.botId;
  cfg.meta = meta;

  // Set gateway mode to local
  const gw = (cfg.gateway ?? {}) as Record<string, unknown>;
  if (!gw.mode) gw.mode = "local";
  cfg.gateway = gw;

  // Configure telegram channel directly in openclaw.json
  const channels = (cfg.channels ?? {}) as Record<string, unknown>;
  channels.telegram = {
    enabled: true,
    botToken: botToken,
    dmPolicy: "pairing",
    groupPolicy: "allowlist",
    groupAllowFrom: chatId ? [chatId] : [],
    allowFrom: chatId ? [chatId] : [],
    streaming: "partial",
  };
  cfg.channels = channels;

  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n", "utf-8");

  // Also store the bot token in vault as backup
  const vaultResult = vaultSet("telegram-bot-token", botToken);
  if (!vaultResult.ok) {
    console.error("Vault write failed (non-fatal):", vaultResult.error);
  }

  // Register the telegram channel with openclaw
  const ocBin = findBin("openclaw");
  if (ocBin) {
    const addResult = spawnSync(ocBin, [
      "channels", "add",
      "--channel", "telegram",
      "--token", botToken,
      "--name", botId,
    ], { encoding: "utf-8", timeout: 15_000 });
    if (addResult.status !== 0) {
      console.error("openclaw channels add failed:", addResult.stderr);
    }
  }
}
