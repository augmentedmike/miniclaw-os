/**
 * Fork detection and auto-fork logic for mc-contribute.
 *
 * Before pushing, checks if the current origin is owned by the user.
 * If not, ensures a fork exists and returns the correct remote to push to.
 */

import { execFileSync } from "child_process";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

function run(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { encoding: "utf-8", cwd, timeout: 30_000 }).trim();
}

export interface ForkResult {
  /** The remote name to push to (e.g. "origin" or "fork") */
  pushRemote: string;
  /** Whether we're pushing to a fork (true) or directly to origin (false) */
  isFork: boolean;
  /** Human-readable explanation of what happened */
  message: string;
}

/**
 * Get the currently authenticated GitHub username.
 */
export function getCurrentUser(): string {
  return run("gh", ["api", "user", "--jq", ".login"]);
}

/**
 * Get the owner and repo from a git remote URL.
 */
export function parseRemoteRepo(cwd: string, remoteName: string): { owner: string; repo: string; full: string } | null {
  try {
    const url = run("git", ["remote", "get-url", remoteName], cwd);
    // Match both HTTPS and SSH formats
    const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    if (match) {
      return { owner: match[1], repo: match[2], full: `${match[1]}/${match[2]}` };
    }
  } catch {
    // Remote doesn't exist or can't be read
  }
  return null;
}

/**
 * Check if the origin remote is owned by the current user.
 * If not, ensure a fork exists and add it as a remote.
 *
 * Returns the remote name to push to and whether it's a fork.
 */
export function ensureForkRemote(
  cwd: string,
  upstreamRepo: string,
  configuredForkRemote: string,
  logger: Logger,
): ForkResult {
  let currentUser: string;
  try {
    currentUser = getCurrentUser();
  } catch {
    logger.warn("Could not determine current GitHub user — falling back to configured fork remote");
    return {
      pushRemote: configuredForkRemote,
      isFork: false,
      message: "Could not determine GitHub user; using configured remote",
    };
  }

  const originInfo = parseRemoteRepo(cwd, "origin");
  if (!originInfo) {
    logger.warn("No origin remote found — using configured fork remote");
    return {
      pushRemote: configuredForkRemote,
      isFork: false,
      message: "No origin remote detected",
    };
  }

  // If origin is owned by the current user, push directly
  if (originInfo.owner.toLowerCase() === currentUser.toLowerCase()) {
    logger.info(`Origin ${originInfo.full} is owned by ${currentUser} — pushing directly`);
    return {
      pushRemote: "origin",
      isFork: false,
      message: `Origin is user-owned (${currentUser}/${originInfo.repo})`,
    };
  }

  // Origin is NOT owned by current user — need a fork
  logger.info(`Origin ${originInfo.full} is not owned by ${currentUser} — ensuring fork exists`);

  // Check if a fork remote already exists
  const forkRemoteName = "fork";
  const existingFork = parseRemoteRepo(cwd, forkRemoteName);
  if (existingFork && existingFork.owner.toLowerCase() === currentUser.toLowerCase()) {
    logger.info(`Fork remote already exists: ${existingFork.full}`);
    return {
      pushRemote: forkRemoteName,
      isFork: true,
      message: `Using existing fork remote (${existingFork.full})`,
    };
  }

  // Also check if the configured fork remote points to user's fork
  if (configuredForkRemote !== "origin" && configuredForkRemote !== forkRemoteName) {
    const cfgFork = parseRemoteRepo(cwd, configuredForkRemote);
    if (cfgFork && cfgFork.owner.toLowerCase() === currentUser.toLowerCase()) {
      logger.info(`Configured remote '${configuredForkRemote}' is user's fork: ${cfgFork.full}`);
      return {
        pushRemote: configuredForkRemote,
        isFork: true,
        message: `Using configured fork remote '${configuredForkRemote}' (${cfgFork.full})`,
      };
    }
  }

  // Fork doesn't exist or isn't set up — create it
  try {
    // gh repo fork will fork the upstream and optionally add a remote
    run("gh", ["repo", "fork", upstreamRepo, "--clone=false"], cwd);
    logger.info(`Forked ${upstreamRepo} to ${currentUser}/${originInfo.repo}`);
  } catch (err: unknown) {
    // Fork may already exist on GitHub — that's fine
    const e = err as { stderr?: string };
    if (e.stderr && e.stderr.includes("already exists")) {
      logger.info(`Fork already exists on GitHub for ${currentUser}`);
    } else {
      logger.warn(`Fork creation returned: ${e.stderr || "unknown"} — proceeding anyway`);
    }
  }

  // Add or update the fork remote
  const forkUrl = `https://github.com/${currentUser}/${originInfo.repo}.git`;
  try {
    // Try to add the remote
    run("git", ["remote", "add", forkRemoteName, forkUrl], cwd);
    logger.info(`Added remote '${forkRemoteName}' -> ${forkUrl}`);
  } catch {
    // Remote may already exist — update its URL
    try {
      run("git", ["remote", "set-url", forkRemoteName, forkUrl], cwd);
      logger.info(`Updated remote '${forkRemoteName}' -> ${forkUrl}`);
    } catch (err: unknown) {
      const e = err as { stderr?: string };
      logger.warn(`Failed to set fork remote: ${e.stderr || "unknown"}`);
      return {
        pushRemote: configuredForkRemote,
        isFork: false,
        message: `Failed to configure fork remote — falling back to '${configuredForkRemote}'`,
      };
    }
  }

  return {
    pushRemote: forkRemoteName,
    isFork: true,
    message: `Auto-forked ${upstreamRepo} and added remote '${forkRemoteName}' (${forkUrl})`,
  };
}

/**
 * Validate that a push target is NOT the upstream repo when the user doesn't own it.
 * Returns an error message if pushing directly to upstream is attempted, null if OK.
 */
export function validatePushTarget(
  cwd: string,
  remoteName: string,
  upstreamRepo: string,
  logger: Logger,
): string | null {
  let currentUser: string;
  try {
    currentUser = getCurrentUser();
  } catch {
    // Can't verify — allow the push but warn
    logger.warn("Could not verify push target ownership — proceeding cautiously");
    return null;
  }

  const remoteInfo = parseRemoteRepo(cwd, remoteName);
  if (!remoteInfo) return null;

  // If the remote points to the upstream repo and the user doesn't own it, block
  if (
    remoteInfo.full.toLowerCase() === upstreamRepo.toLowerCase() &&
    remoteInfo.owner.toLowerCase() !== currentUser.toLowerCase()
  ) {
    return (
      `Refusing to push directly to upstream repo ${upstreamRepo} — ` +
      `you (${currentUser}) are not the owner. ` +
      `Use a fork instead. Run 'mc mc-contribute pr' which auto-forks.`
    );
  }

  return null;
}
