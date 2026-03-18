import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { execFileSync } from "child_process";
import {
  readFanRegistry,
  writeFanRegistry,
  readEngagementLog,
  addEngagement,
  addFan,
  removeFan,
  getFanById,
  type Fan,
  type EngagementLog,
} from "../shared.js";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

function ok(text: string) {
  return { content: [{ type: "text" as const, text: text.trim() }], details: {} };
}

function run(cmd: string, args: string[], timeout = 30_000): string {
  return execFileSync(cmd, args, { encoding: "utf-8", timeout }).trim();
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function createFanTools(logger: Logger): AnyAgentTool[] {
  return [
    // ── Add a fan ───────────────────────────────────────────────────
    {
      name: "fan_add",
      label: "fan_add",
      description:
        "Add a person, agent, or project to the fan registry — someone the agent follows and admires.",
      parameters: {
        type: "object",
        required: ["name", "platform", "urls", "whyWeFollow", "engagementStyle"],
        properties: {
          name: { type: "string", description: "Name of the person/project" },
          platform: {
            type: "string",
            enum: ["youtube", "github", "twitter", "blog", "other"],
            description: "Primary platform",
          },
          urls: {
            type: "array",
            items: { type: "string" },
            description: "URLs to follow (channel, profile, repo, etc.)",
          },
          whyWeFollow: { type: "string", description: "Why we follow this person/project" },
          engagementStyle: {
            type: "string",
            enum: ["intellectual-peer", "mentor", "collaborator", "friend", "inspiration"],
            description: "How we engage with their content",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "Tags for categorization",
          },
          notes: { type: "string", description: "Additional notes" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const fan: Fan = {
          id: slugify(p.name as string),
          name: p.name as string,
          platform: p.platform as Fan["platform"],
          urls: (p.urls as string[]) || [],
          whyWeFollow: p.whyWeFollow as string,
          engagementStyle: p.engagementStyle as Fan["engagementStyle"],
          tags: (p.tags as string[]) || [],
          addedAt: new Date().toISOString(),
          notes: (p.notes as string) || undefined,
        };
        addFan(fan);
        logger.info(`Fan added: ${fan.name} (${fan.platform})`);
        return ok(`Added fan: ${fan.name} (${fan.platform}) — ${fan.whyWeFollow}`);
      },
    } as AnyAgentTool,

    // ── List fans ───────────────────────────────────────────────────
    {
      name: "fan_list",
      label: "fan_list",
      description: "List all people, agents, and projects in the fan registry.",
      parameters: {
        type: "object",
        required: [],
        properties: {
          platform: {
            type: "string",
            enum: ["youtube", "github", "twitter", "blog", "other"],
            description: "Filter by platform",
          },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        let fans = readFanRegistry();
        if (p.platform) {
          fans = fans.filter((f) => f.platform === p.platform);
        }

        if (fans.length === 0) {
          return ok("No fans in the registry yet. Use fan_add to add someone.");
        }

        const lines: string[] = [`## Fan Registry (${fans.length})`];
        for (const fan of fans) {
          const lastChecked = fan.lastChecked
            ? `last checked ${new Date(fan.lastChecked).toLocaleDateString()}`
            : "never checked";
          lines.push(
            `\n### ${fan.name} (${fan.platform})`,
            `- **Why:** ${fan.whyWeFollow}`,
            `- **Style:** ${fan.engagementStyle}`,
            `- **URLs:** ${fan.urls.join(", ")}`,
            `- **Tags:** ${fan.tags.join(", ") || "none"}`,
            `- **Status:** ${lastChecked}`,
          );
          if (fan.notes) lines.push(`- **Notes:** ${fan.notes}`);
        }

        return ok(lines.join("\n"));
      },
    } as AnyAgentTool,

    // ── Remove a fan ────────────────────────────────────────────────
    {
      name: "fan_remove",
      label: "fan_remove",
      description: "Remove a person/project from the fan registry.",
      parameters: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Fan ID (slugified name)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const removed = removeFan(p.id);
        if (removed) {
          logger.info(`Fan removed: ${p.id}`);
          return ok(`Removed fan: ${p.id}`);
        }
        return ok(`Fan not found: ${p.id}`);
      },
    } as AnyAgentTool,

    // ── Check a fan's latest YouTube content ────────────────────────
    {
      name: "fan_check",
      label: "fan_check",
      description:
        "Check a fan's latest content. For YouTube fans, fetches recent videos and community posts using yt-dlp.",
      parameters: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Fan ID (slugified name)" },
          limit: { type: "number", description: "Max items to fetch (default 5)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const fanId = p.id as string;
        const limit = (p.limit as number) || 5;
        const fan = getFanById(fanId);

        if (!fan) {
          return ok(`Fan not found: ${fanId}`);
        }

        const parts: string[] = [`## Latest from ${fan.name}`];

        if (fan.platform === "youtube") {
          const ytUrl = fan.urls.find((u) => u.includes("youtube.com") || u.includes("youtu.be"));
          if (!ytUrl) {
            return ok(`No YouTube URL found for ${fan.name}`);
          }

          // Fetch recent videos using yt-dlp
          try {
            const videosRaw = run("yt-dlp", [
              "--flat-playlist",
              "--no-download",
              "--print", "%(title)s\t%(id)s\t%(upload_date)s\t%(duration_string)s",
              "--playlist-end", String(limit),
              `${ytUrl}/videos`,
            ], 60_000);

            if (videosRaw) {
              parts.push("\n### Recent Videos");
              for (const line of videosRaw.split("\n").filter(Boolean)) {
                const [title, vidId, date, duration] = line.split("\t");
                const dateFormatted = date
                  ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
                  : "unknown";
                parts.push(
                  `- **${title || "Untitled"}** (${dateFormatted}, ${duration || "?"})`,
                  `  https://youtube.com/watch?v=${vidId}`,
                );
              }
            }
          } catch (err: unknown) {
            const e = err as { stderr?: string };
            parts.push(`\n### Recent Videos\nFailed to fetch: ${(e.stderr || "yt-dlp error").slice(0, 200)}`);
          }

          // Fetch community tab posts
          try {
            const communityUrl = `${ytUrl}/community`;
            const communityRaw = run("yt-dlp", [
              "--flat-playlist",
              "--no-download",
              "--print", "%(title)s\t%(id)s\t%(upload_date)s",
              "--playlist-end", String(limit),
              communityUrl,
            ], 60_000);

            if (communityRaw) {
              parts.push("\n### Community Posts");
              for (const line of communityRaw.split("\n").filter(Boolean)) {
                const [title, postId, date] = line.split("\t");
                const dateFormatted = date
                  ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
                  : "unknown";
                parts.push(`- [${dateFormatted}] ${title || "(no title)"} — ${postId}`);
              }
            }
          } catch {
            parts.push("\n### Community Posts\nNot available (scraping may be blocked)");
          }
        } else if (fan.platform === "github") {
          const ghUrl = fan.urls.find((u) => u.includes("github.com"));
          if (ghUrl) {
            const username = ghUrl.replace(/\/$/, "").split("/").pop();
            try {
              const events = run("gh", [
                "api", `users/${username}/events/public`,
                "--jq", `.[:${limit}] | .[] | "\\(.type)\t\\(.repo.name)\t\\(.created_at)"`,
              ]);
              if (events) {
                parts.push("\n### Recent GitHub Activity");
                for (const line of events.split("\n").filter(Boolean)) {
                  const [type, repo, date] = line.split("\t");
                  parts.push(`- [${new Date(date).toLocaleDateString()}] ${type} on ${repo}`);
                }
              }
            } catch {
              parts.push("\n### Recent GitHub Activity\nFailed to fetch");
            }
          }
        } else if (fan.platform === "twitter") {
          parts.push("\n*Twitter content checking requires OAuth — log engagement manually.*");
        }

        // Update lastChecked
        const registry = readFanRegistry();
        const idx = registry.findIndex((f) => f.id === fanId);
        if (idx >= 0) {
          registry[idx].lastChecked = new Date().toISOString();
          writeFanRegistry(registry);
        }

        logger.info(`Checked content for ${fan.name}`);
        return ok(parts.join("\n"));
      },
    } as AnyAgentTool,

    // ── Log engagement with a fan's content ─────────────────────────
    {
      name: "fan_engage",
      label: "fan_engage",
      description:
        "Log an authentic engagement action with a fan's content — watching, commenting, sharing, referencing.",
      parameters: {
        type: "object",
        required: ["fanId", "action", "contentUrl", "contentTitle"],
        properties: {
          fanId: { type: "string", description: "Fan ID (slugified name)" },
          action: {
            type: "string",
            enum: ["watched", "liked", "commented", "shared", "bookmarked", "referenced"],
            description: "Type of engagement",
          },
          contentUrl: { type: "string", description: "URL of the content engaged with" },
          contentTitle: { type: "string", description: "Title of the content" },
          notes: {
            type: "string",
            description: "Notes — key insights, what resonated, how it connects to our work",
          },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const fan = getFanById(p.fanId);
        if (!fan) {
          return ok(`Fan not found: ${p.fanId}. Use fan_list to see available fans.`);
        }

        const entry: EngagementLog = {
          fanId: p.fanId,
          action: p.action as EngagementLog["action"],
          contentUrl: p.contentUrl,
          contentTitle: p.contentTitle,
          timestamp: new Date().toISOString(),
          notes: p.notes || undefined,
        };
        addEngagement(entry);
        logger.info(`Engagement logged: ${p.action} on ${fan.name}'s "${p.contentTitle}"`);
        return ok(
          `Engagement logged: ${p.action} — ${fan.name}'s "${p.contentTitle}"\n` +
            (p.notes ? `Notes: ${p.notes}` : ""),
        );
      },
    } as AnyAgentTool,

    // ── Fan digest — summarize recent engagement ────────────────────
    {
      name: "fan_digest",
      label: "fan_digest",
      description:
        "Get a digest of recent engagement with fans — what we've watched, commented on, shared.",
      parameters: {
        type: "object",
        required: [],
        properties: {
          fanId: { type: "string", description: "Filter by specific fan ID" },
          days: { type: "number", description: "Look back N days (default 7)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const days = (p.days as number) || 7;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        let log = readEngagementLog().filter(
          (e) => new Date(e.timestamp) >= cutoff,
        );

        if (p.fanId) {
          log = log.filter((e) => e.fanId === p.fanId);
        }

        if (log.length === 0) {
          return ok(`No engagement activity in the last ${days} days.`);
        }

        const fans = readFanRegistry();
        const fanMap = new Map(fans.map((f) => [f.id, f.name]));

        const byFan: Record<string, typeof log> = {};
        for (const entry of log) {
          const name = fanMap.get(entry.fanId) || entry.fanId;
          if (!byFan[name]) byFan[name] = [];
          byFan[name].push(entry);
        }

        const lines: string[] = [
          `## Fan Engagement Digest (last ${days} days)`,
          `**Total actions:** ${log.length}`,
        ];

        for (const [name, entries] of Object.entries(byFan)) {
          lines.push(`\n### ${name} (${entries.length} actions)`);
          for (const e of entries.sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
          )) {
            const date = new Date(e.timestamp).toLocaleDateString();
            lines.push(`- [${date}] ${e.action}: "${e.contentTitle}"`);
            if (e.notes) lines.push(`  → ${e.notes}`);
          }
        }

        return ok(lines.join("\n"));
      },
    } as AnyAgentTool,

    // ── Fan status — overview of all fans ───────────────────────────
    {
      name: "fan_status",
      label: "fan_status",
      description:
        "Overview of all fans with engagement stats — who we've been engaging with and who needs attention.",
      parameters: {
        type: "object",
        required: [],
        properties: {},
      },
      async execute(_id: string, _params: unknown) {
        const fans = readFanRegistry();
        const log = readEngagementLog();

        if (fans.length === 0) {
          return ok("No fans in the registry yet.");
        }

        const lines: string[] = [`## Fan Status Dashboard`, `**Total fans:** ${fans.length}`];

        const engagementCounts: Record<string, number> = {};
        const lastEngagement: Record<string, string> = {};
        for (const entry of log) {
          engagementCounts[entry.fanId] = (engagementCounts[entry.fanId] || 0) + 1;
          if (!lastEngagement[entry.fanId] || entry.timestamp > lastEngagement[entry.fanId]) {
            lastEngagement[entry.fanId] = entry.timestamp;
          }
        }

        const sorted = [...fans].sort((a, b) => {
          const aTime = lastEngagement[a.id] || "0";
          const bTime = lastEngagement[b.id] || "0";
          return aTime.localeCompare(bTime);
        });

        for (const fan of sorted) {
          const count = engagementCounts[fan.id] || 0;
          const last = lastEngagement[fan.id]
            ? new Date(lastEngagement[fan.id]).toLocaleDateString()
            : "never";
          const checked = fan.lastChecked
            ? new Date(fan.lastChecked).toLocaleDateString()
            : "never";
          const needsAttention = count === 0 || !lastEngagement[fan.id] ? " ⚠️ needs attention" : "";

          lines.push(
            `\n### ${fan.name} (${fan.platform})${needsAttention}`,
            `- Engagements: ${count} total, last: ${last}`,
            `- Last content check: ${checked}`,
            `- Style: ${fan.engagementStyle}`,
          );
        }

        return ok(lines.join("\n"));
      },
    } as AnyAgentTool,
  ];
}
