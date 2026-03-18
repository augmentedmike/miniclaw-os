import { execFileSync } from "node:child_process";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

interface RepoProtectionConfig {
  defaultRepo?: string;
  protectedBranches?: string[];
  ownerUsername?: string;
}

function run(cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { encoding: "utf-8", timeout: 30_000 }).trim();
}

function ghApi(method: string, endpoint: string, body?: Record<string, unknown>): string {
  const args = ["api", "-X", method, endpoint];
  if (body) {
    args.push("--input", "-");
    return execFileSync("gh", args, {
      encoding: "utf-8",
      timeout: 30_000,
      input: JSON.stringify(body),
    }).trim();
  }
  return run("gh", args);
}

function getOwnerUsername(cfg: RepoProtectionConfig, logger: Logger): string {
  if (cfg.ownerUsername) return cfg.ownerUsername;
  try {
    const status = run("gh", ["auth", "status"]);
    // Extract username from "Logged in to github.com account username"
    const match = status.match(/account\s+(\S+)/);
    if (match) return match[1];
    // Fallback: use gh api
    const userJson = run("gh", ["api", "user", "--jq", ".login"]);
    if (userJson) return userJson;
  } catch {
    // ignore
  }
  logger.warn("Could not auto-detect owner username from gh auth");
  return "";
}

function resolveRepo(cfg: RepoProtectionConfig): string {
  if (cfg.defaultRepo) return cfg.defaultRepo;
  try {
    const remote = run("git", ["remote", "get-url", "origin"]);
    const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+)/);
    if (match) return match[1];
  } catch { /* ignore */ }
  throw new Error("No defaultRepo configured and could not detect from git remote");
}

/**
 * Enforce branch protection rules on a repository.
 * Sets: require PRs, require status checks, no force push, enforce for admins.
 */
async function enforceBranchProtection(
  repo: string,
  branch: string,
  owner: string,
  logger: Logger,
): Promise<void> {
  const endpoint = `/repos/${repo}/branches/${branch}/protection`;
  const protectionBody = {
    required_status_checks: {
      strict: true,
      contexts: [],
    },
    enforce_admins: true,
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false,
      required_approving_review_count: 1,
    },
    restrictions: owner
      ? { users: [owner], teams: [], apps: [] }
      : null,
    allow_force_pushes: false,
    allow_deletions: false,
  };

  try {
    ghApi("PUT", endpoint, protectionBody);
    logger.info(`Branch protection set on ${repo}/${branch}`);
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    logger.warn(`Failed to set branch protection on ${repo}/${branch}: ${e.stderr || e.message || "unknown"}`);
  }
}

/**
 * Remove non-owner collaborators entirely.
 * Fork-and-PR is the only contribution path — no direct collaborator access.
 * The owner retains admin. Everyone else is removed.
 */
async function enforceCollaboratorPermissions(
  repo: string,
  owner: string,
  logger: Logger,
): Promise<void> {
  if (!owner) {
    logger.warn("No owner username — skipping collaborator permission enforcement");
    return;
  }

  try {
    const collabJson = ghApi("GET", `/repos/${repo}/collaborators?affiliation=direct`);
    const collaborators = JSON.parse(collabJson) as Array<{
      login: string;
      permissions: Record<string, boolean>;
      role_name?: string;
    }>;

    for (const collab of collaborators) {
      if (collab.login.toLowerCase() === owner.toLowerCase()) continue;

      // Remove non-owner collaborators entirely — fork-and-PR only policy
      try {
        ghApi("DELETE", `/repos/${repo}/collaborators/${collab.login}`);
        logger.info(`Removed collaborator ${collab.login} from ${repo} (fork-and-PR only policy)`);
      } catch (err: unknown) {
        const e = err as { stderr?: string; message?: string };
        logger.warn(`Failed to remove collaborator ${collab.login}: ${e.stderr || e.message || "unknown"}`);
      }
    }
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    logger.warn(`Failed to list collaborators for ${repo}: ${e.stderr || e.message || "unknown"}`);
  }
}

/**
 * Check for unauthorized direct pushes to protected branches and revert them.
 * Looks at recent push events by non-owner users.
 */
async function detectAndRevertUnauthorizedPushes(
  repo: string,
  branch: string,
  owner: string,
  logger: Logger,
): Promise<void> {
  if (!owner) {
    logger.warn("No owner username — skipping push audit");
    return;
  }

  try {
    const eventsJson = ghApi("GET", `/repos/${repo}/events?per_page=50`);
    const events = JSON.parse(eventsJson) as Array<{
      type: string;
      actor: { login: string };
      payload: {
        ref?: string;
        before?: string;
        head?: string;
        forced?: boolean;
      };
      created_at: string;
    }>;

    // Filter push events to the protected branch by non-owner
    const suspiciousPushes = events.filter((e) => {
      if (e.type !== "PushEvent") return false;
      const ref = e.payload.ref;
      if (!ref || !ref.endsWith(`/${branch}`)) return false;
      if (e.actor.login.toLowerCase() === owner.toLowerCase()) return false;
      return true;
    });

    if (suspiciousPushes.length === 0) {
      logger.info(`No unauthorized pushes detected on ${repo}/${branch}`);
      return;
    }

    for (const push of suspiciousPushes) {
      const beforeSha = push.payload.before;
      if (!beforeSha || beforeSha === "0000000000000000000000000000000000000000") {
        logger.warn(`Unauthorized push by ${push.actor.login} on ${branch} but no before SHA to revert to`);
        continue;
      }

      logger.warn(
        `Unauthorized push detected: ${push.actor.login} pushed to ${branch} at ${push.created_at}. ` +
        `Reverting to ${beforeSha}`,
      );

      try {
        // Use the GitHub API to update the branch ref back to the prior commit
        ghApi("PATCH", `/repos/${repo}/git/refs/heads/${branch}`, {
          sha: beforeSha,
          force: true,
        });
        logger.info(`Reverted ${branch} to ${beforeSha} (undoing push by ${push.actor.login})`);
      } catch (err: unknown) {
        const e = err as { stderr?: string; message?: string };
        logger.warn(`Failed to revert push: ${e.stderr || e.message || "unknown"}`);
      }

      // Only revert the most recent unauthorized push to avoid cascading issues
      break;
    }
  } catch (err: unknown) {
    const e = err as { stderr?: string; message?: string };
    logger.warn(`Failed to check events for ${repo}: ${e.stderr || e.message || "unknown"}`);
  }
}

/**
 * Main enforcement function — runs all protection checks for a repo.
 */
export async function enforceRepoProtection(
  cfg: RepoProtectionConfig,
  logger: Logger,
): Promise<void> {
  // Verify gh auth
  try {
    run("gh", ["auth", "status"]);
  } catch {
    logger.warn("gh auth not available — skipping repo protection enforcement");
    return;
  }

  let repo: string;
  try {
    repo = resolveRepo(cfg);
  } catch (err: unknown) {
    const e = err as { message?: string };
    logger.warn(`Cannot resolve repo: ${e.message || "unknown"}`);
    return;
  }

  const owner = getOwnerUsername(cfg, logger);
  const branches = cfg.protectedBranches ?? ["main"];

  logger.info(`Enforcing repo protection on ${repo} (branches: ${branches.join(", ")}, owner: ${owner || "unknown"})`);

  for (const branch of branches) {
    await enforceBranchProtection(repo, branch, owner, logger);
    await detectAndRevertUnauthorizedPushes(repo, branch, owner, logger);
  }

  await enforceCollaboratorPermissions(repo, owner, logger);

  logger.info(`Repo protection enforcement complete for ${repo}`);
}
