import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface ProcessedEntry {
  timestamp: string;
}

export interface TriageState {
  processedUids: Record<string, ProcessedEntry>;
}

function defaultState(): TriageState {
  return { processedUids: {} };
}

function resolveStatePath(): string {
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
  return path.join(stateDir, "USER", "email-triage-state.json");
}

export function loadTriageState(statePath?: string): TriageState {
  const fp = statePath ?? resolveStatePath();
  if (!fs.existsSync(fp)) return defaultState();
  try {
    const raw = JSON.parse(fs.readFileSync(fp, "utf-8"));
    if (raw && typeof raw.processedUids === "object") {
      return raw as TriageState;
    }
    return defaultState();
  } catch {
    return defaultState();
  }
}

export function saveTriageState(state: TriageState, statePath?: string): void {
  const fp = statePath ?? resolveStatePath();
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(state, null, 2) + "\n", "utf-8");
}

export function isAlreadyProcessed(uid: string, state: TriageState): boolean {
  return uid in state.processedUids;
}

export function markProcessed(uid: string, state: TriageState): TriageState {
  return {
    ...state,
    processedUids: {
      ...state.processedUids,
      [uid]: { timestamp: new Date().toISOString() },
    },
  };
}

/**
 * Filter out UIDs that have already been processed.
 * Returns only the new (unprocessed) UIDs.
 */
export function filterNewUids(uids: string[], state: TriageState): string[] {
  return uids.filter((uid) => !isAlreadyProcessed(uid, state));
}

/**
 * Mark multiple UIDs as processed in one pass.
 */
export function markAllProcessed(uids: string[], state: TriageState): TriageState {
  const now = new Date().toISOString();
  const updated = { ...state.processedUids };
  for (const uid of uids) {
    updated[uid] = { timestamp: now };
  }
  return { ...state, processedUids: updated };
}

/**
 * Prune entries older than `maxAgeDays` to prevent unbounded state growth.
 */
export function pruneState(state: TriageState, maxAgeDays = 90): TriageState {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  const pruned: Record<string, ProcessedEntry> = {};
  for (const [uid, entry] of Object.entries(state.processedUids)) {
    if (new Date(entry.timestamp).getTime() >= cutoff) {
      pruned[uid] = entry;
    }
  }
  return { processedUids: pruned };
}
