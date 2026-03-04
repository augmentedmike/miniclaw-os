import * as fs from "node:fs";
import * as path from "node:path";

export interface ActiveEntry {
  cardId: string;
  projectId?: string;
  title: string;
  worker: string;   // e.g. "board-worker-backlog"
  column: string;   // column being worked in
  pickedUpAt: string;
}

export interface PickupEvent {
  cardId: string;
  projectId?: string;
  title: string;
  worker: string;
  column: string;
  action: "pickup" | "release";
  at: string;
}

interface ActiveWorkState {
  active: ActiveEntry[];
  log: PickupEvent[];
}

const MAX_LOG = 200;

export class ActiveWorkStore {
  private readonly file: string;

  constructor(stateDir: string) {
    this.file = path.join(stateDir, "active-work.json");
  }

  private _read(): ActiveWorkState {
    try {
      return JSON.parse(fs.readFileSync(this.file, "utf-8")) as ActiveWorkState;
    } catch {
      return { active: [], log: [] };
    }
  }

  private _write(state: ActiveWorkState): void {
    fs.writeFileSync(this.file, JSON.stringify(state, null, 2), "utf-8");
  }

  pickup(entry: Omit<ActiveEntry, "pickedUpAt">): ActiveEntry {
    const state = this._read();
    // Remove any existing entry for this card (re-pickup replaces)
    state.active = state.active.filter(e => e.cardId !== entry.cardId);
    const now = new Date().toISOString();
    const active: ActiveEntry = { ...entry, pickedUpAt: now };
    state.active.push(active);
    state.log.push({ ...entry, action: "pickup", at: now });
    if (state.log.length > MAX_LOG) state.log = state.log.slice(-MAX_LOG);
    this._write(state);
    return active;
  }

  release(cardId: string, worker: string): boolean {
    const state = this._read();
    const before = state.active.length;
    state.active = state.active.filter(e => e.cardId !== cardId);
    const released = state.active.length < before;
    if (released) {
      state.log.push({ cardId, worker, title: "", column: "", action: "release", at: new Date().toISOString() });
      if (state.log.length > MAX_LOG) state.log = state.log.slice(-MAX_LOG);
      this._write(state);
    }
    return released;
  }

  listActive(): ActiveEntry[] {
    return this._read().active;
  }

  recentLog(limit = 20): PickupEvent[] {
    const log = this._read().log;
    return log.slice(-limit).reverse();
  }
}
