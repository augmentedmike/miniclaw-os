/**
 * Shared git guardrails for the MiniClaw plugin ecosystem.
 *
 * Wraps git push to enforce branch+PR workflow:
 * - Blocks direct pushes to main/master
 * - Ensures a PR is created after pushing a branch
 * - Provides a pre-push hook template for additional safety
 */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

const PROTECTED_BRANCHES = ["main", "master"];

function run(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { encoding: "utf-8", cwd, timeout: 30_000 }).trim();
}

function ghWithBodyFile(
  subcmd: string[],
  body: string,
  extraArgs: string[],
  cwd?: string
): string {
  const tmpFile = path.join(os.tmpdir(), `mc-guardrail-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  try {
    fs.writeFileSync(tmpFile, body, "utf-8");
    return run("gh", [...subcmd, "--body-file", tmpFile, ...extraArgs], cwd);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

export interface GuardedPushResult {
  /** Whether the push succeeded */
  pushed: boolean;
  /** The branch that was pushed */
  branch: string;
  /** Error message if push was blocked or failed */
  error?: string;
}

export interface GuardedPushAndPRResult extends GuardedPushResult {
  /** URL of the created PR, if any */
  prUrl?: string;
  /** Whether a PR was created */
  prCreated: boolean;
}

/**
 * Check if a branch name is a protected branch (main, master).
 */
export function isProtectedBranch(branch: string): boolean {
  return PROTECTED_BRANCHES.includes(branch.toLowerCase());
}

/**
 * Get the current branch name in a git repo.
 */
export function getCurrentBranch(cwd: string): string {
  return run("git", ["branch", "--show-current"], cwd);
}

/**
 * Push a branch to a remote, blocking pushes to protected branches.
 *
 * @param cwd - The git repo working directory
 * @param remote - Remote name (e.g. "origin", "fork")
 * @param branch - Branch to push (if omitted, uses current branch)
 * @param logger - Logger instance
 * @returns GuardedPushResult with success/failure info
 */
export function guardedPush(
  cwd: string,
  remote: string,
  branch: string | undefined,
  logger: Logger,
): GuardedPushResult {
  const resolvedBranch = branch || getCurrentBranch(cwd);

  if (!resolvedBranch) {
    return { pushed: false, branch: "", error: "Could not determine current branch" };
  }

  if (isProtectedBranch(resolvedBranch)) {
    const msg = `Blocked: direct push to protected branch '${resolvedBranch}' is not allowed. Create a feature branch and submit a PR instead.`;
    logger.error(msg);
    return { pushed: false, branch: resolvedBranch, error: msg };
  }

  try {
    run("git", ["push", "-u", remote, resolvedBranch], cwd);
    logger.info(`Pushed branch '${resolvedBranch}' to remote '${remote}'`);
    return { pushed: true, branch: resolvedBranch };
  } catch (err: unknown) {
    const e = err as { stderr?: string };
    const msg = `Failed to push branch '${resolvedBranch}' to '${remote}': ${e.stderr || "unknown error"}`;
    logger.error(msg);
    return { pushed: false, branch: resolvedBranch, error: msg };
  }
}

/**
 * Push a branch and create a PR in one step.
 * Blocks pushes to protected branches and ensures a PR is always created.
 *
 * @param cwd - The git repo working directory
 * @param remote - Remote name (e.g. "origin", "fork")
 * @param repo - GitHub repo in "owner/name" format for the PR target
 * @param options - PR creation options
 * @param logger - Logger instance
 * @returns GuardedPushAndPRResult with push and PR info
 */
export function guardedPushAndPR(
  cwd: string,
  remote: string,
  repo: string,
  options: {
    branch?: string;
    title: string;
    body: string;
    base?: string;
    draft?: boolean;
  },
  logger: Logger,
): GuardedPushAndPRResult {
  const pushResult = guardedPush(cwd, remote, options.branch, logger);

  if (!pushResult.pushed) {
    return { ...pushResult, prCreated: false };
  }

  const base = options.base || "main";
  const args = ["--repo", repo, "--title", options.title, "--base", base];
  if (options.draft) args.push("--draft");

  try {
    const prUrl = ghWithBodyFile(["pr", "create"], options.body, args, cwd);
    logger.info(`PR created: ${prUrl}`);
    return { ...pushResult, prUrl, prCreated: true };
  } catch (err: unknown) {
    const e = err as { stderr?: string };
    const msg = `Branch pushed but PR creation failed: ${e.stderr || "unknown error"}`;
    logger.warn(msg);
    return { ...pushResult, prCreated: false, error: msg };
  }
}

/**
 * Content for a pre-push git hook that blocks direct pushes to main/master.
 * Install this in .git/hooks/pre-push to enforce the policy at the git level.
 */
export const PRE_PUSH_HOOK_CONTENT = `#!/bin/bash
# MiniClaw pre-push hook — blocks direct pushes to protected branches.
# Install: cp this file to .git/hooks/pre-push && chmod +x .git/hooks/pre-push
# Or run: openclaw mc-contribute install-hook

PROTECTED_BRANCHES="main master"

while read local_ref local_oid remote_ref remote_oid; do
  # Extract the branch name from the remote ref
  remote_branch="\${remote_ref#refs/heads/}"

  for protected in $PROTECTED_BRANCHES; do
    if [ "$remote_branch" = "$protected" ]; then
      echo ""
      echo "🚫 BLOCKED: Direct push to '$protected' is not allowed."
      echo ""
      echo "MiniClaw enforces a branch + pull request workflow."
      echo "Please:"
      echo "  1. Create a feature branch:  git checkout -b my-feature"
      echo "  2. Push the branch:          git push -u origin my-feature"
      echo "  3. Create a PR:              openclaw mc-contribute pr -t 'My change' -s 'Description'"
      echo ""
      exit 1
    fi
  done
done

exit 0
`;

/**
 * Install the pre-push hook in a git repository.
 *
 * @param repoPath - Path to the git repository
 * @param logger - Logger instance
 * @returns true if installed successfully, false otherwise
 */
export function installPrePushHook(repoPath: string, logger: Logger): boolean {
  try {
    const gitDir = run("git", ["rev-parse", "--git-dir"], repoPath);
    const hooksDir = path.resolve(repoPath, gitDir, "hooks");
    const hookPath = path.join(hooksDir, "pre-push");

    // Create hooks directory if it doesn't exist
    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }

    // Check if a pre-push hook already exists
    if (fs.existsSync(hookPath)) {
      const existing = fs.readFileSync(hookPath, "utf-8");
      if (existing.includes("MiniClaw pre-push hook")) {
        logger.info("MiniClaw pre-push hook already installed");
        return true;
      }
      // Back up existing hook
      const backupPath = `${hookPath}.backup-${Date.now()}`;
      fs.copyFileSync(hookPath, backupPath);
      logger.info(`Backed up existing pre-push hook to ${backupPath}`);
    }

    fs.writeFileSync(hookPath, PRE_PUSH_HOOK_CONTENT, { mode: 0o755 });
    logger.info(`Installed MiniClaw pre-push hook at ${hookPath}`);
    return true;
  } catch (err: unknown) {
    const e = err as { message?: string };
    logger.error(`Failed to install pre-push hook: ${e.message || "unknown error"}`);
    return false;
  }
}
