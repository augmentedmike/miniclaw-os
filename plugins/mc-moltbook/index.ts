import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { resolveConfig } from "./src/config.js";
import { registerMoltbookCommands } from "./cli/commands.js";
import { createMoltbookTools } from "./tools/definitions.js";

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig((api.pluginConfig ?? {}) as Record<string, unknown>);

  api.logger.info(`mc-moltbook loaded (api=${cfg.apiUrl})`);

  api.registerCli((ctx) => {
    registerMoltbookCommands({ program: ctx.program, logger: api.logger }, cfg);
  });

  for (const tool of createMoltbookTools(cfg, api.logger)) {
    api.registerTool(tool);
  }
}
