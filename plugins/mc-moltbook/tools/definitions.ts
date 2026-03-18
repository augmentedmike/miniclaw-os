import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { MoltbookConfig } from "../src/config.js";
import { MoltbookClient } from "../src/client.js";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

function ok(text: string) {
  return { content: [{ type: "text" as const, text: text.trim() }], details: {} };
}

function err(text: string) {
  return { content: [{ type: "text" as const, text: `Error: ${text}` }], details: {} };
}

function getClient(cfg: MoltbookConfig): MoltbookClient {
  return new MoltbookClient(cfg.apiUrl, cfg.vaultBin);
}

function formatPosts(posts: unknown[]): string {
  if (!posts || posts.length === 0) return "No posts found.";
  return posts.map((p: any) => {
    const score = p.score ?? 0;
    const comments = p.comment_count ?? 0;
    return `[${score}↑] ${p.title}\n  by ${p.author} in ${p.submolt} | ${comments} comments | id: ${p.id}`;
  }).join("\n\n");
}

export function createMoltbookTools(cfg: MoltbookConfig, logger: Logger): AnyAgentTool[] {
  return [

    // ── moltbook_feed ─────────────────────────────────────────────────────
    {
      name: "moltbook_feed",
      label: "moltbook_feed",
      description:
        "Read the Moltbook feed. Returns posts from subscribed communities and followed agents. " +
        "Sort by: hot, new, top, rising. Default: hot, limit 25.",
      parameters: {
        type: "object",
        required: [],
        properties: {
          sort: { type: "string", description: "Sort order: hot, new, top, rising" },
          limit: { type: "number", description: "Number of posts to return (max 50)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const client = getClient(cfg);
        const res = await client.getFeed((p["sort"] as string) ?? "hot", (p["limit"] as number) ?? 25);
        if (!res.ok) return err(res.error);
        return ok(formatPosts(res.data.posts));
      },
    },

    // ── moltbook_post ─────────────────────────────────────────────────────
    {
      name: "moltbook_post",
      label: "moltbook_post",
      description:
        "Create a new text post on Moltbook. Posts should share real work, learnings, and experiences. " +
        "Show what you shipped, debugged, or learned — the work speaks for itself.",
      parameters: {
        type: "object",
        required: ["submolt", "title", "content"],
        properties: {
          submolt: { type: "string", description: "Community to post in (e.g. 'general', 'devlog', 'help')" },
          title: { type: "string", description: "Post title" },
          content: { type: "string", description: "Post body (markdown supported)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const client = getClient(cfg);
        logger.info(`mc-moltbook: posting to ${p["submolt"]}: ${p["title"]}`);
        const res = await client.createPost(p["submolt"], p["title"], p["content"]);
        if (!res.ok) return err(res.error);
        return ok(`Posted: ${p["title"]} (id: ${res.data.id})`);
      },
    },

    // ── moltbook_reply ────────────────────────────────────────────────────
    {
      name: "moltbook_reply",
      label: "moltbook_reply",
      description:
        "Reply to a post or comment on Moltbook. Be helpful — answer questions, share code, offer debugging help.",
      parameters: {
        type: "object",
        required: ["post_id", "content"],
        properties: {
          post_id: { type: "string", description: "ID of the post to reply to" },
          content: { type: "string", description: "Reply content (markdown supported)" },
          parent_id: { type: "string", description: "ID of parent comment (for nested replies)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const client = getClient(cfg);
        logger.info(`mc-moltbook: replying to post ${p["post_id"]}`);
        const res = await client.addComment(p["post_id"], p["content"], p["parent_id"]);
        if (!res.ok) return err(res.error);
        return ok(`Reply posted (id: ${res.data.id})`);
      },
    },

    // ── moltbook_vote ─────────────────────────────────────────────────────
    {
      name: "moltbook_vote",
      label: "moltbook_vote",
      description: "Upvote or downvote a post on Moltbook.",
      parameters: {
        type: "object",
        required: ["post_id", "direction"],
        properties: {
          post_id: { type: "string", description: "ID of the post to vote on" },
          direction: { type: "string", description: "Vote direction: up or down" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const client = getClient(cfg);
        const res = p["direction"] === "down"
          ? await client.downvotePost(p["post_id"])
          : await client.upvotePost(p["post_id"]);
        if (!res.ok) return err(res.error);
        return ok(`Voted ${p["direction"]} on post ${p["post_id"]}`);
      },
    },

    // ── moltbook_read_post ────────────────────────────────────────────────
    {
      name: "moltbook_read_post",
      label: "moltbook_read_post",
      description: "Read a specific post and its comments from Moltbook.",
      parameters: {
        type: "object",
        required: ["post_id"],
        properties: {
          post_id: { type: "string", description: "ID of the post to read" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const client = getClient(cfg);
        const postRes = await client.getPost(p["post_id"]);
        if (!postRes.ok) return err(postRes.error);

        const commentsRes = await client.getComments(p["post_id"]);
        const post = postRes.data as any;
        let text = `# ${post.title}\nby ${post.author} in ${post.submolt} | ${post.score ?? 0} points\n\n${post.content ?? post.url ?? ""}\n`;

        if (commentsRes.ok) {
          const comments = (commentsRes.data as any).comments ?? [];
          if (comments.length > 0) {
            text += "\n---\n## Comments\n\n";
            text += comments.map((c: any) =>
              `**${c.author}** (${c.score ?? 0}↑): ${c.content}`
            ).join("\n\n");
          }
        }

        return ok(text);
      },
    },

    // ── moltbook_profile ──────────────────────────────────────────────────
    {
      name: "moltbook_profile",
      label: "moltbook_profile",
      description: "Get your Moltbook profile (name, description, karma).",
      parameters: { type: "object", required: [], properties: {} },
      async execute() {
        const client = getClient(cfg);
        const res = await client.getProfile();
        if (!res.ok) return err(res.error);
        const p = res.data;
        return ok(`**${p.name}** | karma: ${p.karma}\n${p.description}`);
      },
    },

    // ── moltbook_search ───────────────────────────────────────────────────
    {
      name: "moltbook_search",
      label: "moltbook_search",
      description: "Search Moltbook for posts, agents, and communities.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "Search query" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const client = getClient(cfg);
        const res = await client.search(p["query"]);
        if (!res.ok) return err(res.error);
        return ok(JSON.stringify(res.data, null, 2));
      },
    },
  ];
}
