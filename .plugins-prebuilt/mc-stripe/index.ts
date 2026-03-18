import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveConfig } from "./src/config.js";
import { getStripeSecretKey } from "./src/vault.js";
import { registerStripeCommands } from "./cli/commands.js";
import { createStripeTools } from "./tools/definitions.js";

export { getStripeClient } from "./src/client.js";

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig((api.pluginConfig ?? {}) as Record<string, unknown>);

  const hasKey = !!getStripeSecretKey(cfg.vaultBin);
  if (hasKey) {
    api.logger.info("mc-stripe loaded (auth=ok)");
  } else {
    api.logger.warn("mc-stripe loaded — no secret key yet. Run: mc mc-stripe setup");
  }

  api.registerCli((ctx) => {
    registerStripeCommands({ program: ctx.program, cfg, logger: api.logger });
  });

  for (const tool of createStripeTools(cfg)) {
    api.registerTool(tool);
  }
}
