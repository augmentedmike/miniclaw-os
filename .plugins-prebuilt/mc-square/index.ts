import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveConfig } from "./src/config.js";
import { getSquareAccessToken } from "./src/vault.js";
import { registerSquareCommands } from "./cli/commands.js";
import { createSquareTools } from "./tools/definitions.js";

export { SquareClient } from "./src/client.js";

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig((api.pluginConfig ?? {}) as Record<string, unknown>);

  const hasToken = !!getSquareAccessToken(cfg.vaultBin);
  if (hasToken) {
    api.logger.info(`mc-square loaded (env=${cfg.environment}, auth=ok)`);
  } else {
    api.logger.warn("mc-square loaded — no access token yet. Run: mc mc-square setup");
  }

  api.registerCli((ctx) => {
    registerSquareCommands({ program: ctx.program, cfg, logger: api.logger });
  });

  for (const tool of createSquareTools(cfg)) {
    api.registerTool(tool);
  }
}
