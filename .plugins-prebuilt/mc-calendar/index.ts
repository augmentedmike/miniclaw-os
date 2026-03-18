import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveConfig } from "./src/config.js";
import { registerCalendarCommands } from "./cli/commands.js";
import { createCalendarTools } from "./tools/definitions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig((api.pluginConfig ?? {}) as Record<string, unknown>, __dirname);

  api.logger.info(`mc-calendar loaded (defaultCalendar=${cfg.defaultCalendar || "(auto)"})`);

  api.registerCli((ctx) => {
    registerCalendarCommands({ program: ctx.program, cfg, logger: api.logger });
  });

  for (const tool of createCalendarTools(cfg, api.logger)) {
    api.registerTool(tool);
  }
}
