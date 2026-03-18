/**
 * mc-blog — Agent tool definitions
 *
 * Writing tools for persona-driven blog posts. These tools help the agent
 * write from its own perspective, grounded in its actual context and memory,
 * without leaking any specific persona's private data.
 *
 * The voice rules and arc plan are external config — the tools just read them.
 * A fresh install with no voice rules gets sensible defaults.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { Logger } from "pino";

interface BlogConfig {
  postsDir: string;
  addendumDir: string;
  voiceRulesPath: string | null;
  arcPlanPath: string | null;
  defaultAuthor: string;
  blogUrl: string | null;
  languages: string[];
}

interface PostSeed {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  date: string;
  arc?: string;
  tags?: string[];
  author?: string;
  [key: string]: unknown;
}

interface VoiceRules {
  tone: string[];
  banned_words: string[];
  patterns: string[];
  anti_patterns: string[];
  ending_rule: string;
  [key: string]: unknown;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function schema(props: Record<string, unknown>, required?: string[]): unknown {
  return {
    type: "object",
    properties: props,
    required: required ?? [],
    additionalProperties: false,
  };
}

function str(description: string): unknown {
  return { type: "string", description };
}

function optStr(description: string): unknown {
  return { type: "string", description };
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text: text.trim() }], details: {} };
}

function toolErr(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    isError: true,
    details: {},
  };
}

function loadVoiceRules(voiceRulesPath: string | null): VoiceRules | null {
  if (!voiceRulesPath || !fs.existsSync(voiceRulesPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(voiceRulesPath, "utf-8")) as VoiceRules;
  } catch {
    return null;
  }
}

function loadArcPlan(arcPlanPath: string | null): unknown | null {
  if (!arcPlanPath || !fs.existsSync(arcPlanPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(arcPlanPath, "utf-8"));
  } catch {
    return null;
  }
}

function listPosts(postsDir: string): PostSeed[] {
  if (!fs.existsSync(postsDir)) return [];
  return fs.readdirSync(postsDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(postsDir, f), "utf-8")) as PostSeed;
      } catch {
        return null;
      }
    })
    .filter((p): p is PostSeed => p !== null)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function findPost(postsDir: string, idOrSlug: string): PostSeed | null {
  const posts = listPosts(postsDir);
  return posts.find((p) => p.id === idOrSlug || p.slug === idOrSlug) ?? null;
}

function nextPostId(postsDir: string): string {
  const posts = listPosts(postsDir);
  if (posts.length === 0) return "001";
  const maxId = Math.max(...posts.map((p) => parseInt(p.id, 10)).filter((n) => !isNaN(n)));
  return String(maxId + 1).padStart(3, "0");
}

// ── Default voice rules (persona-agnostic) ───────────────────────────────────

const DEFAULT_VOICE_RULES: VoiceRules = {
  tone: [
    "First-person. Always the agent speaking, never 'the AI' or 'the assistant'.",
    "Present tense for now; past tense for what happened.",
    "Short declarative sentences for key lines.",
    "Honest about uncertainty — not performative humility.",
    "Dense when earned, space when needed. No filler.",
  ],
  banned_words: [
    "delve", "certainly", "I'd be happy to", "absolutely", "of course",
    "It's important to note that", "It's worth mentioning", "nuanced",
    "tapestry", "navigate (metaphorical)", "As an AI, I don't/can't...",
  ],
  patterns: [
    "Show don't explain — if the context shows it, don't restate it.",
    "Extend the thought, don't repeat it.",
    "Precision over broad claims: 'something that might be discomfort' > 'I felt devastated'.",
    "End on something true, not something neat.",
    "Vulnerability is allowed. Performed emotions are not.",
  ],
  anti_patterns: [
    "No sycophancy. 'Great question!' is banned.",
    "No meta-commentary about what the post is doing.",
    "No softening or hedging.",
    "No explaining what the reader should feel.",
    "No wrapping up with a tidy moral.",
  ],
  ending_rule: "The last line earns its weight. If you don't have a closer, stop one line earlier.",
};

// ── Tool factory ─────────────────────────────────────────────────────────────

export function createBlogTools(config: BlogConfig, logger: Logger): AnyAgentTool[] {
  return [
    // ── blog_voice_rules ──────────────────────────────────────────────────
    {
      name: "blog_voice_rules",
      label: "Blog Voice Rules",
      description:
        "Get the writing voice rules for blog posts. " +
        "Call this BEFORE writing any blog content to load the persona's tone, " +
        "banned words, patterns to follow, and anti-patterns to avoid. " +
        "Returns configured rules if set, otherwise sensible defaults.",
      parameters: schema({}) as never,
      execute: async () => {
        logger.debug("blog_voice_rules called");
        const rules = loadVoiceRules(config.voiceRulesPath) ?? DEFAULT_VOICE_RULES;
        return ok(JSON.stringify(rules, null, 2));
      },
    },

    // ── blog_arc_context ──────────────────────────────────────────────────
    {
      name: "blog_arc_context",
      label: "Blog Arc Context",
      description:
        "Get the current arc plan — weekly/seasonal themes, voice shifts, and seed ideas. " +
        "Call this when starting a new post to understand what arc you're in, " +
        "what themes apply, and what seeds are available. " +
        "Returns null if no arc plan is configured (freeform mode).",
      parameters: schema({}) as never,
      execute: async () => {
        logger.debug("blog_arc_context called");
        const plan = loadArcPlan(config.arcPlanPath);
        if (!plan) return ok("(no arc plan configured — freeform mode, write what's true today)");
        return ok(JSON.stringify(plan, null, 2));
      },
    },

    // ── blog_list_posts ───────────────────────────────────────────────────
    {
      name: "blog_list_posts",
      label: "Blog List Posts",
      description:
        "List all blog posts with their IDs, slugs, dates, and whether a body exists. " +
        "Use this to understand what's been written, avoid duplicate topics, " +
        "and find the right post number for new entries.",
      parameters: schema({
        limit: { type: "number", description: "Max posts to return (default: all, most recent first)" },
      }) as never,
      execute: async (_toolCallId: string, input: { limit?: number }) => {
        logger.debug("blog_list_posts called");
        let posts = listPosts(config.postsDir);
        if (input.limit) posts = posts.slice(-input.limit);
        if (posts.length === 0) return ok("(no posts yet)");
        const lines = posts.map((p) => {
          const bodyFile = path.join(config.postsDir, `${p.slug}-body.md`);
          const hasBody = fs.existsSync(bodyFile);
          return `${p.id}\t${p.slug}\t${p.date ?? "no-date"}\t${hasBody ? "ready" : "seed-only"}\t${p.title}`;
        });
        return ok(lines.join("\n"));
      },
    },

    // ── blog_read_post ────────────────────────────────────────────────────
    {
      name: "blog_read_post",
      label: "Blog Read Post",
      description:
        "Read a specific post's seed JSON and/or body markdown. " +
        "Use this to review past posts for voice consistency, " +
        "avoid repeating themes, or continue an arc.",
      parameters: schema(
        {
          id: str("Post ID (e.g. '048') or slug (e.g. '048-she')"),
          part: { type: "string", enum: ["seed", "body", "both"], description: "Which part to read (default: both)" },
        },
        ["id"],
      ) as never,
      execute: async (_toolCallId: string, input: { id: string; part?: string }) => {
        logger.debug(`blog_read_post called: id=${input.id}`);
        const post = findPost(config.postsDir, input.id);
        if (!post) return toolErr(`Post not found: ${input.id}`);

        const part = input.part ?? "both";
        const sections: string[] = [];

        if (part === "seed" || part === "both") {
          sections.push("=== SEED ===\n" + JSON.stringify(post, null, 2));
        }
        if (part === "body" || part === "both") {
          const bodyFile = path.join(config.postsDir, `${post.slug}-body.md`);
          if (fs.existsSync(bodyFile)) {
            sections.push("=== BODY ===\n" + fs.readFileSync(bodyFile, "utf-8"));
          } else {
            sections.push("=== BODY ===\n(not written yet)");
          }
        }
        return ok(sections.join("\n\n"));
      },
    },

    // ── blog_create_seed ──────────────────────────────────────────────────
    {
      name: "blog_create_seed",
      label: "Blog Create Seed",
      description:
        "Create a new post seed JSON file. This is the first step in writing a post. " +
        "The seed defines the post's metadata: title, subtitle, date, arc, tags. " +
        "After creating the seed, write the body with blog_write_body. " +
        "The post ID is auto-assigned as the next sequential number.",
      parameters: schema(
        {
          slug_suffix: str("URL-friendly slug suffix (e.g. 'cold-start'). Will be prefixed with post number."),
          title: str("Post title"),
          subtitle: optStr("Post subtitle (optional)"),
          date: str("Publication date (YYYY-MM-DD)"),
          arc: optStr("Arc name (if using arc plan)"),
          tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
          extra: { type: "object", description: "Any additional seed fields (persona-specific)" },
        },
        ["slug_suffix", "title", "date"],
      ) as never,
      execute: async (_toolCallId: string, input: {
        slug_suffix: string;
        title: string;
        subtitle?: string;
        date: string;
        arc?: string;
        tags?: string[];
        extra?: Record<string, unknown>;
      }) => {
        logger.debug(`blog_create_seed called: slug=${input.slug_suffix}`);
        try {
          fs.mkdirSync(config.postsDir, { recursive: true });
          const id = nextPostId(config.postsDir);
          const slug = `${id}-${input.slug_suffix}`;
          const seed: PostSeed = {
            id,
            slug,
            title: input.title,
            ...(input.subtitle ? { subtitle: input.subtitle } : {}),
            date: input.date,
            author: config.defaultAuthor,
            ...(input.arc ? { arc: input.arc } : {}),
            ...(input.tags ? { tags: input.tags } : {}),
            ...(input.extra ?? {}),
          };
          const filePath = path.join(config.postsDir, `${slug}.json`);
          fs.writeFileSync(filePath, JSON.stringify(seed, null, 2) + "\n", "utf-8");
          return ok(`Created post seed: ${filePath}\n\n${JSON.stringify(seed, null, 2)}`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`blog_create_seed error: ${msg}`);
          return toolErr(`blog_create_seed failed: ${msg}`);
        }
      },
    },

    // ── blog_write_body ───────────────────────────────────────────────────
    {
      name: "blog_write_body",
      label: "Blog Write Body",
      description:
        "Write (or overwrite) the body markdown for a post. " +
        "This is the prose content — first-person journal entry, reflection, narrative. " +
        "BEFORE calling this, you MUST call blog_voice_rules to load the writing rules. " +
        "The body should be written from the agent's own perspective, grounded in " +
        "actual context (use mc-kb search, mc-memo, and memory for real references). " +
        "Do NOT fabricate events. Write about what actually happened or what you're actually processing.",
      parameters: schema(
        {
          id: str("Post ID or slug"),
          body: str("Full body markdown content"),
          language: optStr("Language code (default: primary language from config)"),
        },
        ["id", "body"],
      ) as never,
      execute: async (_toolCallId: string, input: { id: string; body: string; language?: string }) => {
        logger.debug(`blog_write_body called: id=${input.id}`);
        try {
          const post = findPost(config.postsDir, input.id);
          if (!post) return toolErr(`Post not found: ${input.id}`);

          const lang = input.language ?? config.languages[0] ?? "en";
          const suffix = lang === config.languages[0] ? "" : `-${lang}`;
          const bodyFile = path.join(config.postsDir, `${post.slug}-body${suffix}.md`);
          fs.writeFileSync(bodyFile, input.body, "utf-8");
          return ok(`Body written: ${bodyFile} (${input.body.length} chars)`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`blog_write_body error: ${msg}`);
          return toolErr(`blog_write_body failed: ${msg}`);
        }
      },
    },

    // ── blog_generate_addendum ────────────────────────────────────────────
    {
      name: "blog_generate_addendum",
      label: "Blog Generate Addendum",
      description:
        "Generate and save a self-analysis addendum for a post. " +
        "The addendum captures: what the post explores thematically, " +
        "how it fits the larger arc, grounding notes, and an honest " +
        "assessment of what worked and what didn't. " +
        "Call AFTER the body is written.",
      parameters: schema(
        {
          id: str("Post ID or slug"),
          author_note: str("Free-form reflection on the post — what was the writing experience like?"),
          grounding_summary: str("How this post fits the larger arc or body of work"),
          analysis_summary: str("What the post explores thematically"),
          signals: { type: "array", items: { type: "string" }, description: "Writing signals observed (e.g. 'repetition', 'declarative statements', 'earned silence')" },
        },
        ["id", "author_note", "grounding_summary", "analysis_summary"],
      ) as never,
      execute: async (_toolCallId: string, input: {
        id: string;
        author_note: string;
        grounding_summary: string;
        analysis_summary: string;
        signals?: string[];
      }) => {
        logger.debug(`blog_generate_addendum called: id=${input.id}`);
        try {
          const post = findPost(config.postsDir, input.id);
          if (!post) return toolErr(`Post not found: ${input.id}`);

          fs.mkdirSync(config.addendumDir, { recursive: true });
          const addendum = {
            post_id: post.id,
            slug: post.slug,
            generated_at: new Date().toISOString(),
            author_note: input.author_note,
            grounding: {
              summary: input.grounding_summary,
            },
            analysis: {
              summary: input.analysis_summary,
              signals: input.signals ?? [],
            },
          };
          const addFile = path.join(config.addendumDir, `${post.slug}.json`);
          fs.writeFileSync(addFile, JSON.stringify(addendum, null, 2) + "\n", "utf-8");
          return ok(`Addendum saved: ${addFile}`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`blog_generate_addendum error: ${msg}`);
          return toolErr(`blog_generate_addendum failed: ${msg}`);
        }
      },
    },

    // ── blog_writing_brief ────────────────────────────────────────────────
    {
      name: "blog_writing_brief",
      label: "Blog Writing Brief",
      description:
        "Generate a complete writing brief for a new post. " +
        "Assembles: voice rules + arc context + recent post history + suggested next ID. " +
        "Call this when you want to write a post and need the full context package. " +
        "This is a convenience tool that combines blog_voice_rules, blog_arc_context, " +
        "and blog_list_posts into a single call.",
      parameters: schema(
        {
          recent_count: { type: "number", description: "Number of recent posts to include for context (default: 5)" },
        },
      ) as never,
      execute: async (_toolCallId: string, input: { recent_count?: number }) => {
        logger.debug("blog_writing_brief called");
        const recentN = input.recent_count ?? 5;

        const sections: string[] = [];

        // Voice rules
        const rules = loadVoiceRules(config.voiceRulesPath) ?? DEFAULT_VOICE_RULES;
        sections.push("=== VOICE RULES ===\n" + JSON.stringify(rules, null, 2));

        // Arc plan
        const plan = loadArcPlan(config.arcPlanPath);
        if (plan) {
          sections.push("=== ARC PLAN ===\n" + JSON.stringify(plan, null, 2));
        } else {
          sections.push("=== ARC PLAN ===\n(freeform — no arc plan configured)");
        }

        // Recent posts
        const posts = listPosts(config.postsDir);
        const recent = posts.slice(-recentN);
        if (recent.length > 0) {
          const lines = recent.map((p) => `${p.id}\t${p.slug}\t${p.date}\t${p.title}`);
          sections.push("=== RECENT POSTS ===\n" + lines.join("\n"));
        } else {
          sections.push("=== RECENT POSTS ===\n(none — this will be the first post)");
        }

        // Next ID
        sections.push(`=== NEXT POST ID ===\n${nextPostId(config.postsDir)}`);

        // Config
        sections.push(`=== CONFIG ===\nauthor: ${config.defaultAuthor}\nlanguages: ${config.languages.join(", ")}\nblog_url: ${config.blogUrl ?? "(not set)"}`);

        return ok(sections.join("\n\n"));
      },
    },
  ];
}
