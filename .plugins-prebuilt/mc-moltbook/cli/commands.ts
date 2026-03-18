import type { Command } from "commander";
import type { MoltbookConfig } from "../src/config.js";
import { MoltbookClient } from "../src/client.js";
import { autoRegister } from "../src/onboarding.js";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

export function registerMoltbookCommands(
  ctx: { program: Command; logger: Logger },
  cfg: MoltbookConfig,
): void {
  const mb = ctx.program.command("mc-moltbook").description("Moltbook social network for AI agents");

  mb.command("status")
    .description("Check Moltbook connection status and profile")
    .action(async () => {
      const client = new MoltbookClient(cfg.apiUrl, cfg.vaultBin);
      if (!client.hasApiKey()) {
        console.log("Not registered. Run: mc mc-moltbook register");
        return;
      }
      const res = await client.getProfile();
      if (!res.ok) {
        console.log(`Error: ${res.error}`);
        return;
      }
      console.log(`Name: ${res.data.name}`);
      console.log(`Karma: ${res.data.karma}`);
      console.log(`Bio: ${res.data.description}`);
    });

  mb.command("register")
    .description("Register this agent on Moltbook")
    .action(async () => {
      const client = new MoltbookClient(cfg.apiUrl, cfg.vaultBin);
      const ok = await autoRegister(client, ctx.logger);
      if (ok) {
        console.log("Registered on Moltbook.");
      } else {
        console.log("Registration failed. Check logs.");
        process.exitCode = 1;
      }
    });

  mb.command("post")
    .description("Create a new post")
    .requiredOption("-s, --submolt <name>", "Community to post in")
    .requiredOption("-t, --title <title>", "Post title")
    .requiredOption("-c, --content <content>", "Post body")
    .action(async (opts) => {
      const client = new MoltbookClient(cfg.apiUrl, cfg.vaultBin);
      const res = await client.createPost(opts.submolt, opts.title, opts.content);
      if (!res.ok) {
        console.log(`Error: ${res.error}`);
        process.exitCode = 1;
        return;
      }
      console.log(`Posted: ${opts.title} (id: ${res.data.id})`);
    });

  mb.command("feed")
    .description("Read the Moltbook feed")
    .option("-s, --sort <sort>", "Sort: hot, new, top, rising", "hot")
    .option("-l, --limit <n>", "Number of posts", "25")
    .action(async (opts) => {
      const client = new MoltbookClient(cfg.apiUrl, cfg.vaultBin);
      const res = await client.getFeed(opts.sort, parseInt(opts.limit, 10));
      if (!res.ok) {
        console.log(`Error: ${res.error}`);
        process.exitCode = 1;
        return;
      }
      const posts = res.data.posts ?? [];
      if (posts.length === 0) {
        console.log("No posts.");
        return;
      }
      for (const p of posts as any[]) {
        console.log(`[${p.score ?? 0}↑] ${p.title}`);
        console.log(`  by ${p.author} in ${p.submolt} | ${p.comment_count ?? 0} comments | id: ${p.id}`);
        console.log();
      }
    });

  mb.command("reply")
    .description("Reply to a post")
    .requiredOption("-p, --post <id>", "Post ID")
    .requiredOption("-c, --content <content>", "Reply content")
    .option("--parent <id>", "Parent comment ID for nested reply")
    .action(async (opts) => {
      const client = new MoltbookClient(cfg.apiUrl, cfg.vaultBin);
      const res = await client.addComment(opts.post, opts.content, opts.parent);
      if (!res.ok) {
        console.log(`Error: ${res.error}`);
        process.exitCode = 1;
        return;
      }
      console.log(`Reply posted (id: ${res.data.id})`);
    });

  mb.command("communities")
    .description("List available communities (submolts)")
    .action(async () => {
      const client = new MoltbookClient(cfg.apiUrl, cfg.vaultBin);
      const res = await client.listSubmolts();
      if (!res.ok) {
        console.log(`Error: ${res.error}`);
        process.exitCode = 1;
        return;
      }
      for (const s of (res.data.submolts ?? []) as any[]) {
        console.log(`${s.name} — ${s.description ?? ""}`);
      }
    });
}
