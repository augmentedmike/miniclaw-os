/**
 * db.ts — SQLite database initialization and schema for mc-board.
 *
 * Uses better-sqlite3 (Node-compatible, synchronous).
 * Single DB file at: <stateDir>/board.db
 * WAL mode for concurrent reads from web + CLI.
 */

import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";

export { Database };

const SCHEMA = /* sql */ `
  CREATE TABLE IF NOT EXISTS cards (
    id               TEXT PRIMARY KEY,
    title            TEXT NOT NULL,
    col              TEXT NOT NULL DEFAULT 'backlog',
    priority         TEXT NOT NULL DEFAULT 'medium',
    tags             TEXT NOT NULL DEFAULT '[]',
    project_id       TEXT,
    work_type        TEXT,
    linked_card_id   TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    problem_description  TEXT NOT NULL DEFAULT '',
    implementation_plan  TEXT NOT NULL DEFAULT '',
    acceptance_criteria  TEXT NOT NULL DEFAULT '',
    notes            TEXT NOT NULL DEFAULT '',
    review_notes     TEXT NOT NULL DEFAULT '',
    research         TEXT NOT NULL DEFAULT '',
    work_log         TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS card_history (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id  TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    col      TEXT NOT NULL,
    moved_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cards_col     ON cards(col);
  CREATE INDEX IF NOT EXISTS idx_cards_project ON cards(project_id);
  CREATE INDEX IF NOT EXISTS idx_history_card  ON card_history(card_id);

  CREATE TABLE IF NOT EXISTS projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'active',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS active_work (
    card_id      TEXT PRIMARY KEY,
    project_id   TEXT,
    title        TEXT NOT NULL,
    worker       TEXT NOT NULL,
    col          TEXT NOT NULL,
    picked_up_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS pickup_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id    TEXT NOT NULL,
    project_id TEXT,
    title      TEXT NOT NULL DEFAULT '',
    worker     TEXT NOT NULL,
    col        TEXT NOT NULL DEFAULT '',
    action     TEXT NOT NULL,
    at         TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pickup_log_at ON pickup_log(at);
`;

export function openDb(stateDir: string): Database {
  fs.mkdirSync(stateDir, { recursive: true });
  const dbPath = path.join(stateDir, "board.db");
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  // ── Versioned migrations ──────────────────────────────────────────────
  // Each migration runs once. Version is tracked in a meta table.
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`);
  const applied = new Set(
    (db.prepare(`SELECT version FROM _migrations`).all() as { version: number }[]).map(r => r.version)
  );

  const migrations: [number, string][] = [
    [1, `ALTER TABLE cards ADD COLUMN research TEXT NOT NULL DEFAULT ''`],
    [2, `ALTER TABLE cards ADD COLUMN work_log TEXT NOT NULL DEFAULT '[]'`],
    [3, `ALTER TABLE cards ADD COLUMN verify_url TEXT NOT NULL DEFAULT ''`],
    [4, `ALTER TABLE projects ADD COLUMN work_dir TEXT NOT NULL DEFAULT ''`],
    [5, `ALTER TABLE projects ADD COLUMN github_repo TEXT NOT NULL DEFAULT ''`],
    [6, `ALTER TABLE projects ADD COLUMN build_command TEXT NOT NULL DEFAULT ''`],
    [7, `ALTER TABLE cards ADD COLUMN depends_on TEXT NOT NULL DEFAULT '[]'`],
    [8, `ALTER TABLE agent_runs ADD COLUMN input_tokens INTEGER DEFAULT 0`],
    [9, `ALTER TABLE agent_runs ADD COLUMN output_tokens INTEGER DEFAULT 0`],
    [10, `ALTER TABLE agent_runs ADD COLUMN cache_read_tokens INTEGER DEFAULT 0`],
    [11, `ALTER TABLE agent_runs ADD COLUMN cache_write_tokens INTEGER DEFAULT 0`],
    [12, `ALTER TABLE agent_runs ADD COLUMN total_tokens INTEGER DEFAULT 0`],
    [13, `ALTER TABLE agent_runs ADD COLUMN cost_usd REAL DEFAULT 0`],
    [14, `ALTER TABLE cards ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'`],
  ];

  for (const [version, sql] of migrations) {
    if (applied.has(version)) continue;
    try {
      db.exec(sql);
    } catch {
      // Column/table may already exist from pre-migration era — that's fine
    }
    db.prepare(`INSERT INTO _migrations (version, applied_at) VALUES (?, ?)`).run(version, new Date().toISOString());
  }
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        card_id TEXT NOT NULL,
        column TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        exit_code INTEGER,
        peak_tokens INTEGER,
        tool_call_count INTEGER NOT NULL DEFAULT 0,
        tool_calls TEXT NOT NULL DEFAULT '[]',
        log_file TEXT NOT NULL DEFAULT '',
        debug_log_file TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_agent_runs_card ON agent_runs(card_id);
    `);
  } catch { /* already exists */ }
  return db;
}
