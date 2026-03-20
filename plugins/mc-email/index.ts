import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveConfig } from "./src/config.js";
import { getAppPassword } from "./src/vault.js";
import { ensureHimalayaConfig } from "./src/himalaya.js";
import { registerEmailCommands } from "./cli/commands.js";

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig((api.pluginConfig ?? {}) as Record<string, unknown>);

  const hasPassword = !!getAppPassword(cfg.vaultBin);
  if (hasPassword) {
    // Ensure himalaya config exists on load
    try { ensureHimalayaConfig(cfg); } catch { /* non-fatal */ }
    api.logger.info(`mc-email loaded (email=${cfg.emailAddress}, backend=himalaya, auth=ok)`);
  } else {
    api.logger.warn(`mc-email loaded — no app password yet. Run: mc mc-email auth`);
  }

  api.registerCli((ctx) => {
    registerEmailCommands({ program: ctx.program, cfg, logger: api.logger });
  });
}
