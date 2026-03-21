/**
 * mc-memo — OpenClaw plugin
 *
 * Short-term working memory for agent runs.
 * Per-card scratchpad: append timestamped notes to flat markdown files.
 * Prevents agents from repeating failed approaches within a card run.
 *
 * Memo dir: ~/.openclaw/miniclaw/USER/memos/<card_id>.md
 */

import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { registerMemoCommands } from "./cli/commands.js";
import { createMemoTools } from "./tools/definitions.js";

interface MemoConfig {
  memoDir: string;
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveConfig(api: OpenClawPluginApi): MemoConfig {
  const raw = (api.pluginConfig ?? {}) as Partial<MemoConfig>;
  return {
    memoDir: resolvePath(raw.memoDir ?? `~/.openclaw/miniclaw/USER/memos`),
  };
}

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);
  api.logger.info(`mc-memo loading (memoDir=${cfg.memoDir})`);

  api.registerCli((ctx) => {
    registerMemoCommands({ program: ctx.program, logger: api.logger }, cfg.memoDir);
  });

  for (const tool of createMemoTools(cfg.memoDir, api.logger)) {
    api.registerTool(tool);
  }

  api.logger.info("mc-memo loaded");
}
