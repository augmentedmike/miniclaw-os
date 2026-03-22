/**
 * src/checkpoint.ts
 *
 * Core git checkpointing engine. Uses annotated git tags prefixed with
 * mc-checkpoint/ to create named restore points. Tags are local, fast,
 * and survive branch switches.
 */

import { execFileSync } from "node:child_process";

// ── Types ────────────────────────────────────────────────────────────────────

export interface Checkpoint {
  tag: string;
  timestamp: Date;
  reason: string;
  branch: string;
  sha: string;
}

export interface CreateOptions {
  repoPath: string;
  reason?: string;
}

export interface ListOptions {
  repoPath: string;
}

export interface RestoreOptions {
  repoPath: string;
  tag: string;
}

export interface PruneOptions {
  repoPath: string;
  maxAgeDays: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function git(repoPath: string, args: string[]): string {
  return execFileSync("git", ["-C", repoPath, ...args], {
    encoding: "utf-8",
    timeout: 30_000,
  }).trim();
}

function isGitRepo(repoPath: string): boolean {
  try {
    git(repoPath, ["rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

function getCurrentBranch(repoPath: string): string {
  try {
    return git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  } catch {
    return "detached";
  }
}

function getHeadSha(repoPath: string): string {
  return git(repoPath, ["rev-parse", "HEAD"]);
}

function generateTagName(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `mc-checkpoint/${ts}`;
}

// ── Core API ─────────────────────────────────────────────────────────────────

/**
 * Create a checkpoint (annotated git tag) at the current HEAD.
 */
export function createCheckpoint(opts: CreateOptions): Checkpoint {
  const { repoPath, reason = "manual checkpoint" } = opts;

  if (!isGitRepo(repoPath)) {
    throw new Error(`Not a git repository: ${repoPath}`);
  }

  const branch = getCurrentBranch(repoPath);
  const sha = getHeadSha(repoPath);
  const tag = generateTagName();
  const timestamp = new Date();

  const message = [
    `reason: ${reason}`,
    `branch: ${branch}`,
    `sha: ${sha}`,
    `timestamp: ${timestamp.toISOString()}`,
  ].join("\n");

  git(repoPath, ["tag", "-a", tag, "-m", message]);

  return { tag, timestamp, reason, branch, sha };
}

/**
 * List all mc-checkpoint/* tags, sorted newest first.
 */
export function listCheckpoints(opts: ListOptions): Checkpoint[] {
  const { repoPath } = opts;

  if (!isGitRepo(repoPath)) {
    throw new Error(`Not a git repository: ${repoPath}`);
  }

  let tagLines: string;
  try {
    tagLines = git(repoPath, [
      "tag", "-l", "mc-checkpoint/*",
      "--sort=-creatordate",
      "--format=%(refname:short)%09%(objectname:short)",
    ]);
  } catch {
    return [];
  }

  if (!tagLines) return [];

  const checkpoints: Checkpoint[] = [];

  for (const line of tagLines.split("\n")) {
    if (!line.trim()) continue;
    const [tag, shortSha] = line.split("\t");
    if (!tag) continue;

    // Parse metadata from tag message
    let reason = "";
    let branch = "";
    let sha = shortSha || "";
    let timestamp = new Date();

    try {
      const msg = git(repoPath, ["tag", "-l", tag, "-n99", "--format=%(contents)"]);
      for (const mLine of msg.split("\n")) {
        if (mLine.startsWith("reason: ")) reason = mLine.slice(8);
        else if (mLine.startsWith("branch: ")) branch = mLine.slice(8);
        else if (mLine.startsWith("sha: ")) sha = mLine.slice(5);
        else if (mLine.startsWith("timestamp: ")) {
          const parsed = new Date(mLine.slice(11));
          if (!isNaN(parsed.getTime())) timestamp = parsed;
        }
      }
    } catch {
      // If we can't parse metadata, extract timestamp from tag name
      const tsMatch = tag.match(/mc-checkpoint\/(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
      if (tsMatch) {
        const isoStr = tsMatch[1].replace(/T(\d{2})-(\d{2})-(\d{2})/, "T$1:$2:$3");
        timestamp = new Date(isoStr + "Z");
      }
    }

    checkpoints.push({ tag, timestamp, reason, branch, sha });
  }

  return checkpoints;
}

/**
 * Restore working tree to a checkpoint state.
 * Stashes uncommitted work first for safety.
 */
export function restoreCheckpoint(opts: RestoreOptions): { stashCreated: boolean; restoredTo: string } {
  const { repoPath, tag } = opts;

  if (!isGitRepo(repoPath)) {
    throw new Error(`Not a git repository: ${repoPath}`);
  }

  // Verify tag exists
  try {
    git(repoPath, ["rev-parse", tag]);
  } catch {
    throw new Error(`Checkpoint not found: ${tag}`);
  }

  // Stash uncommitted work if any
  let stashCreated = false;
  const status = git(repoPath, ["status", "--porcelain"]);
  if (status.length > 0) {
    git(repoPath, ["stash", "push", "-m", `mc-checkpoint: auto-stash before restore to ${tag}`]);
    stashCreated = true;
  }

  // Get the SHA the tag points to (dereference annotated tags)
  const targetSha = git(repoPath, ["rev-list", "-1", tag]);

  // Reset to the checkpoint
  git(repoPath, ["reset", "--hard", targetSha]);

  return { stashCreated, restoredTo: targetSha };
}

/**
 * Delete checkpoints older than maxAgeDays.
 */
export function pruneCheckpoints(opts: PruneOptions): string[] {
  const { repoPath, maxAgeDays } = opts;

  const checkpoints = listCheckpoints({ repoPath });
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - maxAgeDays);

  const deleted: string[] = [];

  for (const cp of checkpoints) {
    if (cp.timestamp < cutoff) {
      try {
        git(repoPath, ["tag", "-d", cp.tag]);
        deleted.push(cp.tag);
      } catch {
        // Skip tags that can't be deleted
      }
    }
  }

  return deleted;
}

/**
 * Auto-checkpoint: creates a checkpoint with an operation-specific reason.
 * Called by git hooks before destructive operations.
 */
export function autoCheckpoint(repoPath: string, operation: string): Checkpoint {
  return createCheckpoint({
    repoPath,
    reason: `auto: before ${operation}`,
  });
}
