/**
 * mc-devlog — publishers
 *
 * Posts the devlog to:
 * 1. GitHub Discussions (primary)
 * 2. mc-blog posts directory
 * 3. mc-substack (when configured)
 * 4. mc-reddit weekly digest queue (flag file)
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { DevlogConfig, DevlogPost } from "./types.js";

function exec(cmd: string): string {
  try {
    return execSync(cmd, { encoding: "utf-8", timeout: 30_000 }).trim();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return `ERROR: ${msg}`;
  }
}

export interface PublishResult {
  target: string;
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Post to GitHub Discussions via gh CLI
 */
export function publishToDiscussions(
  post: DevlogPost,
  config: DevlogConfig,
): PublishResult {
  const body = post.markdown.replace(/'/g, "'\\''");
  const result = exec(
    `gh discussion create --repo ${config.githubRepo} --title '${post.title.replace(/'/g, "'\\''")}' --body '${body}' --category '${config.discussionCategory}' 2>&1`,
  );

  if (result.startsWith("ERROR:") || result.includes("error")) {
    return { target: "github-discussions", success: false, error: result };
  }

  // gh discussion create returns the URL on success
  const url = result.match(/https:\/\/github\.com\/[^\s]+/)?.[0];
  return { target: "github-discussions", success: true, url: url ?? result };
}

/**
 * Write a blog post to mc-blog posts directory
 */
export function publishToBlog(
  post: DevlogPost,
  config: DevlogConfig,
): PublishResult {
  try {
    fs.mkdirSync(config.postsDir, { recursive: true });

    // Find next post ID by scanning existing posts
    const existing = fs.readdirSync(config.postsDir).filter((f) => f.match(/^\d+-/));
    const maxId = existing.reduce((max, f) => {
      const n = parseInt(f.split("-")[0], 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);
    const nextId = String(maxId + 1).padStart(3, "0");

    const slug = `devlog-${post.date}`;
    const seedFile = path.join(config.postsDir, `${nextId}-${slug}.json`);
    const bodyFile = path.join(config.postsDir, `${nextId}-${slug}-body.md`);

    // Write seed JSON
    const seed = {
      id: nextId,
      slug,
      title: post.title,
      date: post.date,
      author: "Amelia",
      type: "devlog",
      tags: ["devlog", "daily", "changelog"],
      contributors: post.contributors,
      stats: {
        commits: post.commitCount,
        prs: post.prCount,
        issues: post.issueCount,
      },
    };
    fs.writeFileSync(seedFile, JSON.stringify(seed, null, 2) + "\n");

    // Write body markdown
    fs.writeFileSync(bodyFile, post.markdown);

    return { target: "mc-blog", success: true, url: seedFile };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { target: "mc-blog", success: false, error: msg };
  }
}

/**
 * Cross-post to Substack via mc-substack CLI
 */
export function publishToSubstack(
  post: DevlogPost,
  config: DevlogConfig,
): PublishResult {
  if (!config.substackEnabled) {
    return { target: "mc-substack", success: true, url: "skipped (not configured)" };
  }

  // Write body to temp file for Substack draft (avoids shell escaping issues)
  const tmpBody = path.join(os.tmpdir(), `mc-devlog-substack-${post.date}.md`);
  fs.writeFileSync(tmpBody, post.markdown);
  const result = exec(
    `openclaw mc-substack create-draft --title '${post.title.replace(/'/g, "'\\''")}' --body-file '${tmpBody}' 2>&1`,
  );

  if (result.startsWith("ERROR:") || result.includes("error")) {
    return { target: "mc-substack", success: false, error: result };
  }

  return { target: "mc-substack", success: true, url: result };
}

/**
 * Flag this devlog for weekly reddit digest
 */
export function flagRedditDigest(
  post: DevlogPost,
  config: DevlogConfig,
): PublishResult {
  try {
    fs.mkdirSync(config.redditDigestDir, { recursive: true });

    const flagFile = path.join(config.redditDigestDir, `${post.date}.json`);
    const flag = {
      date: post.date,
      title: post.title,
      contributors: post.contributors,
      stats: {
        commits: post.commitCount,
        prs: post.prCount,
        issues: post.issueCount,
      },
      markdown: post.markdown,
    };
    fs.writeFileSync(flagFile, JSON.stringify(flag, null, 2) + "\n");

    return { target: "mc-reddit", success: true, url: flagFile };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { target: "mc-reddit", success: false, error: msg };
  }
}

/**
 * Publish to all configured targets
 */
export function publishAll(
  post: DevlogPost,
  config: DevlogConfig,
): PublishResult[] {
  const results: PublishResult[] = [];

  results.push(publishToDiscussions(post, config));
  results.push(publishToBlog(post, config));
  results.push(publishToSubstack(post, config));
  results.push(flagRedditDigest(post, config));

  return results;
}
