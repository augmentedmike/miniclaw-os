/**
 * mc-devlog type definitions
 */

export interface DevlogConfig {
  repoDir: string;
  githubRepo: string;
  discussionCategory: string;
  postsDir: string;
  contributorMap: Record<string, string>;
  substackEnabled: boolean;
  redditDigestDir: string;
  timezone: string;
}

export interface CommitEntry {
  hash: string;
  author: string;
  message: string;
  date: string;
}

export interface PREntry {
  number: number;
  title: string;
  author: string;
  mergedAt: string;
}

export interface IssueEntry {
  number: number;
  title: string;
  closedAt: string;
}

export interface BoardCard {
  id: string;
  title: string;
  assignee?: string;
}

export interface GatheredActivity {
  date: string;
  commits: CommitEntry[];
  prs: PREntry[];
  issues: IssueEntry[];
  shippedCards: BoardCard[];
  contributors: string[];
}

export interface DevlogPost {
  title: string;
  date: string;
  markdown: string;
  contributors: string[];
  commitCount: number;
  prCount: number;
  issueCount: number;
}
