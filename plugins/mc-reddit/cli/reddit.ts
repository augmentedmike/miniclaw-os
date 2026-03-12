#!/usr/bin/env node
/**
 * mc-reddit CLI
 *
 * Commands are added as network requests are recorded from live Reddit sessions.
 * Run with: npx tsx cli/reddit.ts <command> [options]
 */

import { parseArgs } from "util";
import * as path from "node:path";
import * as os from "node:os";
import { RedditClient } from "../src/reddit-api.ts";
import { saveCookies, saveCookieFile } from "../src/vault.ts";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

// ── Config ────────────────────────────────────────────────────────────────────

function getClient() {
  const cookieFile = process.env.REDDIT_COOKIE_FILE;
  const cookies = process.env.REDDIT_COOKIES;
  // RedditClient will fall back to vault if env vars not set
  return new RedditClient({ cookieFile, cookies });
}

// ── Commands ──────────────────────────────────────────────────────────────────

const COMMANDS: Record<string, (args: string[]) => Promise<void>> = {

  // ── hot ──────────────────────────────────────────────────────────────────
  hot: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: { limit: { type: "string", short: "n", default: "10" } },
      allowPositionals: true,
    });
    const sub = positionals[0] ?? "all";
    const client = getClient();
    const data = await client.getHot(sub, { limit: Number(values.limit) });
    for (const { data: post } of data.data.children) {
      console.log(`[${post.score}] ${post.title}`);
      console.log(`    ${post.permalink}`);
    }
  },

  // ── new ───────────────────────────────────────────────────────────────────
  new: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: { limit: { type: "string", short: "n", default: "10" } },
      allowPositionals: true,
    });
    const sub = positionals[0] ?? "all";
    const client = getClient();
    const data = await client.getNew(sub, { limit: Number(values.limit) });
    for (const { data: post } of data.data.children) {
      console.log(`[${post.score}] ${post.title}`);
      console.log(`    ${post.permalink}`);
    }
  },

  // ── top ───────────────────────────────────────────────────────────────────
  top: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        limit: { type: "string", short: "n", default: "10" },
        t: { type: "string", default: "day" },
      },
      allowPositionals: true,
    });
    const sub = positionals[0] ?? "all";
    const client = getClient();
    const data = await client.getTop(sub, {
      limit: Number(values.limit),
      t: values.t as "hour" | "day" | "week" | "month" | "year" | "all",
    });
    for (const { data: post } of data.data.children) {
      console.log(`[${post.score}] ${post.title}`);
      console.log(`    ${post.permalink}`);
    }
  },

  // ── post ──────────────────────────────────────────────────────────────────
  post: async (args) => {
    const [subreddit, postId] = args;
    if (!subreddit || !postId) {
      console.error("Usage: reddit post <subreddit> <postId>");
      process.exit(1);
    }
    const client = getClient();
    const [listing] = await client.getPost(subreddit, postId);
    const post = listing.data.children[0]?.data as { title: string; score: number; selftext: string };
    console.log(`${post.title} [${post.score}]`);
    if (post.selftext) console.log("\n" + post.selftext);
  },

  // ── comment ───────────────────────────────────────────────────────────────
  comment: async (args) => {
    const [parentFullname, ...textParts] = args;
    if (!parentFullname || textParts.length === 0) {
      console.error("Usage: reddit comment <t3_xxx|t1_xxx> <text>");
      process.exit(1);
    }
    const client = getClient();
    const result = await client.comment(parentFullname, textParts.join(" "));
    console.log("Comment posted:", JSON.stringify(result, null, 2));
  },

  // ── vote ──────────────────────────────────────────────────────────────────
  vote: async (args) => {
    const [fullname, direction] = args;
    if (!fullname || !direction) {
      console.error("Usage: reddit vote <t3_xxx|t1_xxx> <up|down|clear>");
      process.exit(1);
    }
    const dir = direction === "up" ? 1 : direction === "down" ? -1 : 0;
    const client = getClient();
    await client.vote(fullname, dir as 1 | 0 | -1);
    console.log(`Voted ${direction} on ${fullname}`);
  },

  // ── submit ────────────────────────────────────────────────────────────────
  submit: async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        sub: { type: "string" },
        title: { type: "string" },
        text: { type: "string" },
        url: { type: "string" },
      },
      allowPositionals: false,
    });
    if (!values.sub || !values.title) {
      console.error("Usage: reddit submit --sub <subreddit> --title <title> [--text <text>|--url <url>]");
      process.exit(1);
    }
    const client = getClient();
    const result = await client.submit({
      subreddit: values.sub!,
      title: values.title!,
      kind: values.url ? "link" : "self",
      text: values.text,
      url: values.url,
    });
    console.log("Submitted:", JSON.stringify(result, null, 2));
  },

  // ── me ────────────────────────────────────────────────────────────────────
  me: async () => {
    const client = getClient();
    const me = await client.me() as { name: string; total_karma: number; icon_img: string };
    console.log(`u/${me.name} — karma: ${me.total_karma}`);
  },

  // ── user ──────────────────────────────────────────────────────────────────
  user: async (args) => {
    const [username] = args;
    if (!username) {
      console.error("Usage: reddit user <username>");
      process.exit(1);
    }
    const client = getClient();
    const profile = await client.userProfile(username) as { data: { name: string; total_karma: number; created_utc: number } };
    const d = profile.data;
    console.log(`u/${d.name}`);
    console.log(`  karma:   ${d.total_karma}`);
    console.log(`  created: ${new Date(d.created_utc * 1000).toLocaleDateString()}`);
  },

  // ── inbox ─────────────────────────────────────────────────────────────────
  inbox: async () => {
    const client = getClient();
    const data = await client.inbox() as { data: { children: Array<{ data: { author: string; subject: string; body: string } }> } };
    for (const { data: msg } of data.data.children) {
      console.log(`From: ${msg.author} — ${msg.subject}`);
      console.log(`  ${msg.body.slice(0, 100)}`);
    }
  },

  // ── auth ──────────────────────────────────────────────────────────────────
  auth: async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        cookies: { type: "string" },
        "cookie-file": { type: "string" },
      },
      allowPositionals: false,
    });
    const VAULT_BIN = path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "mc-vault");
    if (values.cookies) {
      saveCookies(values.cookies, VAULT_BIN);
      console.log("✓ Cookies saved to vault as social-reddit-cookies");
      console.log("  Run: reddit whoami  — to verify authentication");
    } else if (values["cookie-file"]) {
      const { readFileSync } = await import("fs");
      const cookieStr = readFileSync(values["cookie-file"], "utf-8").trim();
      saveCookies(cookieStr, VAULT_BIN);
      saveCookieFile(values["cookie-file"], VAULT_BIN);
      console.log(`✓ Cookies saved from ${values["cookie-file"]}`);
      console.log("✓ Cookie file path saved to vault as social-reddit-cookie-file");
      console.log("  Run: reddit whoami  — to verify authentication");
    } else {
      console.error("Usage: reddit auth --cookies '<cookie string>'");
      console.error("       reddit auth --cookie-file <path>");
      console.error("");
      console.error("How to get your Reddit cookies from Chrome:");
      console.error("  1. Open Reddit in Chrome and log in as u/amelia-miniclaw");
      console.error("  2. Open DevTools (Cmd+Opt+I) → Network tab");
      console.error("  3. Reload the page or click anywhere on Reddit");
      console.error("  4. Click any request to reddit.com in the Network list");
      console.error("  5. In the Headers pane → Request Headers, find 'Cookie:'");
      console.error("  6. Right-click the request → Copy → Copy as cURL");
      console.error("  7. Paste the cURL command and extract the -H 'Cookie: ...' value");
      console.error("  8. Run: reddit auth --cookies '<that value>'");
      process.exit(1);
    }
  },

  // ── whoami ────────────────────────────────────────────────────────────────
  whoami: async () => {
    const client = getClient();
    try {
      const me = await client.me() as { name: string; total_karma: number };
      console.log(`✓ Authenticated as u/${me.name}`);
      console.log(`  karma: ${me.total_karma}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`✗ Auth failed: ${msg}`);
      console.error("  Run: reddit auth --cookies '<cookie string>'");
      process.exit(1);
    }
  },

  // ── setup-subreddit ───────────────────────────────────────────────────────
  "setup-subreddit": async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        sub: { type: "string", default: "miniclaw" },
        "dry-run": { type: "boolean", default: false },
      },
      allowPositionals: false,
    });
    const sub = values.sub!;
    const client = getClient();

    if (values["dry-run"]) {
      console.log(`[dry-run] Would set up /r/${sub} with:`);
      console.log("  Flairs: Release, Plugin, Build Log, Question, Discussion, Bug");
      console.log("  Rules: Stay on topic, No spam, Be helpful");
      console.log("  Sidebar: miniclaw.bot, GitHub, docs.openclaw.ai links");
      console.log("  Wiki: index page with getting-started content");
      return;
    }

    console.log(`Setting up /r/${sub}...`);
    try {
      const results = await client.setupMiniclaw(sub);
      console.log("✓ Setup complete!");
      console.log(JSON.stringify(results, null, 2));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`✗ Setup failed: ${msg}`);
      process.exit(1);
    }
  },

  // ── add-flair ──────────────────────────────────────────────────────────────
  "add-flair": async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        sub: { type: "string" },
        text: { type: "string" },
        color: { type: "string", default: "" },
        "text-color": { type: "string", default: "dark" },
      },
      allowPositionals: false,
    });
    if (!values.sub || !values.text) {
      console.error("Usage: reddit add-flair --sub <subreddit> --text <text> [--color <hex>] [--text-color light|dark]");
      process.exit(1);
    }
    const client = getClient();
    const result = await client.addFlairTemplate(values.sub!, {
      text: values.text!,
      backgroundColor: values.color,
      textColor: values["text-color"] as "light" | "dark",
    });
    console.log("Flair created:", JSON.stringify(result, null, 2));
  },

  // ── add-rule ───────────────────────────────────────────────────────────────
  "add-rule": async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        sub: { type: "string" },
        name: { type: "string" },
        desc: { type: "string", default: "" },
        kind: { type: "string", default: "all" },
        violation: { type: "string" },
      },
      allowPositionals: false,
    });
    if (!values.sub || !values.name) {
      console.error("Usage: reddit add-rule --sub <subreddit> --name <name> [--desc <desc>] [--kind all|link|comment]");
      process.exit(1);
    }
    const client = getClient();
    const result = await client.addRule(values.sub!, {
      shortName: values.name!,
      description: values.desc,
      kind: values.kind as "all" | "link" | "comment",
      violationReason: values.violation ?? values.name,
    });
    console.log("Rule added:", JSON.stringify(result, null, 2));
  },

  // ── set-sidebar ────────────────────────────────────────────────────────────
  "set-sidebar": async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        sub: { type: "string" },
        text: { type: "string" },
      },
      allowPositionals: false,
    });
    if (!values.sub || !values.text) {
      console.error("Usage: reddit set-sidebar --sub <subreddit> --text <markdown>");
      process.exit(1);
    }
    const client = getClient();
    const result = await client.setSidebar(values.sub!, values.text!);
    console.log("Sidebar updated:", JSON.stringify(result, null, 2));
  },

  // ── wiki-edit ──────────────────────────────────────────────────────────────
  "wiki-edit": async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        sub: { type: "string" },
        page: { type: "string" },
        content: { type: "string" },
        reason: { type: "string", default: "" },
      },
      allowPositionals: false,
    });
    if (!values.sub || !values.page || !values.content) {
      console.error("Usage: reddit wiki-edit --sub <subreddit> --page <page> --content <markdown> [--reason <reason>]");
      process.exit(1);
    }
    const client = getClient();
    const result = await client.editWiki(values.sub!, values.page!, values.content!, values.reason);
    console.log("Wiki page updated:", JSON.stringify(result, null, 2));
  },

  // ── search ────────────────────────────────────────────────────────────────
  search: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        sub: { type: "string" },
        sort: { type: "string", default: "relevance" },
        t: { type: "string", default: "all" },
        limit: { type: "string", short: "n", default: "10" },
      },
      allowPositionals: true,
    });
    if (positionals.length === 0) {
      console.error("Usage: reddit search <query> [--sub <subreddit>] [--sort relevance|hot|top|new]");
      process.exit(1);
    }
    const client = getClient();
    const data = await client.search(positionals.join(" "), {
      subreddit: values.sub,
      sort: values.sort as "relevance" | "hot" | "top" | "new",
      t: values.t as "hour" | "day" | "week" | "month" | "year" | "all",
      limit: Number(values.limit),
    }) as { data: { children: Array<{ data: { title: string; score: number; permalink: string } }> } };
    for (const { data: post } of data.data.children) {
      console.log(`[${post.score}] ${post.title}`);
      console.log(`    ${post.permalink}`);
    }
  },

};

// ── Help ──────────────────────────────────────────────────────────────────────

function help() {
  console.log(`mc-reddit CLI

Usage: reddit <command> [options]

Auth:
  auth   --cookies '<str>'               Save cookie string to vault
  auth   --cookie-file <path>            Save cookies from file to vault
  whoami                                 Verify auth (hits /api/me.json)

Commands:
  hot    [subreddit] [-n limit]          Hot posts (default: all)
  new    [subreddit] [-n limit]          New posts
  top    [subreddit] [-n limit] [--t]    Top posts (--t: hour|day|week|month|year|all)
  post   <subreddit> <postId>            View a post
  comment <t3_xxx|t1_xxx> <text>         Post a comment
  vote   <fullname> <up|down|clear>      Vote on post/comment
  submit --sub <r> --title <t> [--text|--url]  Submit a post
  me                                     Your profile
  user   <username>                      View user profile
  inbox                                  Inbox messages
  search <query> [--sub] [--sort]        Search Reddit

Moderation (requires mod privileges):
  setup-subreddit [--sub miniclaw]       Full /r/miniclaw setup (flairs + rules + sidebar + wiki)
  add-flair   --sub <r> --text <t>       Add post flair template
  add-rule    --sub <r> --name <n>       Add subreddit rule
  set-sidebar --sub <r> --text <md>      Set sidebar markdown
  wiki-edit   --sub <r> --page <p> --content <md>  Edit wiki page

Env (optional — overrides vault):
  REDDIT_COOKIE_FILE   Path to file containing cookie string
  REDDIT_COOKIES       Cookie string (alternative to file)

Cookie extraction (one-time setup):
  1. Open Reddit in Chrome, log in as u/amelia-miniclaw
  2. Open DevTools (Cmd+Opt+I) → Network tab
  3. Reload the page
  4. Click any request to reddit.com
  5. Headers → Request Headers → find "Cookie:"
  6. Right-click request → Copy → Copy as cURL
  7. Extract the -H 'Cookie: ...' value
  8. Run: reddit auth --cookies '<that value>'
`);
}

// ── Entrypoint ────────────────────────────────────────────────────────────────

const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h") {
  help();
  process.exit(0);
}

const handler = COMMANDS[cmd];
if (!handler) {
  console.error(`Unknown command: ${cmd}`);
  help();
  process.exit(1);
}

handler(rest).catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
