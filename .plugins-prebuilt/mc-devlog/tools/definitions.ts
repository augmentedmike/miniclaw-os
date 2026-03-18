/**
 * mc-devlog agent tools
 *
 * Tools available to OpenClaw agents for devlog operations.
 */

import type { Logger } from "openclaw/plugin-sdk";
import type { DevlogConfig } from "../src/types.js";
import { gatherAll } from "../src/gather.js";
import { formatDevlog } from "../src/format.js";
import { publishAll } from "../src/publish.js";

interface AnyAgentTool {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (params: Record<string, unknown>) => Promise<{
    content: Array<{ type: string; text: string }>;
    details?: Record<string, unknown>;
    isError?: boolean;
  }>;
}

export function createDevlogTools(config: DevlogConfig, logger: Logger): AnyAgentTool[] {
  return [
    {
      name: "devlog_preview",
      label: "Preview Devlog",
      description: "Gather yesterday's git activity and format a devlog preview without publishing",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      execute: async () => {
        try {
          const activity = gatherAll(config);
          const post = formatDevlog(activity, config);
          return {
            content: [{ type: "text", text: post.markdown }],
            details: {
              date: activity.date,
              commits: activity.commits.length,
              prs: activity.prs.length,
              issues: activity.issues.length,
              contributors: activity.contributors,
            },
          };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
        }
      },
    },
    {
      name: "devlog_publish",
      label: "Publish Devlog",
      description: "Gather yesterday's activity, format a devlog, and publish to all configured targets (GitHub Discussions, mc-blog, mc-substack, mc-reddit)",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
      execute: async () => {
        try {
          logger.info("devlog_publish: gathering and publishing...");
          const activity = gatherAll(config);

          if (activity.commits.length === 0 && activity.prs.length === 0 && activity.shippedCards.length === 0) {
            return {
              content: [{ type: "text", text: "No activity found for yesterday. Skipping devlog." }],
              details: { skipped: true },
            };
          }

          const post = formatDevlog(activity, config);
          const results = publishAll(post, config);

          const summary = results
            .map((r) => `${r.success ? "✓" : "✗"} ${r.target}: ${r.success ? (r.url ?? "ok") : (r.error ?? "failed")}`)
            .join("\n");

          return {
            content: [{ type: "text", text: `${post.markdown}\n\n--- Publish Results ---\n${summary}` }],
            details: {
              results: results.map((r) => ({ target: r.target, success: r.success })),
            },
          };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
        }
      },
    },
  ];
}
