import { execFileSync } from "node:child_process";
import type { UpdateConfig, RollbackRef } from "./types.js";
import { checkAll, updateRepo, rollbackRepo } from "./updater.js";
import { runSmoke } from "./verify.js";
import { loadState, saveState, acquireLock, releaseLock } from "./state.js";

type Logger = { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };

/** Take a backup via mc-backup before applying updates. */
function takeBackup(logger: Logger): boolean {
  try {
    execFileSync("openclaw", ["mc-backup", "now"], {
      encoding: "utf-8",
      timeout: 300_000,
    });
    logger.info("Pre-update backup complete");
    return true;
  } catch (e) {
    logger.warn(`Pre-update backup failed: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

/**
 * Full update flow:
 * 1. Acquire lock
 * 2. Check for available updates
 * 3. Take mc-backup snapshot
 * 4. Apply updates to each repo
 * 5. Run mc-smoke to verify
 * 6. Rollback on failure (if autoRollback enabled)
 * 7. Save state and release lock
 */
export async function runFullUpdate(
  cfg: UpdateConfig,
  logger: Logger,
): Promise<"success" | "no-updates" | "failed" | "rolled-back" | "locked"> {
  // 1. Acquire lock
  if (!acquireLock(cfg.pluginDir)) {
    logger.warn("Another update is already running (lock file exists)");
    return "locked";
  }

  try {
    const state = loadState(cfg.pluginDir);

    // 2. Check for updates
    const checks = checkAll(cfg);
    state.lastCheck = new Date().toISOString();

    const updatable = checks.filter((c) => c.hasUpdate);
    if (updatable.length === 0) {
      logger.info("All repos are up to date");
      saveState(cfg.pluginDir, state);
      return "no-updates";
    }

    logger.info(`${updatable.length} repo(s) have updates available`);

    // 3. Take backup
    takeBackup(logger);

    // 4. Apply updates
    const rollbackRefs: RollbackRef[] = [];
    for (const check of updatable) {
      const ref = updateRepo(check.repo, logger);
      if (ref) rollbackRefs.push(ref);
    }

    if (rollbackRefs.length === 0) {
      logger.warn("No repos were actually updated");
      state.lastResult = "failed";
      saveState(cfg.pluginDir, state);
      return "failed";
    }

    state.rollbackRefs = rollbackRefs;
    state.lastUpdate = new Date().toISOString();

    // Update version tracking
    for (const ref of rollbackRefs) {
      state.versions[ref.name] = ref.updatedRef;
    }

    // 5. Run mc-smoke
    logger.info("Running mc-smoke verification...");
    const smokeResult = runSmoke(cfg.smokeTimeout);

    if (smokeResult.passed) {
      logger.info("mc-smoke passed — update successful");
      state.lastResult = "success";
      saveState(cfg.pluginDir, state);
      return "success";
    }

    // 6. Smoke failed
    logger.error(`mc-smoke FAILED (exit ${smokeResult.exitCode}): ${smokeResult.output}`);

    if (cfg.autoRollback) {
      logger.info("Auto-rollback enabled — reverting all changes");
      let allRolledBack = true;
      for (const ref of rollbackRefs) {
        if (!rollbackRepo(ref, logger)) {
          allRolledBack = false;
        }
      }
      state.lastResult = "rolled-back";
      saveState(cfg.pluginDir, state);
      return allRolledBack ? "rolled-back" : "failed";
    }

    state.lastResult = "failed";
    saveState(cfg.pluginDir, state);
    return "failed";
  } finally {
    releaseLock(cfg.pluginDir);
  }
}
