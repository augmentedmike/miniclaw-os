/**
 * mc-blog — OpenClaw plugin
 *
 * Persona-driven blog writing engine. Produces journal entries, reflections,
 * and narrative posts written from the running agent's own perspective.
 *
 * Does NOT handle visual/comic generation — that's mc-comic.
 *
 * Data model:
 *   posts/<NNN>-<slug>.json        — post seed (metadata, arc, tags)
 *   posts/<NNN>-<slug>-body.md     — prose body (first-person, primary language)
 *   addendums/<NNN>-<slug>.json    — auto-generated grounding & self-analysis
 *
 * Integrates with:
 *   mc-soul   — character voice and identity
 *   mc-kb     — long-term knowledge for grounded references
 *   mc-memo   — session scratchpad to avoid repeating work
 *   mc-voice  — human's writing style (for mirroring awareness, not copying)
 */

import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerBlogCommands } from "./cli/commands.js";
import { createBlogTools } from "./tools/definitions.js";

interface BlogConfig {
  postsDir: string;
  addendumDir: string;
  voiceRulesPath: string | null;
  arcPlanPath: string | null;
  defaultAuthor: string;
  blogUrl: string | null;
  languages: string[];
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveConfig(api: OpenClawPluginApi): BlogConfig {
  const raw = (api.pluginConfig ?? {}) as Record<string, unknown>;
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
  const blogBase = path.join(stateDir, "user/blog");

  return {
    postsDir: resolvePath((raw.postsDir as string) ?? path.join(blogBase, "posts")),
    addendumDir: resolvePath((raw.addendumDir as string) ?? path.join(blogBase, "addendums")),
    voiceRulesPath: raw.voiceRulesPath ? resolvePath(raw.voiceRulesPath as string) : null,
    arcPlanPath: raw.arcPlanPath ? resolvePath(raw.arcPlanPath as string) : null,
    defaultAuthor: (raw.defaultAuthor as string) ?? "Agent",
    blogUrl: (raw.blogUrl as string) ?? null,
    languages: (raw.languages as string[]) ?? ["en"],
  };
}

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);
  api.logger.info(`mc-blog loading (postsDir=${cfg.postsDir})`);

  api.registerCli((ctx) => {
    registerBlogCommands({ program: ctx.program, logger: api.logger }, cfg);
  });

  for (const tool of createBlogTools(cfg, api.logger)) {
    api.registerTool(tool);
  }

  api.logger.info("mc-blog loaded");
}
