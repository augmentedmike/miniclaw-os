#!/usr/bin/env bash
# mc-voice — voice.db migration script (shell version)
#
# Creates the voice.db database with:
#   - human_voice: raw messages with embedding blobs
#   - voice_settings: per-human opt-out and learning config
#   - voice_fts: FTS5 full-text search virtual table
#
# Embedding model: gemini-embedding-001 (dim=3072)
# Note: sqlite-vec virtual table is created by the TypeScript layer at runtime.
#
# Usage: ./migrate.sh [/path/to/voice.db]

set -euo pipefail

DB_PATH="${1:-${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/USER/augmentedmike_bot/voice/voice.db}"
DB_DIR="$(dirname "$DB_PATH")"

mkdir -p "$DB_DIR"
echo "[mc-voice/migrate] DB path: $DB_PATH"

sqlite3 "$DB_PATH" <<'EOF'
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- Primary message store
-- human_id: identifies the human (e.g. 'michael') — supports multi-human future
-- channel: source of message (telegram | inbox | claude-code | other)
-- message: raw text content of the message
-- embedding: serialised float array from gemini-embedding-001 (dim=3072), NULL until computed
-- sent_at: when the message was sent (ISO 8601)
-- opted_out: 1 if this message was captured before opt-out and should be excluded
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

CREATE INDEX IF NOT EXISTS idx_voice_human_id  ON human_voice(human_id);
CREATE INDEX IF NOT EXISTS idx_voice_channel   ON human_voice(channel);
CREATE INDEX IF NOT EXISTS idx_voice_sent_at   ON human_voice(sent_at);
CREATE INDEX IF NOT EXISTS idx_voice_opted_out ON human_voice(opted_out);

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

-- Default settings
INSERT OR IGNORE INTO voice_settings (human_id, opted_out, learning_active)
VALUES ('augmentedmike', 0, 1);
INSERT OR IGNORE INTO voice_settings (human_id, opted_out, learning_active)
VALUES ('michael', 0, 1);

-- FTS5 full-text search over messages
CREATE VIRTUAL TABLE IF NOT EXISTS voice_fts USING fts5(
  voice_id UNINDEXED,
  human_id UNINDEXED,
  message,
  tokenize = 'porter ascii'
);

INSERT OR IGNORE INTO schema_version (version, applied_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%SZ','now'));
EOF

# ── Idempotent column additions for existing DBs ──────────────────────────────
# Add any columns that may be missing from DBs created before this migration ran.
# SQLite returns an error if the column already exists — suppress those errors.
sqlite3 "$DB_PATH" "ALTER TABLE voice_settings ADD COLUMN message_count_at_last_analysis INTEGER NOT NULL DEFAULT 0;" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE voice_settings ADD COLUMN needs_disclosure INTEGER NOT NULL DEFAULT 0;" 2>/dev/null || true
sqlite3 "$DB_PATH" "ALTER TABLE voice_settings ADD COLUMN disclosed_at TEXT;" 2>/dev/null || true

echo "[mc-voice/migrate] Tables created:"
sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name;"

echo "[mc-voice/migrate] Schema versions:"
sqlite3 "$DB_PATH" "SELECT version, applied_at FROM schema_version ORDER BY version;"

echo "[mc-voice/migrate] voice_settings:"
sqlite3 "$DB_PATH" "SELECT * FROM voice_settings;"

echo "[mc-voice/migrate] Done."
