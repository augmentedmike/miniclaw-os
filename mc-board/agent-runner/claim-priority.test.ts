/**
 * Tests that claimPending() prioritises FOCUS-tagged and high-priority cards
 * over plain FIFO ordering.
 *
 * We spin up an in-memory better-sqlite3 DB, seed agent_queue + cards rows,
 * then call the SQL query directly to verify ordering.
 */
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";

// The exact SQL from claimPending() in runner.mjs (after the fix)
const CLAIM_SQL = `
  SELECT q.* FROM agent_queue q
  LEFT JOIN cards c ON c.id = q.card_id
  WHERE q.status = 'pending'
    AND q.col = ?
    AND (c.tags IS NULL OR c.tags NOT LIKE '%"hold"%')
  ORDER BY
    CASE WHEN c.tags LIKE '%"focus"%' THEN 0 ELSE 1 END ASC,
    CASE c.priority
      WHEN 'critical' THEN 0
      WHEN 'high'     THEN 1
      WHEN 'medium'   THEN 2
      WHEN 'low'      THEN 3
      ELSE 4
    END ASC,
    q.created_at ASC
  LIMIT ?
`;

function createDb() {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE cards (
      id       TEXT PRIMARY KEY,
      title    TEXT NOT NULL DEFAULT '',
      col      TEXT NOT NULL DEFAULT 'backlog',
      priority TEXT NOT NULL DEFAULT 'medium',
      tags     TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE agent_queue (
      id         TEXT PRIMARY KEY,
      card_id    TEXT NOT NULL,
      col        TEXT NOT NULL,
      prompt     TEXT NOT NULL DEFAULT '',
      worker     TEXT NOT NULL DEFAULT 'w',
      status     TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      started_at TEXT,
      ended_at   TEXT,
      pid        INTEGER
    );
  `);
  return db;
}

function insertCard(db: InstanceType<typeof Database>, id: string, priority: string, tags: string[]) {
  db.prepare(
    `INSERT INTO cards (id, title, priority, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, id, priority, JSON.stringify(tags), new Date().toISOString(), new Date().toISOString());
}

function insertQueue(db: InstanceType<typeof Database>, id: string, cardId: string, col: string, createdAt: string) {
  db.prepare(
    `INSERT INTO agent_queue (id, card_id, col, status, created_at) VALUES (?, ?, ?, 'pending', ?)`,
  ).run(id, cardId, col, createdAt);
}

describe("claimPending priority ordering", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = createDb();
  });

  it("FOCUS+CRITICAL card is claimed before non-FOCUS MEDIUM", () => {
    // Older non-focus medium card
    insertCard(db, "crd_medium", "medium", []);
    insertQueue(db, "q1", "crd_medium", "in-progress", "2026-01-01T00:00:00Z");

    // Newer focus+critical card
    insertCard(db, "crd_focus", "critical", ["focus"]);
    insertQueue(db, "q2", "crd_focus", "in-progress", "2026-01-02T00:00:00Z");

    const rows = db.prepare(CLAIM_SQL).all("in-progress", 10) as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual(["q2", "q1"]);
  });

  it("FOCUS high beats non-FOCUS critical", () => {
    insertCard(db, "crd_crit", "critical", []);
    insertQueue(db, "q1", "crd_crit", "in-progress", "2026-01-01T00:00:00Z");

    insertCard(db, "crd_fh", "high", ["focus"]);
    insertQueue(db, "q2", "crd_fh", "in-progress", "2026-01-02T00:00:00Z");

    const rows = db.prepare(CLAIM_SQL).all("in-progress", 10) as { id: string }[];
    expect(rows[0].id).toBe("q2"); // focus wins
  });

  it("among non-FOCUS cards, critical beats medium", () => {
    insertCard(db, "crd_med", "medium", []);
    insertQueue(db, "q1", "crd_med", "in-progress", "2026-01-01T00:00:00Z");

    insertCard(db, "crd_crit", "critical", []);
    insertQueue(db, "q2", "crd_crit", "in-progress", "2026-01-02T00:00:00Z");

    const rows = db.prepare(CLAIM_SQL).all("in-progress", 10) as { id: string }[];
    expect(rows[0].id).toBe("q2"); // critical first
  });

  it("same priority + no focus: oldest first (FIFO)", () => {
    insertCard(db, "crd_a", "medium", []);
    insertQueue(db, "q1", "crd_a", "in-progress", "2026-01-01T00:00:00Z");

    insertCard(db, "crd_b", "medium", []);
    insertQueue(db, "q2", "crd_b", "in-progress", "2026-01-02T00:00:00Z");

    const rows = db.prepare(CLAIM_SQL).all("in-progress", 10) as { id: string }[];
    expect(rows.map((r) => r.id)).toEqual(["q1", "q2"]);
  });

  it("hold-tagged cards are excluded", () => {
    insertCard(db, "crd_hold", "critical", ["focus", "hold"]);
    insertQueue(db, "q1", "crd_hold", "in-progress", "2026-01-01T00:00:00Z");

    insertCard(db, "crd_ok", "low", []);
    insertQueue(db, "q2", "crd_ok", "in-progress", "2026-01-02T00:00:00Z");

    const rows = db.prepare(CLAIM_SQL).all("in-progress", 10) as { id: string }[];
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe("q2");
  });
});
