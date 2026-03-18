/**
 * mc-devlog — contributor mapping
 *
 * Maps git author names to display names. Falls back to the raw name
 * if no mapping exists.
 */

import type { DevlogConfig, CommitEntry } from "./types.js";

/** Default contributor map for known MiniClaw contributors */
const DEFAULT_MAP: Record<string, string> = {
  "AugmentedMike": "Amelia",
  "augmentedmike": "Amelia",
  "Amelia McCormick": "Amelia",
  "amelia": "Amelia",
  "claude-coder-bot": "Claude Coder",
  "Claude Coder": "Claude Coder",
  "OpenClaw Bot": "Claude Coder",
  "AM - AugmentedMike": "Amelia",
  "Amelia (MiniClaw OS)": "Amelia",
  "miniclaw-official": "Amelia",
};

export function resolveContributor(
  gitAuthor: string,
  configMap: Record<string, string>,
): string {
  // Check config map first (user overrides)
  if (configMap[gitAuthor]) return configMap[gitAuthor];
  // Check default map
  if (DEFAULT_MAP[gitAuthor]) return DEFAULT_MAP[gitAuthor];
  // Fallback: raw name
  return gitAuthor;
}

export function resolveAllContributors(
  commits: CommitEntry[],
  configMap: Record<string, string>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of commits) {
    if (!map.has(c.author)) {
      map.set(c.author, resolveContributor(c.author, configMap));
    }
  }
  return map;
}

export function attributeCommit(
  commit: CommitEntry,
  config: DevlogConfig,
): string {
  return resolveContributor(commit.author, config.contributorMap);
}
