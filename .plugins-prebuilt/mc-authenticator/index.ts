import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveConfig } from "./src/config.js";
import { registerAuthCommands } from "./cli/commands.js";
import { createAuthTools } from "./tools/definitions.js";

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig((api.pluginConfig ?? {}) as Record<string, unknown>);

  api.logger.info("mc-authenticator loaded");

  api.registerCli((ctx) => {
    registerAuthCommands({ program: ctx.program, cfg, logger: api.logger });
  });

  for (const tool of createAuthTools(cfg)) {
    api.registerTool(tool);
  }
}
