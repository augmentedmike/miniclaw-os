import { openDb, type Database } from "./db.js";

export interface ActiveEntry {
  cardId: string;
  projectId?: string;
  title: string;
  worker: string;
  column: string;
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

interface ActiveRow {
  card_id: string;
  project_id: string | null;
  title: string;
  worker: string;
  col: string;
  picked_up_at: string;
}

interface LogRow {
  card_id: string;
  project_id: string | null;
  title: string;
  worker: string;
  col: string;
  action: string;
  at: string;
}

const MAX_LOG = 200;

export class ActiveWorkStore {
  private readonly db: Database;

  constructor(stateDir: string) {
    this.db = openDb(stateDir);
  }

  pickup(entry: Omit<ActiveEntry, "pickedUpAt">): ActiveEntry {
    const now = new Date().toISOString();
    this.db.prepare(`DELETE FROM active_work WHERE card_id = ?`).run(entry.cardId);
    this.db.prepare(
      `INSERT INTO active_work (card_id, project_id, title, worker, col, picked_up_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(entry.cardId, entry.projectId ?? null, entry.title, entry.worker, entry.column, now);
    this.db.prepare(
      `INSERT INTO pickup_log (card_id, project_id, title, worker, col, action, at)
       VALUES (?, ?, ?, ?, ?, 'pickup', ?)`,
    ).run(entry.cardId, entry.projectId ?? null, entry.title, entry.worker, entry.column, now);
    this._trimLog();
    return { ...entry, pickedUpAt: now };
  }

  release(cardId: string, worker: string): boolean {
    const existing = this.db.prepare(`SELECT card_id FROM active_work WHERE card_id = ?`).get(cardId);
    if (!existing) return false;
    this.db.prepare(`DELETE FROM active_work WHERE card_id = ?`).run(cardId);
    this.db.prepare(
      `INSERT INTO pickup_log (card_id, project_id, title, worker, col, action, at)
       VALUES (?, NULL, '', ?, '', 'release', ?)`,
    ).run(cardId, worker, new Date().toISOString());
    this._trimLog();
    return true;
  }

  listActive(): ActiveEntry[] {
    return (this.db.prepare(`SELECT * FROM active_work`).all() as ActiveRow[]).map(r => ({
      cardId: r.card_id,
      projectId: r.project_id ?? undefined,
      title: r.title,
      worker: r.worker,
      column: r.col,
      pickedUpAt: r.picked_up_at,
    }));
  }

  recentLog(limit = 20): PickupEvent[] {
    return (this.db.prepare(
      `SELECT * FROM pickup_log ORDER BY id DESC LIMIT ?`,
    ).all(limit) as LogRow[]).map(r => ({
      cardId: r.card_id,
      projectId: r.project_id ?? undefined,
      title: r.title,
      worker: r.worker,
      column: r.col,
      action: r.action as "pickup" | "release",
      at: r.at,
    }));
  }

  private _trimLog(): void {
    const { c } = this.db.prepare(`SELECT COUNT(*) AS c FROM pickup_log`).get() as { c: number };
    if (c > MAX_LOG) {
      this.db.prepare(
        `DELETE FROM pickup_log WHERE id IN (SELECT id FROM pickup_log ORDER BY id ASC LIMIT ?)`,
      ).run(c - MAX_LOG);
    }
  }
}
