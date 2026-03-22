/**
 * mc-transduck — OpenClaw plugin
 *
 * AI translation framework for MiniClaw i18n.
 * Wraps the transduck library for translating strings, warming caches,
 * and managing translations across miniclaw-os plugins.
 */

import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolvePluginConfig, type TransduckPluginConfig } from "./src/client.js";
import { registerTransduckCommands } from "./cli/commands.js";
import { createTransduckTools } from "./tools/definitions.js";

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveConfig(api: OpenClawPluginApi): TransduckPluginConfig {
  const raw = (api.pluginConfig ?? {}) as Partial<TransduckPluginConfig>;
  return resolvePluginConfig({
    dbDir: raw.dbDir ? resolvePath(raw.dbDir) : undefined,
    provider: raw.provider,
    apiKeyEnv: raw.apiKeyEnv,
    defaultSourceLang: raw.defaultSourceLang,
    defaultTargetLangs: raw.defaultTargetLangs,
    backendModel: raw.backendModel,
  });
}

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);
  api.logger.info(`mc-transduck loading (dbDir=${cfg.dbDir})`);

  // Register CLI commands
  api.registerCli((ctx) => {
    registerTransduckCommands(
      { program: ctx.program, logger: api.logger },
      cfg,
    );
  });

  // Register agent tools
  for (const tool of createTransduckTools(cfg, api.logger)) {
    api.registerTool(tool);
  }

  api.logger.info("mc-transduck loaded");
}
