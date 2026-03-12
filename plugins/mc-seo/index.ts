/**
 * mc-seo — OpenClaw plugin
 *
 * SEO automation: site crawl, on-page audit with scoring, rank checking,
 * sitemap submission, and outreach/backlink tracking.
 *
 * Usage:
 *   mc mc-seo check https://helloam.bot
 *   mc mc-seo crawl https://miniclaw.bot
 *   mc mc-seo rank helloam.bot 'helloam'
 *   mc mc-seo rank-all helloam.bot
 *   mc mc-seo ping https://helloam.bot/sitemap.xml
 *   mc mc-seo track-add --domain helloam.bot --service Futurepedia --status submitted
 *   mc mc-seo track-list
 *   mc mc-seo board helloam.bot
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { resolveConfig } from "./src/config.js";
import { registerSeoCommands } from "./cli/commands.js";
import { createSeoTools } from "./tools/definitions.js";

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig((api.pluginConfig ?? {}) as Record<string, unknown>);

  const domainCount = Object.keys(cfg.domains).length;
  api.logger.info(
    `mc-seo loaded (domains=${domainCount} indexNow=${!!cfg.indexNowKey} googleApi=${!!cfg.googleSearchApiKey})`
  );

  api.registerCli((ctx) => {
    registerSeoCommands({ program: ctx.program, logger: api.logger }, cfg);
  });

  for (const tool of createSeoTools(cfg, api.logger)) {
    api.registerTool(tool);
  }
}
