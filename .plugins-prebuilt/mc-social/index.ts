import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerSocialCommands } from "./cli/commands.js";
import { createSocialTools } from "./tools/definitions.js";

interface SocialConfig {
  targetListKbId?: string;
}

export default function register(api: OpenClawPluginApi): void {
  const cfg = (api.pluginConfig ?? {}) as SocialConfig;

  api.logger.info(`mc-social loaded`);

  // Inject social engagement context only when card is tagged for social work.
  if (typeof api.hook === "function") api.hook("before_prompt_build", (ctx) => {
    const tags = (ctx as Record<string, unknown>).tags as string[] | undefined;
    if (!tags || !tags.some((t) => ["github", "social", "marketing", "growth"].includes(t))) return {};
    return {
      prepend:
        `## Social Engagement Context\n` +
        `mc-social tools available: social_list_targets, social_scan_opportunities, ` +
        `social_star_repo, social_create_issue, social_create_discussion_comment, ` +
        `social_log_engagement, social_metrics, social_traffic.\n`,
    };
  });

  api.registerCli((ctx) => {
    registerSocialCommands({ program: ctx.program, logger: api.logger });
  });

  for (const tool of createSocialTools(cfg, api.logger)) {
    api.registerTool(tool);
  }
}
