/**
 * mc-trust — OpenClaw plugin
 *
 * Agent identity and mutual authentication via Ed25519 key pairs.
 * Each agent generates a purpose-built signing key (never used for web/TLS).
 * Private keys live in vault (age-encrypted). Public keys in a trust store.
 * Handshake: 3-step mutual challenge-response.
 */

import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerTrustCommands } from "./cli/commands.js";
import { trustTools } from "./tools/definitions.js";
import { loadSession } from "./src/handshake.js";
import { listPeers } from "./src/keys.js";

interface TrustConfig {
  agentId: string;
  trustDir: string;
  vaultBin: string;
  sessionTtlMs: number;
}

function resolveConfig(api: OpenClawPluginApi): TrustConfig {
  const raw = (api.pluginConfig ?? {}) as Partial<TrustConfig>;
  return {
    agentId:      raw.agentId ?? "am",
    trustDir:     resolvePath(raw.trustDir ?? "~/.openclaw/trust"),
    vaultBin:     resolvePath(raw.vaultBin ?? "~/.openclaw/miniclaw/SYSTEM/bin/miniclaw-vault"),
    sessionTtlMs: raw.sessionTtlMs ?? 3_600_000, // 1 hour default
  };
}

function resolvePath(p: string): string {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);

  api.logger.info(`mc-trust loaded (agentId=${cfg.agentId}, trustDir=${cfg.trustDir})`);

  // ---- CLI ----
  api.registerCli((ctx) => {
    registerTrustCommands({
      program: ctx.program,
      agentId: cfg.agentId,
      trustDir: cfg.trustDir,
      vaultBin: cfg.vaultBin,
      sessionTtlMs: cfg.sessionTtlMs,
      logger: api.logger,
    });
  });

  // ---- Agent tools ----
  for (const tool of trustTools) {
    api.registerTool(tool);
  }

  // ---- Context hook: inject trust status into every prompt ----
  api.on("before_prompt_build", async () => {
    try {
      const peers = listPeers(cfg.trustDir).filter(id => id !== cfg.agentId);
      if (peers.length === 0) return;

      const lines: string[] = [];
      for (const peer of peers) {
        const session = loadSession(cfg.trustDir, peer);
        if (session) {
          const ttl = Math.round((session.expiresAt - Date.now()) / 60_000);
          lines.push(`  ✓ ${peer} — verified (session expires in ${ttl}m)`);
        } else {
          lines.push(`  ○ ${peer} — no active session (run: openclaw trust challenge ${peer})`);
        }
      }

      const ctx = `[Trust Status]\n${lines.join("\n")}`;
      return { prependContext: ctx };
    } catch {
      return;
    }
  });
}
