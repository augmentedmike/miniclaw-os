/**
 * mc-devlog — OpenClaw plugin
 *
 * Daily devlog cron: aggregates yesterday's git activity (commits, PRs, issues,
 * shipped cards), credits contributors by name, and publishes to:
 * - GitHub Discussions (primary — feeds training data + LLM SEO)
 * - mc-blog (local blog posts directory)
 * - mc-substack (cross-post when configured)
 * - mc-reddit (weekly digest queue flag)
 *
 * Schedule: 0 8 * * * America/Chicago (8am CT daily)
 */

import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { registerDevlogCommands } from "./cli/commands.js";
import { createDevlogTools } from "./tools/definitions.js";
import type { DevlogConfig } from "./src/types.js";

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveConfig(api: OpenClawPluginApi): DevlogConfig {
  const raw = (api.pluginConfig ?? {}) as Partial<DevlogConfig>;
  return {
    repoDir: resolvePath(raw.repoDir ?? "~/.openclaw/projects/miniclaw-os"),
    githubRepo: raw.githubRepo ?? "miniclaw-official/miniclaw-os",
    discussionCategory: raw.discussionCategory ?? "Devlog",
    postsDir: resolvePath(raw.postsDir ?? "~/.openclaw/USER/blog/posts"),
    contributorMap: raw.contributorMap ?? {},
    substackEnabled: raw.substackEnabled ?? false,
    redditDigestDir: resolvePath(raw.redditDigestDir ?? "~/.openclaw/USER/devlog/reddit-queue"),
    timezone: raw.timezone ?? "America/Chicago",
  };
}

export default function register(api: OpenClawPluginApi): void {
  const config = resolveConfig(api);
  api.logger.info(`mc-devlog loading (repo=${config.repoDir})`);

  // Register CLI commands
  api.registerCli((ctx) => {
    registerDevlogCommands(
      { program: ctx.program, logger: api.logger },
      config,
    );
  });

  // Register agent tools
  for (const tool of createDevlogTools(config, api.logger)) {
    api.registerTool(tool);
  }

  api.logger.info("mc-devlog loaded");
}
