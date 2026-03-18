import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveConfig } from "./src/config.js";
import { registerContributeCommands } from "./cli/commands.js";
import { createContributeTools } from "./tools/definitions.js";
import { CONTRIBUTION_GUIDELINES } from "./src/guidelines.js";

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig((api.pluginConfig ?? {}) as Record<string, unknown>);

  api.logger.info(`mc-contribute loaded (upstream: ${cfg.upstreamRepo})`);

  // Inject contribution guidelines into every prompt when working
  // in the miniclaw-os repo — so the agent always knows the rules.
  if (typeof api.hook === "function") api.hook("before_prompt_build", (_ctx) => {
    return {
      prepend:
        `## MiniClaw Contribution Context\n` +
        `You are working in the miniclaw-os repo. ` +
        `Use the contribute_guidelines tool if you need the full rules. ` +
        `Key rules: one plugin one job, TypeScript, no hardcoded secrets, ` +
        `run security check before committing, branch as contrib/<topic>.\n`,
    };
  });

  api.registerCli((ctx) => {
    registerContributeCommands({ program: ctx.program, logger: api.logger }, cfg);
  });

  for (const tool of createContributeTools(cfg, api.logger)) {
    api.registerTool(tool);
  }
}
