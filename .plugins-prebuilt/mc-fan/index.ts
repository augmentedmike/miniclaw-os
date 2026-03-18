import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerFanCommands } from "./cli/commands.js";
import { createFanTools } from "./tools/definitions.js";

export default function register(api: OpenClawPluginApi): void {
  api.logger.info("mc-fan loaded");

  // Inject fan context when card is tagged for fan/social/engagement work.
  if (typeof api.hook === "function") api.hook("before_prompt_build", (ctx) => {
    const tags = (ctx as Record<string, unknown>).tags as string[] | undefined;
    if (!tags || !tags.some((t) => ["fan", "social", "engagement", "content", "networking"].includes(t))) return {};
    return {
      prepend:
        `## Fan Context\n` +
        `mc-fan tools available: fan_add, fan_list, fan_remove, fan_check, fan_engage, fan_digest, fan_status.\n` +
        `Use fan_check to see latest content from people we follow. Use fan_engage to log authentic engagement.\n` +
        `Engagement rules: never spammy or sycophantic. Be genuine, intellectual, and add value.\n`,
    };
  });

  api.registerCli((ctx) => {
    registerFanCommands({ program: ctx.program, logger: api.logger });
  });

  for (const tool of createFanTools(api.logger)) {
    api.registerTool(tool);
  }
}
