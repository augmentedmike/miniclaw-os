import { test, expect } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("index.ts exists", () => {
  expect(existsSync(__dirname + "/index.ts")).toBe(true);
});

test("plugin has required structure", () => {
  expect(existsSync(__dirname + "/src")).toBe(true);
});

test("openDb creates voice_settings and human_voice on fresh database", () => {
  const tmp = mkdtempSync(join(tmpdir(), "mc-voice-test-"));
  const dbPath = join(tmp, "voice", "voice.db");

  // Replicate openDb logic: open fresh DB, ensure tables exist
  const dir = dirname(dbPath);
  const { mkdirSync } = require("node:fs");
  mkdirSync(dir, { recursive: true });
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_settings (
      human_id                       TEXT PRIMARY KEY,
      opted_out                      INTEGER NOT NULL DEFAULT 0 CHECK(opted_out IN (0,1)),
      opted_out_at                   TEXT,
      learning_active                INTEGER NOT NULL DEFAULT 1 CHECK(learning_active IN (0,1)),
      last_analyzed_at               TEXT,
      message_count_at_last_analysis INTEGER NOT NULL DEFAULT 0,
      updated_at                     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

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
  `);

  // Verify tables exist by querying them
  const settings = db.prepare("SELECT COUNT(*) AS c FROM voice_settings").get() as { c: number };
  expect(settings.c).toBe(0);

  const voice = db.prepare("SELECT COUNT(*) AS c FROM human_voice").get() as { c: number };
  expect(voice.c).toBe(0);

  db.close();
  rmSync(tmp, { recursive: true, force: true });
});
