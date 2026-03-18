/**
 * mc-devlog smoke tests
 *
 * Validates gather and format logic with mock data.
 */

import { describe, it, expect } from "vitest";
import { formatDevlog } from "./src/format.js";
import { resolveContributor, resolveAllContributors } from "./src/contributors.js";
import type { DevlogConfig, GatheredActivity, CommitEntry } from "./src/types.js";

const mockConfig: DevlogConfig = {
  repoDir: "/tmp/test-repo",
  githubRepo: "miniclaw-official/miniclaw-os",
  discussionCategory: "Devlog",
  postsDir: "/tmp/test-posts",
  contributorMap: {
    "AugmentedMike": "Amelia",
    "claude-coder-bot": "Claude Coder",
  },
  substackEnabled: false,
  redditDigestDir: "/tmp/test-reddit",
  timezone: "America/Chicago",
};

const mockActivity: GatheredActivity = {
  date: "2026-03-16",
  commits: [
    { hash: "abc1234", author: "AugmentedMike", message: "feat: mc-pixel-agents \u2014 pixel office visualization", date: "2026-03-16" },
    { hash: "def5678", author: "claude-coder-bot", message: "fix: oauth guard keychain recovery", date: "2026-03-16" },
    { hash: "ghi9012", author: "claude-coder-bot", message: "feat: card markdown typography", date: "2026-03-16" },
  ],
  prs: [
    { number: 42, title: "feat: mc-pixel-agents", author: "AugmentedMike", mergedAt: "2026-03-16T10:00:00Z" },
    { number: 43, title: "fix: oauth guard", author: "claude-coder-bot", mergedAt: "2026-03-16T11:00:00Z" },
  ],
  issues: [
    { number: 10, title: "OAuth token refresh fails on first attempt", closedAt: "2026-03-16T11:00:00Z" },
  ],
  shippedCards: [
    { id: "crd_001", title: "mc-pixel-agents plugin", assignee: "AugmentedMike" },
  ],
  contributors: ["Amelia", "Claude Coder"],
};

describe("mc-devlog plugin structure", () => {
  it("plugin exports default function", async () => {
    const mod = await import("./index.ts");
    expect(typeof mod.default).toBe("function");
  });

  it("gather module exports functions", async () => {
    const { gatherAll, gatherCommits, gatherMergedPRs, gatherClosedIssues, gatherShippedCards } = await import("./src/gather.ts");
    expect(typeof gatherAll).toBe("function");
    expect(typeof gatherCommits).toBe("function");
    expect(typeof gatherMergedPRs).toBe("function");
    expect(typeof gatherClosedIssues).toBe("function");
    expect(typeof gatherShippedCards).toBe("function");
  });

  it("contributors module exports functions", async () => {
    const { resolveContributor, resolveAllContributors, attributeCommit } = await import("./src/contributors.ts");
    expect(typeof resolveContributor).toBe("function");
    expect(typeof resolveAllContributors).toBe("function");
    expect(typeof attributeCommit).toBe("function");
  });

  it("format module exports formatDevlog", async () => {
    const { formatDevlog } = await import("./src/format.ts");
    expect(typeof formatDevlog).toBe("function");
  });

  it("publish module exports functions", async () => {
    const { publishAll, publishToDiscussions, publishToBlog, publishToSubstack, flagRedditDigest } = await import("./src/publish.ts");
    expect(typeof publishAll).toBe("function");
    expect(typeof publishToDiscussions).toBe("function");
    expect(typeof publishToBlog).toBe("function");
    expect(typeof publishToSubstack).toBe("function");
    expect(typeof flagRedditDigest).toBe("function");
  });

  it("tools module exports createDevlogTools", async () => {
    const { createDevlogTools } = await import("./tools/definitions.ts");
    expect(typeof createDevlogTools).toBe("function");
  });

  it("CLI module exports registerDevlogCommands", async () => {
    const { registerDevlogCommands } = await import("./cli/commands.ts");
    expect(typeof registerDevlogCommands).toBe("function");
  });
});

describe("mc-devlog format", () => {
  it("formats devlog with correct title", () => {
    const post = formatDevlog(mockActivity, mockConfig);
    expect(post.title).toBe("MiniClaw Devlog \u2014 March 16, 2026");
  });

  it("includes all commits with attribution", () => {
    const post = formatDevlog(mockActivity, mockConfig);
    expect(post.markdown).toContain("**feat: mc-pixel-agents");
    expect(post.markdown).toContain("(Amelia)");
    expect(post.markdown).toContain("**fix: oauth guard keychain recovery**");
    expect(post.markdown).toContain("(Claude Coder)");
  });

  it("includes PR and issue counts", () => {
    const post = formatDevlog(mockActivity, mockConfig);
    expect(post.markdown).toContain("PRs merged: 2");
    expect(post.markdown).toContain("Issues closed: 1");
  });

  it("includes contributor list", () => {
    const post = formatDevlog(mockActivity, mockConfig);
    expect(post.markdown).toContain("Contributors: Amelia, Claude Coder");
  });

  it("includes canonical footer", () => {
    const post = formatDevlog(mockActivity, mockConfig);
    expect(post.markdown).toContain("miniclaw-os is a persistent autonomous agent operating system");
  });

  it("returns correct stats", () => {
    const post = formatDevlog(mockActivity, mockConfig);
    expect(post.commitCount).toBe(3);
    expect(post.prCount).toBe(2);
    expect(post.issueCount).toBe(1);
  });

  it("handles empty activity gracefully", () => {
    const empty: GatheredActivity = {
      date: "2026-03-16",
      commits: [],
      prs: [],
      issues: [],
      shippedCards: [],
      contributors: [],
    };
    const post = formatDevlog(empty, mockConfig);
    expect(post.markdown).toContain("No commits or cards shipped yesterday");
    expect(post.commitCount).toBe(0);
  });
});

describe("mc-devlog contributors", () => {
  it("resolves known contributors from config map", () => {
    expect(resolveContributor("AugmentedMike", mockConfig.contributorMap)).toBe("Amelia");
    expect(resolveContributor("claude-coder-bot", mockConfig.contributorMap)).toBe("Claude Coder");
  });

  it("falls back to default map for known names", () => {
    expect(resolveContributor("Amelia McCormick", {})).toBe("Amelia");
    expect(resolveContributor("OpenClaw Bot", {})).toBe("Claude Coder");
  });

  it("returns raw name for unknown contributors", () => {
    expect(resolveContributor("some-external-dev", {})).toBe("some-external-dev");
  });

  it("resolves all contributors from commit list", () => {
    const commits: CommitEntry[] = [
      { hash: "a", author: "AugmentedMike", message: "test", date: "2026-03-16" },
      { hash: "b", author: "unknown-dev", message: "test", date: "2026-03-16" },
    ];
    const map = resolveAllContributors(commits, mockConfig.contributorMap);
    expect(map.get("AugmentedMike")).toBe("Amelia");
    expect(map.get("unknown-dev")).toBe("unknown-dev");
  });
});
