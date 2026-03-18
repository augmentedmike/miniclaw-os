import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { engagementLogPath, targetReposPath, readJsonArray, writeJsonArray } from "../shared.js";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

interface SocialConfig {
  targetListKbId?: string;
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text: text.trim() }], details: {} };
}

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf-8", timeout: 30_000 }).trim();
}

export function createSocialTools(cfg: SocialConfig, logger: Logger): AnyAgentTool[] {
  return [
    // ── Scan a repo for contribution opportunities ────────────────────
    {
      name: "social_scan_opportunities",
      label: "social_scan_opportunities",
      description:
        "Scan a GitHub repo for contribution opportunities — issues labeled 'good first issue' or 'help wanted', and recent discussions.",
      parameters: {
        type: "object",
        required: ["repo"],
        properties: {
          repo: { type: "string", description: "Repository in owner/name format" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const repo = p.repo;
        const parts: string[] = [];

        // Fetch issues with contribution-friendly labels
        try {
          const issues = run("gh", [
            "issue", "list",
            "--repo", repo,
            "--label", "good first issue,help wanted",
            "--state", "open",
            "--limit", "10",
          ]);
          parts.push(`## Open Issues (good first issue / help wanted)\n${issues || "None found"}`);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          parts.push(`## Open Issues\nFailed to fetch: ${e.stderr || "unknown error"}`);
        }

        // Fetch documentation issues separately
        try {
          const docIssues = run("gh", [
            "issue", "list",
            "--repo", repo,
            "--label", "documentation",
            "--state", "open",
            "--limit", "10",
          ]);
          parts.push(`## Documentation Issues\n${docIssues || "None found"}`);
        } catch {
          // documentation label may not exist — that's fine
        }

        // Fetch recent discussions via GraphQL (REST endpoint doesn't exist for discussions)
        try {
          const [owner, name] = repo.split("/");
          const query = `query($owner: String!, $name: String!) {
            repository(owner: $owner, name: $name) {
              discussions(first: 5, orderBy: {field: CREATED_AT, direction: DESC}) {
                nodes { title url createdAt }
              }
            }
          }`;
          const result = run("gh", [
            "api", "graphql",
            "-f", `query=${query}`,
            "-f", `owner=${owner}`,
            "-f", `name=${name}`,
          ]);
          const parsed = JSON.parse(result) as {
            data: { repository: { discussions: { nodes: Array<{ title: string; url: string; createdAt: string }> } } };
          };
          const nodes = parsed.data.repository.discussions.nodes;
          if (nodes.length > 0) {
            const lines = nodes.map(
              (d) => `- ${d.title} (${d.createdAt}) — ${d.url}`
            );
            parts.push(`## Recent Discussions\n${lines.join("\n")}`);
          } else {
            parts.push(`## Recent Discussions\nNone found`);
          }
        } catch {
          parts.push(`## Recent Discussions\nNot available (repo may not have discussions enabled)`);
        }

        logger.info(`Scanned opportunities for ${repo}`);
        return ok(parts.join("\n\n"));
      },
    } as AnyAgentTool,

    // ── Star a repo ───────────────────────────────────────────────────
    {
      name: "social_star_repo",
      label: "social_star_repo",
      description:
        "Star a GitHub repository.",
      parameters: {
        type: "object",
        required: ["repo"],
        properties: {
          repo: { type: "string", description: "Repository in owner/name format" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const repo = p.repo;
        try {
          run("gh", ["api", "-X", "PUT", `user/starred/${repo}`]);
          logger.info(`Starred ${repo}`);
          return ok(`Starred ${repo}`);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to star ${repo}: ${e.stderr || "unknown error"}`);
        }
      },
    } as AnyAgentTool,

    // ── Create an issue on an external repo ───────────────────────────
    {
      name: "social_create_issue",
      label: "social_create_issue",
      description:
        "Create an issue on any GitHub repository.",
      parameters: {
        type: "object",
        required: ["repo", "title", "body"],
        properties: {
          repo: { type: "string", description: "Repository in owner/name format" },
          title: { type: "string", description: "Issue title" },
          body: { type: "string", description: "Issue body (markdown)" },
          labels: { type: "string", description: "Comma-separated labels" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const tmpFile = path.join(os.tmpdir(), `mc-social-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
        try {
          fs.writeFileSync(tmpFile, p.body, "utf-8");
          const args = ["issue", "create", "--repo", p.repo, "--title", p.title, "--body-file", tmpFile];
          if (p.labels) args.push("--label", p.labels);
          const url = run("gh", args);
          logger.info(`Issue created on ${p.repo}: ${url}`);
          return ok(`Issue created: ${url}`);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to create issue on ${p.repo}: ${e.stderr || "unknown error"}`);
        } finally {
          try { fs.unlinkSync(tmpFile); } catch {}
        }
      },
    } as AnyAgentTool,

    // ── Comment on a GitHub Discussion ────────────────────────────────
    {
      name: "social_create_discussion_comment",
      label: "social_create_discussion_comment",
      description:
        "Comment on a GitHub Discussion using the GraphQL API.",
      parameters: {
        type: "object",
        required: ["repo", "discussionNumber", "body"],
        properties: {
          repo: { type: "string", description: "Repository in owner/name format" },
          discussionNumber: { type: "number", description: "Discussion number" },
          body: { type: "string", description: "Comment body (markdown)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const repo = p.repo as string;
        const discussionNumber = Number(p.discussionNumber);
        const body = p.body as string;
        const [owner, name] = repo.split("/");

        try {
          // First, get the discussion node ID — use -f variables to prevent injection
          const lookupQuery = `query($owner: String!, $name: String!, $number: Int!) {
            repository(owner: $owner, name: $name) {
              discussion(number: $number) {
                id
              }
            }
          }`;
          const result = run("gh", [
            "api", "graphql",
            "-f", `query=${lookupQuery}`,
            "-f", `owner=${owner}`,
            "-f", `name=${name}`,
            "-F", `number=${discussionNumber}`,
          ]);
          const parsed = JSON.parse(result) as {
            data: { repository: { discussion: { id: string } } };
          };
          const discussionId = parsed.data.repository.discussion.id;

          // Then, add the comment — use -f variables for body to prevent injection
          const addCommentMutation = `mutation($discussionId: ID!, $body: String!) {
            addDiscussionComment(input: { discussionId: $discussionId, body: $body }) {
              comment {
                url
              }
            }
          }`;
          const commentResult = run("gh", [
            "api", "graphql",
            "-f", `query=${addCommentMutation}`,
            "-f", `discussionId=${discussionId}`,
            "-f", `body=${body}`,
          ]);
          const commentParsed = JSON.parse(commentResult) as {
            data: { addDiscussionComment: { comment: { url: string } } };
          };
          const url = commentParsed.data.addDiscussionComment.comment.url;
          logger.info(`Discussion comment on ${repo}#${discussionNumber}: ${url}`);
          return ok(`Comment added: ${url}`);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to comment on discussion ${repo}#${discussionNumber}: ${e.stderr || "unknown error"}`);
        }
      },
    } as AnyAgentTool,

    // ── Log an engagement action ──────────────────────────────────────
    {
      name: "social_log_engagement",
      label: "social_log_engagement",
      description:
        "Log a social engagement action to the local engagement log.",
      parameters: {
        type: "object",
        required: ["repo", "action", "url", "description"],
        properties: {
          repo: { type: "string", description: "Repository in owner/name format" },
          action: {
            type: "string",
            enum: ["star", "issue", "pr", "comment", "discussion"],
            description: "Type of engagement action",
          },
          url: { type: "string", description: "URL link to the action" },
          description: { type: "string", description: "Brief description of the engagement" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const logFile = engagementLogPath();
        const log = readJsonArray(logFile);
        const entry = {
          repo: p.repo,
          action: p.action,
          url: p.url,
          description: p.description,
          timestamp: new Date().toISOString(),
        };
        log.push(entry);
        writeJsonArray(logFile, log);
        logger.info(`Engagement logged: ${p.action} on ${p.repo}`);
        return ok(`Engagement logged: ${p.action} on ${p.repo} — ${p.description}`);
      },
    } as AnyAgentTool,

    // ── Engagement metrics ────────────────────────────────────────────
    {
      name: "social_metrics",
      label: "social_metrics",
      description:
        "Read the engagement log and return summary metrics — total actions, by type, by repo, and this week.",
      parameters: {
        type: "object",
        required: [],
        properties: {},
      },
      async execute(_id: string, _params: unknown) {
        const logFile = engagementLogPath();
        const log = readJsonArray(logFile) as Array<{
          repo: string;
          action: string;
          url: string;
          description: string;
          timestamp: string;
        }>;

        if (log.length === 0) {
          return ok("No engagement activity logged yet.");
        }

        const total = log.length;

        // By type
        const byType: Record<string, number> = {};
        for (const entry of log) {
          byType[entry.action] = (byType[entry.action] || 0) + 1;
        }

        // By repo
        const byRepo: Record<string, number> = {};
        for (const entry of log) {
          byRepo[entry.repo] = (byRepo[entry.repo] || 0) + 1;
        }

        // This week
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const thisWeek = log.filter((e) => new Date(e.timestamp) >= oneWeekAgo).length;

        const lines: string[] = [
          `## Engagement Metrics`,
          `**Total actions:** ${total}`,
          `**This week:** ${thisWeek}`,
          ``,
          `### By Type`,
          ...Object.entries(byType)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => `- ${type}: ${count}`),
          ``,
          `### By Repo`,
          ...Object.entries(byRepo)
            .sort((a, b) => b[1] - a[1])
            .map(([repo, count]) => `- ${repo}: ${count}`),
        ];

        return ok(lines.join("\n"));
      },
    } as AnyAgentTool,

    // ── Referral traffic from GitHub ──────────────────────────────────
    {
      name: "social_traffic",
      label: "social_traffic",
      description:
        "Fetch GitHub traffic data (views, clones, referrers) for a repo you own. Requires push access.",
      parameters: {
        type: "object",
        required: ["repo"],
        properties: {
          repo: { type: "string", description: "Repository in owner/name format (must have push access)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const repo = p.repo;
        const parts: string[] = [`## Traffic for ${repo}`];

        // Views
        try {
          const views = run("gh", ["api", `repos/${repo}/traffic/views`]);
          const v = JSON.parse(views) as { count: number; uniques: number; views: Array<{ timestamp: string; count: number; uniques: number }> };
          parts.push(`\n### Page Views (last 14 days)\n**Total:** ${v.count} views, ${v.uniques} unique visitors`);
          if (v.views?.length) {
            const recent = v.views.slice(-7);
            for (const day of recent) {
              const date = new Date(day.timestamp).toLocaleDateString();
              parts.push(`- ${date}: ${day.count} views (${day.uniques} unique)`);
            }
          }
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          parts.push(`\n### Page Views\nFailed: ${e.stderr || "unknown error (need push access)"}`);
        }

        // Clones
        try {
          const clones = run("gh", ["api", `repos/${repo}/traffic/clones`]);
          const c = JSON.parse(clones) as { count: number; uniques: number };
          parts.push(`\n### Clones (last 14 days)\n**Total:** ${c.count} clones, ${c.uniques} unique`);
        } catch {
          parts.push(`\n### Clones\nNot available`);
        }

        // Top referrers
        try {
          const referrers = run("gh", ["api", `repos/${repo}/traffic/popular/referrers`]);
          const refs = JSON.parse(referrers) as Array<{ referrer: string; count: number; uniques: number }>;
          if (refs.length > 0) {
            parts.push(`\n### Top Referrers`);
            for (const r of refs) {
              parts.push(`- **${r.referrer}**: ${r.count} views (${r.uniques} unique)`);
            }
          } else {
            parts.push(`\n### Top Referrers\nNo referral data yet`);
          }
        } catch {
          parts.push(`\n### Top Referrers\nNot available`);
        }

        // Top paths
        try {
          const paths = run("gh", ["api", `repos/${repo}/traffic/popular/paths`]);
          const ps = JSON.parse(paths) as Array<{ path: string; title: string; count: number; uniques: number }>;
          if (ps.length > 0) {
            parts.push(`\n### Popular Content`);
            for (const pg of ps.slice(0, 10)) {
              parts.push(`- ${pg.path}: ${pg.count} views (${pg.uniques} unique)`);
            }
          }
        } catch {
          // optional
        }

        logger.info(`Fetched traffic for ${repo}`);
        return ok(parts.join("\n"));
      },
    } as AnyAgentTool,

    // ── List target repos ─────────────────────────────────────────────
    {
      name: "social_list_targets",
      label: "social_list_targets",
      description:
        "List all target repos from the local target repos file.",
      parameters: {
        type: "object",
        required: [],
        properties: {},
      },
      async execute(_id: string, _params: unknown) {
        const targetsFile = targetReposPath();
        const targets = readJsonArray(targetsFile) as Array<{
          repo: string;
          category: string;
          stars: number;
          notes: string;
          added?: string;
          addedAt?: string;
        }>;

        if (targets.length === 0) {
          return ok("No target repos configured yet. Use social_add_target to add repos.");
        }

        const lines: string[] = [`## Target Repos (${targets.length})`];
        const byCategory: Record<string, typeof targets> = {};
        for (const t of targets) {
          const cat = t.category || "uncategorized";
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(t);
        }

        for (const [category, repos] of Object.entries(byCategory).sort()) {
          lines.push(`\n### ${category}`);
          for (const r of repos) {
            lines.push(`- **${r.repo}** (${r.stars?.toLocaleString() ?? "?"} stars) — ${r.notes || "no notes"}`);
          }
        }

        return ok(lines.join("\n"));
      },
    } as AnyAgentTool,

    // ── Add a target repo ─────────────────────────────────────────────
    {
      name: "social_add_target",
      label: "social_add_target",
      description:
        "Add a repo to the social engagement target list.",
      parameters: {
        type: "object",
        required: ["repo", "category"],
        properties: {
          repo: { type: "string", description: "Repository in owner/name format" },
          category: {
            type: "string",
            enum: ["agent-framework", "plugin-system", "cli-tool", "ai-dev-tool", "ai-platform", "mcp-ecosystem", "workflow"],
            description: "Category for the target repo",
          },
          stars: { type: "number", description: "Approximate star count" },
          notes: { type: "string", description: "Notes about engagement opportunity" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const targetsFile = targetReposPath();
        const targets = readJsonArray(targetsFile);

        // Check for duplicates
        const existing = targets as Array<{ repo: string }>;
        if (existing.some((t) => t.repo === p.repo)) {
          return ok(`Target repo ${p.repo} is already in the list.`);
        }

        const entry = {
          repo: p.repo as string,
          category: p.category as string,
          stars: (p.stars as number) || 0,
          notes: (p.notes as string) || "",
          added: new Date().toISOString().slice(0, 10),
        };
        targets.push(entry);
        writeJsonArray(targetsFile, targets);
        logger.info(`Target added: ${p.repo} (${p.category})`);
        return ok(`Target repo added: ${p.repo} (${p.category})`);
      },
    } as AnyAgentTool,
  ];
}
