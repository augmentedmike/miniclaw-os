/**
 * agent-queue.ts — Persistent queue for agent work requests.
 *
 * The web server writes to this table (status=pending) then returns 202.
 * The agent-runner daemon polls this table, spawns claude, and updates rows on completion.
 *
 * Table lives in the same board.db as cards.
 */

import Database from "better-sqlite3";
import * as path from "node:path";
import * as os from "node:os";

function resolveDbPath(): string {
  if (process.env.BOARD_DB_PATH) return process.env.BOARD_DB_PATH;
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".miniclaw");
  return path.join(stateDir, "user/augmentedmike_bot/brain/board.db");
}

export function getQueueDb(): Database.Database {
  const db = new Database(resolveDbPath());
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_queue (
      id          TEXT PRIMARY KEY,
      card_id     TEXT NOT NULL,
      col         TEXT NOT NULL,
      prompt      TEXT NOT NULL,
      worker      TEXT NOT NULL DEFAULT 'board-worker-in-progress',
      status      TEXT NOT NULL DEFAULT 'pending',
      created_at  TEXT NOT NULL,
      started_at  TEXT,
      ended_at    TEXT,
      pid         INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_agent_queue_status ON agent_queue(status);
    CREATE INDEX IF NOT EXISTS idx_agent_queue_card   ON agent_queue(card_id);
  `);
  return db;
}

export interface QueueRow {
  id: string;
  card_id: string;
  col: string;
  prompt: string;
  worker: string;
  status: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  pid: number | null;
}

/** Enqueue a work request. Returns the generated row id.
 *  If the card already has a pending or running entry, returns the existing id (no duplicate). */
export function enqueue(cardId: string, col: string, prompt: string, worker = "board-worker-in-progress"): string {
  const db = getQueueDb();
  try {
    const existing = db.prepare(
      `SELECT id FROM agent_queue WHERE card_id = ? AND status IN ('pending', 'running') LIMIT 1`,
    ).get(cardId) as { id: string } | undefined;
    if (existing) return existing.id;

    const id = `${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}-${cardId}`;
    db.prepare(
      `INSERT INTO agent_queue (id, card_id, col, prompt, worker, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    ).run(id, cardId, col, prompt, worker, new Date().toISOString());
    return id;
  } finally {
    db.close();
  }
}

/** Claim up to `limit` pending rows atomically. Returns claimed rows. */
export function claimPending(limit = 1): QueueRow[] {
  const db = getQueueDb();
  try {
    const rows = db.prepare(
      `SELECT * FROM agent_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
    ).all(limit) as QueueRow[];

    for (const row of rows) {
      db.prepare(
        `UPDATE agent_queue SET status = 'running', started_at = ? WHERE id = ? AND status = 'pending'`,
      ).run(new Date().toISOString(), row.id);
    }
    return rows;
  } finally {
    db.close();
  }
}

/** Mark a queue row as done and record exit info. */
export function markDone(id: string, exitCode: number | null, pid: number | null): void {
  const db = getQueueDb();
  db.prepare(
    `UPDATE agent_queue SET status = 'done', ended_at = ?, pid = ? WHERE id = ?`,
  ).run(new Date().toISOString(), pid, id);
  db.close();
}

/** Mark a queue row as failed. */
export function markFailed(id: string, reason: string): void {
  const db = getQueueDb();
  db.prepare(
    `UPDATE agent_queue SET status = 'failed', ended_at = ? WHERE id = ?`,
  ).run(new Date().toISOString(), id);
  db.close();
}

/** On runner startup: reset any 'running' rows left by a previous crashed runner. */
export function resetStaleRunning(): number {
  const db = getQueueDb();
  const result = db.prepare(
    `UPDATE agent_queue SET status = 'pending', started_at = NULL WHERE status = 'running'`,
  ).run();
  db.close();
  return result.changes;
}
