/**
 * mc-voice — voice.db migration script
 *
 * Creates ~/am/USER/augmentedmike_bot/voice/voice.db with:
 *   - human_voice: stores raw messages with embeddings
 *   - voice_settings: per-human opt-out and learning config
 *   - FTS5 virtual table for full-text search
 *   - sqlite-vec virtual table for vector similarity search
 *
 * Embedding model: gemini-embedding-001 (dim=3072)
 * Storage: dedicated voice.db (not kb.db — keeps voice data separable)
 *
 * Run: npx tsx src/migrate.ts [--db-path /path/to/voice.db]
 */

import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const SQLITE_VEC_PATHS = [
  "/opt/homebrew/lib/node_modules/openclaw/node_modules/sqlite-vec",
  "sqlite-vec",
];

const EMBEDDING_DIM = 3072; // gemini-embedding-001

function resolveDbPath(arg?: string): string {
  if (arg) return arg.startsWith("~/") ? path.join(os.homedir(), arg.slice(2)) : arg;
  return path.join(
    os.homedir(),
    "am/USER/augmentedmike_bot/voice/voice.db",
  );
}

function loadVec(db: Database.Database): boolean {
  for (const vecPath of SQLITE_VEC_PATHS) {
    try {
      const { load } = require(vecPath) as { load: (db: Database.Database) => void };
      load(db);
      console.log(`[mc-voice/migrate] sqlite-vec loaded from ${vecPath}`);
      return true;
    } catch {
      // try next path
    }
  }
  console.warn("[mc-voice/migrate] sqlite-vec unavailable — skipping vec table");
  return false;
}

function migrate(dbPath: string): void {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const isNew = !fs.existsSync(dbPath);
  console.log(`[mc-voice/migrate] Opening ${dbPath} (new=${isNew})`);

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  const vecLoaded = loadVec(db);

  db.exec(`
    -- Schema version tracking
    CREATE TABLE IF NOT EXISTS schema_version (
      version   INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const currentVersion = (
    db.prepare("SELECT MAX(version) AS v FROM schema_version").get() as { v: number | null }
  ).v ?? 0;

  console.log(`[mc-voice/migrate] Current schema version: ${currentVersion}`);

  if (currentVersion < 1) {
    console.log("[mc-voice/migrate] Applying migration v1: core tables");

    db.transaction(() => {
      db.exec(`
        -- Primary message store
        -- human_id: identifies the human (e.g. 'michael') — supports multi-human future
        -- channel: source of message (telegram | inbox | claude-code | other)
        -- message: raw text content of the message
        -- embedding: JSON float array from gemini-embedding-001 (dim=3072), NULL until computed
        -- sent_at: when the message was sent (ISO 8601)
        -- opted_out: if true this message was captured before opt-out and should be excluded
        CREATE TABLE IF NOT EXISTS human_voice (
          id         TEXT PRIMARY KEY,
          human_id   TEXT NOT NULL,
          channel    TEXT NOT NULL CHECK(channel IN ('telegram','inbox','claude-code','other')),
          message    TEXT NOT NULL,
          embedding  BLOB,
          sent_at    TEXT NOT NULL,
          opted_out  INTEGER NOT NULL DEFAULT 0 CHECK(opted_out IN (0,1)),
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        );

        CREATE INDEX IF NOT EXISTS idx_voice_human_id   ON human_voice(human_id);
        CREATE INDEX IF NOT EXISTS idx_voice_channel    ON human_voice(channel);
        CREATE INDEX IF NOT EXISTS idx_voice_sent_at    ON human_voice(sent_at);
        CREATE INDEX IF NOT EXISTS idx_voice_opted_out  ON human_voice(opted_out);

        -- Per-human learning settings and opt-out state
        CREATE TABLE IF NOT EXISTS voice_settings (
          human_id                       TEXT PRIMARY KEY,
          opted_out                      INTEGER NOT NULL DEFAULT 0 CHECK(opted_out IN (0,1)),
          opted_out_at                   TEXT,
          learning_active                INTEGER NOT NULL DEFAULT 1 CHECK(learning_active IN (0,1)),
          last_analyzed_at               TEXT,
          message_count_at_last_analysis INTEGER NOT NULL DEFAULT 0,
          updated_at                     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
        );

        -- Insert default settings for michael
        INSERT OR IGNORE INTO voice_settings (human_id, opted_out, learning_active)
        VALUES ('michael', 0, 1);
      `);

      // FTS5 table for full-text search over messages
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS voice_fts USING fts5(
          voice_id UNINDEXED,
          human_id UNINDEXED,
          message,
          tokenize = 'porter ascii'
        );
      `);

      db.prepare(
        "INSERT INTO schema_version (version, applied_at) VALUES (1, ?)",
      ).run(new Date().toISOString());
    })();

    console.log("[mc-voice/migrate] v1 applied: human_voice, voice_settings, voice_fts");
  }

  if (currentVersion < 3) {
    console.log("[mc-voice/migrate] Applying migration v3: disclosure tracking columns");

    db.transaction(() => {
      try {
        db.exec(`ALTER TABLE voice_settings ADD COLUMN needs_disclosure INTEGER NOT NULL DEFAULT 0;`);
      } catch { /* column may already exist */ }
      try {
        db.exec(`ALTER TABLE voice_settings ADD COLUMN disclosed_at TEXT;`);
      } catch { /* column may already exist */ }

      // Mark existing users (who already have stored messages) as pre-acknowledged.
      // Disclosure is for new users only — retroactive disclosure makes no sense.
      db.exec(`
        UPDATE voice_settings
        SET disclosed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), needs_disclosure = 0
        WHERE human_id IN (SELECT DISTINCT human_id FROM human_voice)
          AND disclosed_at IS NULL;
      `);

      db.prepare(
        "INSERT INTO schema_version (version, applied_at) VALUES (3, ?)",
      ).run(new Date().toISOString());
    })();

    console.log("[mc-voice/migrate] v3 applied: needs_disclosure, disclosed_at columns");
  }

  if (currentVersion < 4) {
    console.log("[mc-voice/migrate] Applying migration v4: message_count_at_last_analysis column");

    db.transaction(() => {
      try {
        db.exec(`ALTER TABLE voice_settings ADD COLUMN message_count_at_last_analysis INTEGER NOT NULL DEFAULT 0;`);
      } catch { /* column already exists */ }

      db.prepare(
        "INSERT INTO schema_version (version, applied_at) VALUES (4, ?)",
      ).run(new Date().toISOString());
    })();

    console.log("[mc-voice/migrate] v4 applied: message_count_at_last_analysis column");
  }

  if (currentVersion < 2 && vecLoaded) {
    console.log("[mc-voice/migrate] Applying migration v2: sqlite-vec table");

    db.transaction(() => {
      try {
        db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS voice_vectors
          USING vec0(
            voice_id TEXT PRIMARY KEY,
            embedding float[${EMBEDDING_DIM}]
          );
        `);

        db.prepare(
          "INSERT INTO schema_version (version, applied_at) VALUES (2, ?)",
        ).run(new Date().toISOString());

        console.log(`[mc-voice/migrate] v2 applied: voice_vectors (float[${EMBEDDING_DIM}])`);
      } catch (err) {
        console.warn(`[mc-voice/migrate] Failed to create voice_vectors: ${err}`);
      }
    })();
  } else if (currentVersion < 2 && !vecLoaded) {
    console.log("[mc-voice/migrate] Skipping v2 (sqlite-vec unavailable) — FTS-only mode");
  }

  // Print final table list
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type IN ('table','virtual table') ORDER BY name")
    .all() as { name: string }[];
  console.log(`[mc-voice/migrate] Tables: ${tables.map((t) => t.name).join(", ")}`);

  // Print schema version
  const versions = db
    .prepare("SELECT version, applied_at FROM schema_version ORDER BY version")
    .all() as { version: number; applied_at: string }[];
  for (const v of versions) {
    console.log(`[mc-voice/migrate]   version ${v.version} applied at ${v.applied_at}`);
  }

  db.close();
  console.log("[mc-voice/migrate] Done.");
}

// CLI entry point
const args = process.argv.slice(2);
const dbArgIdx = args.indexOf("--db-path");
const dbPath = resolveDbPath(dbArgIdx >= 0 ? args[dbArgIdx + 1] : undefined);
migrate(dbPath);
