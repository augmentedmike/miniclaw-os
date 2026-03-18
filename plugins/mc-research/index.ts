/**
 * mc-research — OpenClaw plugin
 *
 * Competitive intelligence and deep research: Perplexity queries,
 * web search, competitor tracking, change detection, and reports.
 *
 * Usage:
 *   mc mc-research query 'How does Cursor compare to Windsurf?'
 *   mc mc-research search 'AI code editor market share 2026'
 *   mc mc-research watch add Cursor cursor.com
 *   mc mc-research watch list
 *   mc mc-research snapshot cursor.com
 *   mc mc-research report 'AI code editor competitive landscape'
 *   mc mc-research history
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { resolveConfig } from "./src/config.js";
import { registerResearchCommands } from "./cli/commands.js";
import { createResearchTools } from "./tools/definitions.js";

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig((api.pluginConfig ?? {}) as Record<string, unknown>);

  api.logger.info(
    `mc-research loaded (model=${cfg.perplexityModel} provider=${cfg.searchProvider} stateDir=${cfg.stateDir})`
  );

  api.registerCli((ctx) => {
    registerResearchCommands({ program: ctx.program, logger: api.logger }, cfg);
  });

  for (const tool of createResearchTools(cfg, api.logger)) {
    api.registerTool(tool);
  }
}
