/**
 * mc-email — Do Not Contact (DNC) Store
 *
 * SQLite-backed store (better-sqlite3, WAL mode) for managing
 * email addresses that must not be contacted.
 */

import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface DncEntry {
  email: string;
  reason: string | null;
  added_at: string;
  added_by: string | null;
}

const DEFAULT_DB_DIR = () => {
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
  return path.join(stateDir, "miniclaw", "USER", "email");
};

let _db: Database.Database | null = null;
let _dbPath: string | null = null;

/**
 * Open (or return cached) DNC database. Creates table if missing.
 */
export function openDncDb(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? path.join(DEFAULT_DB_DIR(), "dnc.db");

  // Return cached if same path
  if (_db && _dbPath === resolvedPath) return _db;

  // Ensure directory exists
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const db = new Database(resolvedPath);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS do_not_contact (
      email     TEXT PRIMARY KEY,
      reason    TEXT,
      added_at  TEXT NOT NULL,
      added_by  TEXT
    );
  `);

  _db = db;
  _dbPath = resolvedPath;
  return db;
}

/**
 * Close the cached database (useful for tests).
 */
export function closeDncDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    _dbPath = null;
  }
}

/** Normalize email to lowercase for consistent matching. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Add an email to the Do Not Contact list.
 */
export function addToList(
  email: string,
  reason?: string,
  addedBy?: string,
  dbPath?: string,
): void {
  const db = openDncDb(dbPath);
  const norm = normalizeEmail(email);
  db.prepare(
    `INSERT OR REPLACE INTO do_not_contact (email, reason, added_at, added_by)
     VALUES (?, ?, ?, ?)`,
  ).run(norm, reason ?? null, new Date().toISOString(), addedBy ?? null);
}

/**
 * Remove an email from the Do Not Contact list.
 * Returns true if the email was found and removed.
 */
export function removeFromList(email: string, dbPath?: string): boolean {
  const db = openDncDb(dbPath);
  const norm = normalizeEmail(email);
  const result = db.prepare("DELETE FROM do_not_contact WHERE email = ?").run(norm);
  return result.changes > 0;
}

/**
 * Check if an email is on the Do Not Contact list.
 */
export function isBlocked(email: string, dbPath?: string): boolean {
  const db = openDncDb(dbPath);
  const norm = normalizeEmail(email);
  const row = db.prepare("SELECT 1 FROM do_not_contact WHERE email = ?").get(norm);
  return !!row;
}

/**
 * Get a single DNC entry by email.
 */
export function getEntry(email: string, dbPath?: string): DncEntry | null {
  const db = openDncDb(dbPath);
  const norm = normalizeEmail(email);
  const row = db.prepare("SELECT * FROM do_not_contact WHERE email = ?").get(norm) as DncEntry | undefined;
  return row ?? null;
}

/**
 * List all entries on the Do Not Contact list.
 */
export function listAll(dbPath?: string): DncEntry[] {
  const db = openDncDb(dbPath);
  return db.prepare("SELECT * FROM do_not_contact ORDER BY added_at DESC").all() as DncEntry[];
}

/**
 * Detect opt-out intent in an email body.
 * Returns true if the body contains common opt-out phrases.
 */
export function detectOptOut(body: string): boolean {
  const lower = body.toLowerCase();
  const patterns = [
    /\bunsubscribe\b/,
    /\bstop\s+contact(ing)?\b/,
    /\bdo\s+not\s+contact\b/,
    /\bremove\s+me\b/,
    /\bopt\s*[-\s]?\s*out\b/,
    /\bleave\s+me\s+alone\b/,
    /\bdon'?t\s+(email|contact|message)\s+me\b/,
    /\bno\s+more\s+(emails?|messages?|contact)\b/,
    /\btake\s+me\s+off\b/,
    /\bstop\s+(emailing|messaging)\b/,
  ];
  return patterns.some((p) => p.test(lower));
}

/**
 * Detect re-subscribe intent in an email body.
 * Returns true if the sender wants to be removed from the DNC list.
 */
export function detectResubscribe(body: string): boolean {
  const lower = body.toLowerCase();
  const patterns = [
    /\bremove\s+(me\s+)?from\s+(the\s+)?(do\s+not\s+contact|dnc|block)\s*(list)?\b/,
    /\bunblock\s+me\b/,
    /\bi\s+want\s+to\s+be\s+contacted\s+again\b/,
    /\bopt\s*[-\s]?\s*back\s+in\b/,
    /\bresubscribe\b/,
    /\bstart\s+contacting\s+me\s+again\b/,
    /\bremove\s+the?\s+block\b/,
  ];
  return patterns.some((p) => p.test(lower));
}

/**
 * Extract an email address from a "Name <email>" or plain "email" string.
 */
export function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return normalizeEmail(match ? match[1] : from);
}
