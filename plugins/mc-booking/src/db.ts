import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS appointments (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  interest        TEXT NOT NULL DEFAULT '',
  scheduled_time  TEXT NOT NULL,
  duration_min    INTEGER NOT NULL DEFAULT 30,
  notes           TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending',
  manage_token    TEXT NOT NULL UNIQUE,
  payment_id      TEXT NOT NULL DEFAULT '',
  refund_id       TEXT NOT NULL DEFAULT '',
  refund_amount   INTEGER NOT NULL DEFAULT 0,
  paid_at         TEXT NOT NULL DEFAULT '',
  cancelled_at    TEXT NOT NULL DEFAULT '',
  approved_at     TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_apt_time_status ON appointments(scheduled_time, status);
CREATE INDEX IF NOT EXISTS idx_apt_token ON appointments(manage_token);

CREATE TABLE IF NOT EXISTS preferences (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

let _db: Database.Database | null = null;

export function openDb(dbPath: string): Database.Database {
  if (_db) return _db;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.exec(SCHEMA);
  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
