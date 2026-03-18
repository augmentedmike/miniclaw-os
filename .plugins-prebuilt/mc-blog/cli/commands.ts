/**
 * mc-blog — CLI commands
 *
 * mc mc-blog list                     List all posts (number, slug, date, status)
 * mc mc-blog show <id>                Show full post JSON seed
 * mc mc-blog body <id>                Show post body markdown
 * mc mc-blog create <slug>            Create a new post seed (interactive)
 * mc mc-blog next-id                  Print the next available post number
 * mc mc-blog addendum <id>            Show or generate addendum for a post
 * mc mc-blog voice-rules              Print current voice rules
 * mc mc-blog arc-plan                 Print current arc plan
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";

export interface CliContext {
  program: Command;
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

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
  date: string;
  [key: string]: unknown;
}

function listPosts(postsDir: string): PostSeed[] {
  if (!fs.existsSync(postsDir)) return [];
  const files = fs.readdirSync(postsDir).filter((f) => f.endsWith(".json"));
  const posts: PostSeed[] = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(postsDir, file), "utf-8");
      posts.push(JSON.parse(content) as PostSeed);
    } catch {
      // skip malformed
    }
  }
  return posts.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

function findPost(postsDir: string, idOrSlug: string): { seed: PostSeed; file: string } | null {
  if (!fs.existsSync(postsDir)) return null;
  const files = fs.readdirSync(postsDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(postsDir, file), "utf-8");
      const seed = JSON.parse(content) as PostSeed;
      if (seed.id === idOrSlug || seed.slug === idOrSlug || file.startsWith(idOrSlug)) {
        return { seed, file };
      }
    } catch {
      // skip
    }
  }
  return null;
}

function nextPostId(postsDir: string): string {
  const posts = listPosts(postsDir);
  if (posts.length === 0) return "001";
  const maxId = Math.max(...posts.map((p) => parseInt(p.id, 10)).filter((n) => !isNaN(n)));
  return String(maxId + 1).padStart(3, "0");
}

export function registerBlogCommands(ctx: CliContext, config: BlogConfig): void {
  const { program } = ctx;

  const blog = program
    .command("mc-blog")
    .description("Persona-driven blog writing — posts, reflections, journal entries");

  // ---- list ----
  blog
    .command("list")
    .description("List all posts")
    .action(() => {
      const posts = listPosts(config.postsDir);
      if (posts.length === 0) {
        console.log("(no posts yet)");
        return;
      }
      for (const p of posts) {
        const bodyFile = path.join(config.postsDir, `${p.slug}-body.md`);
        const hasBody = fs.existsSync(bodyFile);
        const status = hasBody ? "ready" : "seed-only";
        console.log(`${p.id}\t${p.slug}\t${p.date ?? "no-date"}\t${status}\t${p.title}`);
      }
    });

  // ---- show ----
  blog
    .command("show <id>")
    .description("Show full post JSON seed")
    .action((id: string) => {
      const result = findPost(config.postsDir, id);
      if (!result) {
        console.error(`Post not found: ${id}`);
        process.exit(1);
      }
      console.log(JSON.stringify(result.seed, null, 2));
    });

  // ---- body ----
  blog
    .command("body <id>")
    .description("Show post body markdown")
    .action((id: string) => {
      const result = findPost(config.postsDir, id);
      if (!result) {
        console.error(`Post not found: ${id}`);
        process.exit(1);
      }
      const bodyFile = path.join(config.postsDir, `${result.seed.slug}-body.md`);
      if (!fs.existsSync(bodyFile)) {
        console.log("(no body written yet)");
        return;
      }
      console.log(fs.readFileSync(bodyFile, "utf-8"));
    });

  // ---- next-id ----
  blog
    .command("next-id")
    .description("Print the next available post number")
    .action(() => {
      console.log(nextPostId(config.postsDir));
    });

  // ---- addendum ----
  blog
    .command("addendum <id>")
    .description("Show addendum for a post")
    .action((id: string) => {
      const result = findPost(config.postsDir, id);
      if (!result) {
        console.error(`Post not found: ${id}`);
        process.exit(1);
      }
      const addFile = path.join(config.addendumDir, `${result.seed.slug}.json`);
      if (!fs.existsSync(addFile)) {
        console.log("(no addendum yet)");
        return;
      }
      console.log(fs.readFileSync(addFile, "utf-8"));
    });

  // ---- voice-rules ----
  blog
    .command("voice-rules")
    .description("Print current voice rules")
    .action(() => {
      if (!config.voiceRulesPath || !fs.existsSync(config.voiceRulesPath)) {
        console.log("(no voice rules configured — using agent defaults)");
        return;
      }
      console.log(fs.readFileSync(config.voiceRulesPath, "utf-8"));
    });

  // ---- arc-plan ----
  blog
    .command("arc-plan")
    .description("Print current arc plan")
    .action(() => {
      if (!config.arcPlanPath || !fs.existsSync(config.arcPlanPath)) {
        console.log("(no arc plan configured — freeform mode)");
        return;
      }
      console.log(fs.readFileSync(config.arcPlanPath, "utf-8"));
    });
}
