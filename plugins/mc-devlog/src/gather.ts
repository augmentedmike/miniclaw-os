/**
 * mc-devlog — data gathering module
 *
 * Collects yesterday's git commits, merged PRs, closed issues, and shipped board cards.
 */

import { execSync } from "node:child_process";
import type { DevlogConfig, CommitEntry, PREntry, IssueEntry, BoardCard, GatheredActivity } from "./types.js";

function exec(cmd: string, cwd?: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", timeout: 30_000 }).trim();
  } catch {
    return "";
  }
}

function yesterdayDate(tz: string): { since: string; until: string; display: string } {
  const now = new Date();
  // Compute yesterday in the given timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayStr = formatter.format(now);
  const today = new Date(todayStr + "T00:00:00");
  const yesterday = new Date(today.getTime() - 86_400_000);
  const yStr = formatter.format(yesterday);

  return {
    since: yStr,
    until: todayStr,
    display: yStr,
  };
}

export function gatherCommits(config: DevlogConfig): CommitEntry[] {
  const { since, until } = yesterdayDate(config.timezone);
  const raw = exec(
    `git log --since="${since}" --until="${until}" --format="%h|%an|%s|%ai" --all`,
    config.repoDir,
  );
  if (!raw) return [];

  return raw.split("\n").filter(Boolean).map((line) => {
    const [hash, author, message, date] = line.split("|");
    return { hash, author, message, date };
  });
}

export function gatherMergedPRs(config: DevlogConfig): PREntry[] {
  const { since } = yesterdayDate(config.timezone);
  const raw = exec(
    `gh pr list --repo ${config.githubRepo} --state merged --search "merged:>=${since}" --json number,title,author,mergedAt --limit 100 2>/dev/null`,
  );
  if (!raw) return [];

  try {
    const prs = JSON.parse(raw) as Array<{ number: number; title: string; author: { login: string }; mergedAt: string }>;
    return prs.map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.author?.login ?? "unknown",
      mergedAt: pr.mergedAt,
    }));
  } catch {
    return [];
  }
}

export function gatherClosedIssues(config: DevlogConfig): IssueEntry[] {
  const { since } = yesterdayDate(config.timezone);
  const raw = exec(
    `gh issue list --repo ${config.githubRepo} --state closed --search "closed:>=${since}" --json number,title,closedAt --limit 100 2>/dev/null`,
  );
  if (!raw) return [];

  try {
    const issues = JSON.parse(raw) as Array<{ number: number; title: string; closedAt: string }>;
    return issues.map((i) => ({
      number: i.number,
      title: i.title,
      closedAt: i.closedAt,
    }));
  } catch {
    return [];
  }
}

export function gatherShippedCards(config: DevlogConfig): BoardCard[] {
  const raw = exec(`openclaw mc-board board --column done --json 2>/dev/null`);
  if (!raw) return [];

  try {
    const cards = JSON.parse(raw) as Array<{ id: string; title: string; assignee?: string }>;
    return cards.map((c) => ({
      id: c.id,
      title: c.title,
      assignee: c.assignee,
    }));
  } catch {
    // Fallback: parse text output
    return [];
  }
}

export function gatherAll(config: DevlogConfig): GatheredActivity {
  const { display } = yesterdayDate(config.timezone);
  const commits = gatherCommits(config);
  const prs = gatherMergedPRs(config);
  const issues = gatherClosedIssues(config);
  const shippedCards = gatherShippedCards(config);

  // Collect unique contributors
  const contributorSet = new Set<string>();
  for (const c of commits) {
    const displayName = config.contributorMap[c.author] ?? c.author;
    contributorSet.add(displayName);
  }
  for (const pr of prs) {
    const displayName = config.contributorMap[pr.author] ?? pr.author;
    contributorSet.add(displayName);
  }

  return {
    date: display,
    commits,
    prs,
    issues,
    shippedCards,
    contributors: Array.from(contributorSet).sort(),
  };
}
