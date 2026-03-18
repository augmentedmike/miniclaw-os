import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveConfig } from "./src/config.js";
import { registerVoiceCommands } from "./cli/commands.js";
import { createVoiceTools } from "./tools/definitions.js";

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig((api.pluginConfig ?? {}) as Record<string, unknown>);
  api.logger.info(`mc-voice loaded (model=${cfg.model}, lang=${cfg.language})`);

  api.registerCli((ctx) => {
    registerVoiceCommands({ program: ctx.program, cfg, logger: api.logger });
  });

  for (const tool of createVoiceTools(cfg, api.logger)) {
    api.registerTool(tool);
  }
}
