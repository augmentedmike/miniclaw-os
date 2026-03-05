/**
 * data.ts — board data access layer for the web UI.
 *
 * Reads directly from the SQLite DB (better-sqlite3).
 * Mutations go through the CLI via actions.ts (to enforce gate logic).
 *
 * DB path: $BOARD_DB_PATH or $OPENCLAW_STATE_DIR/user/augmentedmike_bot/brain/board.db
 */

import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";
import type { Card, Column, Priority, Project, ActiveEntry, HistoryEntry, LogEntry } from "./types";

// ---- DB path resolution ----

function resolveDbPath(): string {
  if (process.env.BOARD_DB_PATH) return process.env.BOARD_DB_PATH;
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(require("node:os").homedir(), ".miniclaw");
  return path.join(stateDir, "user/augmentedmike_bot/brain/board.db");
}

// Lazy singleton connection — opened on first call, reused for the lifetime of the process.
let _db: Database.Database | null = null;

function getDb(): Database.Database | null {
  if (_db) return _db;
  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) return null;
  try {
    _db = new Database(dbPath, { readonly: true });
    return _db;
  } catch {
    return null;
  }
}

// ---- Row types ----

interface CardRow {
  id: string;
  title: string;
  col: string;
  priority: string;
  tags: string;
  project_id: string | null;
  work_type: string | null;
  linked_card_id: string | null;
  created_at: string;
  updated_at: string;
  problem_description: string;
  implementation_plan: string;
  acceptance_criteria: string;
  notes: string;
  review_notes: string;
  research: string;
}

interface HistoryRow {
  card_id: string;
  col: string;
  moved_at: string;
}

interface ProjectRow {
  id: string;
  name: string;
  description: string;
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

// ---- Card helpers ----

function rowToCard(row: CardRow, history: HistoryRow[]): Card {
  return {
    id: row.id,
    title: row.title,
    column: row.col as Column,
    priority: row.priority as Priority,
    tags: JSON.parse(row.tags) as string[],
    project_id: row.project_id ?? undefined,
    work_type: row.work_type ? (row.work_type as "work" | "verify") : undefined,
    linked_card_id: row.linked_card_id ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    history: history.map(h => ({ column: h.col as Column, moved_at: h.moved_at })) as HistoryEntry[],
    problem_description: row.problem_description,
    implementation_plan: row.implementation_plan,
    acceptance_criteria: row.acceptance_criteria,
    notes: row.notes,
    review_notes: row.review_notes,
    research: row.research,
  };
}

function attachHistory(db: Database.Database, cards: Card[]): Card[] {
  if (cards.length === 0) return [];
  const ids = cards.map(c => c.id);
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT card_id, col, moved_at FROM card_history WHERE card_id IN (${placeholders}) ORDER BY id ASC`,
  ).all(...ids) as HistoryRow[];
  const byCard = new Map<string, HistoryRow[]>();
  for (const r of rows) {
    const list = byCard.get(r.card_id) ?? [];
    list.push(r);
    byCard.set(r.card_id, list);
  }
  return cards.map(c => ({ ...c, history: (byCard.get(c.id) ?? []).map(h => ({ column: h.col as Column, moved_at: h.moved_at })) }));
}

// ---- Public API ----

export function listCards(projectId?: string): Card[] {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = projectId
      ? (db.prepare(`SELECT * FROM cards WHERE project_id = ?`).all(projectId) as CardRow[])
      : (db.prepare(`SELECT * FROM cards`).all() as CardRow[]);
    const cards = rows.map(r => rowToCard(r, []));
    return attachHistory(db, cards);
  } catch { return []; }
}

export function getCard(id: string): Card | null {
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare(`SELECT * FROM cards WHERE id = ?`).get(id) as CardRow | undefined;
    if (!row) return null;
    const history = db.prepare(
      `SELECT card_id, col, moved_at FROM card_history WHERE card_id = ? ORDER BY id ASC`,
    ).all(row.id) as HistoryRow[];
    return rowToCard(row, history);
  } catch { return null; }
}

export function listProjects(): Project[] {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = db.prepare(
      `SELECT id, name, description FROM projects WHERE status = 'active' ORDER BY created_at ASC`,
    ).all() as ProjectRow[];
    return rows.map(r => ({ id: r.id, name: r.name, description: r.description }));
  } catch { return []; }
}

export function getActiveWork(): { active: ActiveEntry[]; log: LogEntry[] } {
  const db = getDb();
  if (!db) return { active: [], log: [] };
  try {
    const activeRows = db.prepare(`SELECT * FROM active_work`).all() as ActiveRow[];
    const logRows = db.prepare(
      `SELECT card_id, project_id, title, worker, col, action, at FROM pickup_log ORDER BY id DESC LIMIT 200`,
    ).all() as LogRow[];

    const active: ActiveEntry[] = activeRows.map(r => ({
      cardId: r.card_id,
      projectId: r.project_id ?? undefined,
      title: r.title,
      worker: r.worker,
      column: r.col,
      pickedUpAt: r.picked_up_at,
    }));

    const log: LogEntry[] = logRows.map(r => ({
      cardId: r.card_id,
      projectId: r.project_id ?? undefined,
      title: r.title,
      worker: r.worker,
      column: r.col,
      action: r.action,
      at: r.at,
    }));

    return { active, log };
  } catch { return { active: [], log: [] }; }
}
