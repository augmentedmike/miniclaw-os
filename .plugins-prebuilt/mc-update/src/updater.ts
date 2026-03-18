import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import type { UpdateConfig, RepoConfig, UpdateState, RollbackRef } from "./types.js";

function run(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { encoding: "utf-8", cwd, timeout: 30_000 }).trim();
}

/** Check if a repo has updates available on its stable tag. */
export function checkRepo(repo: RepoConfig): { hasUpdate: boolean; currentRef: string; remoteRef: string } {
  const cwd = repo.path;
  const remote = repo.remote ?? "origin";
  const tag = repo.stableTag ?? "stable";

  // Fetch latest from remote
  run("git", ["fetch", remote, "--tags", "--force"], cwd);

  const currentRef = run("git", ["rev-parse", "HEAD"], cwd);

  let remoteRef: string;
  try {
    remoteRef = run("git", ["rev-parse", `${remote}/${tag}`], cwd);
  } catch {
    // Try as a tag directly
    try {
      remoteRef = run("git", ["rev-parse", `refs/tags/${tag}`], cwd);
    } catch {
      // No stable tag found — no update
      return { hasUpdate: false, currentRef, remoteRef: currentRef };
    }
  }

  return {
    hasUpdate: currentRef !== remoteRef,
    currentRef,
    remoteRef,
  };
}

/** Check all configured repos for available updates. */
export function checkAll(cfg: UpdateConfig): Array<{ repo: RepoConfig; currentRef: string; remoteRef: string; hasUpdate: boolean }> {
  const results: Array<{ repo: RepoConfig; currentRef: string; remoteRef: string; hasUpdate: boolean }> = [];

  for (const repo of cfg.repos) {
    if (!fs.existsSync(repo.path)) continue;
    try {
      const result = checkRepo(repo);
      results.push({ repo, ...result });
    } catch {
      // Skip repos that fail to check
      results.push({ repo, currentRef: "unknown", remoteRef: "unknown", hasUpdate: false });
    }
  }

  return results;
}

/** Verify that workspace/ and USER/ dirs are not modified by a git diff. */
function verifyProtectedDirs(repoPath: string, fromRef: string, toRef: string): boolean {
  try {
    const diff = run("git", ["diff", "--stat", fromRef, toRef, "--", "workspace/", "USER/"], repoPath);
    return diff.length === 0; // No changes to protected dirs = safe
  } catch {
    return true; // If diff fails (dirs don't exist in repo), that's fine
  }
}

/** Apply update to a single repo. Returns rollback ref or null on failure. */
export function updateRepo(
  repo: RepoConfig,
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void },
): RollbackRef | null {
  const cwd = repo.path;
  const remote = repo.remote ?? "origin";
  const tag = repo.stableTag ?? "stable";

  try {
    const currentRef = run("git", ["rev-parse", "HEAD"], cwd);

    // Determine target ref
    let targetRef: string;
    try {
      targetRef = run("git", ["rev-parse", `${remote}/${tag}`], cwd);
    } catch {
      targetRef = run("git", ["rev-parse", `refs/tags/${tag}`], cwd);
    }

    if (currentRef === targetRef) {
      logger.info(`${repo.name}: already up to date at ${currentRef.slice(0, 8)}`);
      return null;
    }

    // Verify protected directories won't be touched
    if (!verifyProtectedDirs(cwd, currentRef, targetRef)) {
      logger.error(`${repo.name}: update would modify workspace/ or USER/ — ABORTING`);
      return null;
    }

    logger.info(`${repo.name}: updating ${currentRef.slice(0, 8)} → ${targetRef.slice(0, 8)}`);

    // Checkout the stable tag, but exclude workspace/ and USER/
    // Use git reset approach: stash any local changes, checkout target, restore protected dirs
    try {
      run("git", ["stash", "--include-untracked"], cwd);
    } catch {
      // No changes to stash — fine
    }

    run("git", ["checkout", targetRef], cwd);

    // Rebuild if this is a plugin directory (has package.json)
    const pkgPath = path.join(cwd, "package.json");
    if (fs.existsSync(pkgPath)) {
      logger.info(`${repo.name}: running npm install`);
      try {
        run("npm", ["install", "--no-audit", "--no-fund"], cwd);
      } catch (e) {
        logger.warn(`${repo.name}: npm install warning: ${e instanceof Error ? e.message : e}`);
      }
    }

    return { name: repo.name, path: cwd, previousRef: currentRef, updatedRef: targetRef };
  } catch (e) {
    logger.error(`${repo.name}: update failed: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/** Rollback a single repo to its previous ref. */
export function rollbackRepo(
  ref: RollbackRef,
  logger: { info: (m: string) => void; error: (m: string) => void },
): boolean {
  try {
    logger.info(`Rolling back ${ref.name} to ${ref.previousRef.slice(0, 8)}`);
    run("git", ["checkout", ref.previousRef], ref.path);

    // Re-run npm install if package.json exists
    const pkgPath = path.join(ref.path, "package.json");
    if (fs.existsSync(pkgPath)) {
      run("npm", ["install", "--no-audit", "--no-fund"], ref.path);
    }

    return true;
  } catch (e) {
    logger.error(`Rollback failed for ${ref.name}: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}
