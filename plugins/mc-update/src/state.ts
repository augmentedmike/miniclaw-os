import * as fs from "node:fs";
import * as path from "node:path";
import type { UpdateState, RollbackRef } from "./types.js";

const STATE_FILE = "state.json";
const LOCK_FILE = "update.lock";

function defaultState(): UpdateState {
  return {
    lastCheck: null,
    lastUpdate: null,
    lastResult: null,
    rollbackRefs: [],
    versions: {},
  };
}

export function statePath(pluginDir: string): string {
  return path.join(pluginDir, STATE_FILE);
}

export function loadState(pluginDir: string): UpdateState {
  const fp = statePath(pluginDir);
  if (!fs.existsSync(fp)) return defaultState();
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8")) as UpdateState;
  } catch {
    return defaultState();
  }
}

export function saveState(pluginDir: string, state: UpdateState): void {
  const fp = statePath(pluginDir);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

export function lockPath(pluginDir: string): string {
  return path.join(pluginDir, LOCK_FILE);
}

/** Acquire update lock. Returns true if acquired, false if already locked. */
export function acquireLock(pluginDir: string): boolean {
  const lp = lockPath(pluginDir);
  if (fs.existsSync(lp)) {
    // Check if lock is stale (older than 10 minutes)
    try {
      const stat = fs.statSync(lp);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 10 * 60 * 1000) {
        // Stale lock — remove it
        fs.unlinkSync(lp);
      } else {
        return false;
      }
    } catch {
      return false;
    }
  }

  try {
    fs.writeFileSync(lp, JSON.stringify({ pid: process.pid, time: new Date().toISOString() }), { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

/** Release update lock. */
export function releaseLock(pluginDir: string): void {
  const lp = lockPath(pluginDir);
  try {
    fs.unlinkSync(lp);
  } catch {
    // Already removed
  }
}
