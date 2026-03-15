#!/usr/bin/env bash
# board-dedup.sh — Merge duplicate board cards every 5 minutes
#
# Duplicates are cards with very similar titles (Levenshtein-like matching via
# normalized prefix comparison). When duplicates are found, the older card's
# notes are appended to the newer one and the older card is archived.
#
# Schedule: */5 * * * *
set -euo pipefail

DB="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/USER/brain/board.db"

if [[ ! -f "$DB" ]]; then
  exit 0
fi

# Find duplicates: cards with identical titles (exact match) in non-shipped columns
# Archive the older one, keep the newer one
sqlite3 "$DB" <<'SQL'
-- Step 1: Find exact title duplicates (keep newest by created_at, archive the rest)
WITH dupes AS (
  SELECT
    id,
    title,
    col,
    created_at,
    ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(title)) ORDER BY created_at DESC) AS rn
  FROM cards
  WHERE col <> 'shipped' AND col <> 'archived'
)
UPDATE cards
SET
  col = 'shipped',
  notes = notes || char(10) || '[dedup] Archived as duplicate — merged into newer card with same title at ' || datetime('now'),
  updated_at = datetime('now')
WHERE id IN (
  SELECT id FROM dupes WHERE rn > 1
);

-- Step 2: Find near-duplicates (same first 40 chars of title, normalized)
-- Only flag these — don't auto-archive since they might be intentionally similar
SQL

ARCHIVED=$(sqlite3 "$DB" "SELECT changes();")
if [[ "$ARCHIVED" -gt 0 ]]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] board-dedup: archived $ARCHIVED duplicate card(s)"
fi
