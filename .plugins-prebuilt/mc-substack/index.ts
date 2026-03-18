import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveConfig } from "./src/config.js";
import { readCookieFromVault } from "./src/vault.js";
import { registerSubstackCommands } from "./cli/commands.js";

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig((api.pluginConfig ?? {}) as Record<string, unknown>);

  const hasCookie = !!readCookieFromVault(cfg.vaultBin);
  if (hasCookie) {
    api.logger.info(`mc-substack loaded (subdomain=${cfg.subdomain}, auth=ok)`);
  } else {
    api.logger.warn(`mc-substack loaded — no auth cookie yet. Run: mc mc-substack auth`);
  }

  api.registerCli((ctx) => {
    registerSubstackCommands({ program: ctx.program, cfg, logger: api.logger });
  });
}
