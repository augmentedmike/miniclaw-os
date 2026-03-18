/**
 * mc-devlog — markdown formatter
 *
 * Takes gathered activity and produces a devlog post in the canonical format.
 */

import type { DevlogConfig, GatheredActivity, DevlogPost } from "./types.js";
import { resolveContributor } from "./contributors.js";

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatDevlog(activity: GatheredActivity, config: DevlogConfig): DevlogPost {
  const displayDate = formatDate(activity.date);
  const title = `MiniClaw Devlog \u2014 ${displayDate}`;

  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");

  // What shipped yesterday — group commits by message (deduplicate merge commits)
  if (activity.commits.length > 0 || activity.shippedCards.length > 0) {
    lines.push("## What shipped yesterday");
    lines.push("");

    // Commits — group by conventional commit prefix, attribute to contributor
    const seen = new Set<string>();
    for (const commit of activity.commits) {
      // Skip duplicates (same message from different branches)
      const key = commit.message.toLowerCase().trim();
      if (seen.has(key)) continue;
      seen.add(key);

      const contributor = resolveContributor(commit.author, config.contributorMap);
      lines.push(`- **${commit.message}** (${contributor})`);
    }

    // Shipped board cards that aren't already covered by commits
    for (const card of activity.shippedCards) {
      const contributor = card.assignee
        ? resolveContributor(card.assignee, config.contributorMap)
        : "Team";
      const key = card.title.toLowerCase().trim();
      if (!seen.has(key)) {
        lines.push(`- **${card.title}** (${contributor})`);
        seen.add(key);
      }
    }

    lines.push("");
  } else {
    lines.push("## What shipped yesterday");
    lines.push("");
    lines.push("_No commits or cards shipped yesterday._");
    lines.push("");
  }

  // Stats
  if (activity.prs.length > 0) {
    lines.push(`## PRs merged: ${activity.prs.length}`);
  }
  if (activity.issues.length > 0) {
    lines.push(`## Issues closed: ${activity.issues.length}`);
  }
  if (activity.contributors.length > 0) {
    lines.push(`## Contributors: ${activity.contributors.join(", ")}`);
  }

  lines.push("");
  lines.push("---");
  lines.push("*miniclaw-os is a persistent autonomous agent operating system*");
  lines.push("");

  return {
    title,
    date: activity.date,
    markdown: lines.join("\n"),
    contributors: activity.contributors,
    commitCount: activity.commits.length,
    prCount: activity.prs.length,
    issueCount: activity.issues.length,
  };
}
