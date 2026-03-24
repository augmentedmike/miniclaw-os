/**
 * data-layer.test.ts — Tests for web data-layer functions (listBoardCards, listProjects, getCard).
 *
 * These test the same data-access patterns as web/src/lib/data.ts but against
 * the CardStore/ProjectStore directly (since the web data layer reads the same SQLite DB).
 * This validates that:
 *   - Card counts are correct (not 0 when data exists)
 *   - Projects list returns data when projects exist
 *   - getCard returns all fields including research/notes (context persistence)
 *
 * Regression guards for: crd_68d9535d (0-card fetch), crd_5ba09fcc (missing projects),
 * crd_7d62b149 (card context disappears).
 */

import { describe, expect, it, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { CardStore } from "./store.js";

function createTestDb(): InstanceType<typeof Database> {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE cards (
      id               TEXT PRIMARY KEY,
      title            TEXT NOT NULL,
      col              TEXT NOT NULL DEFAULT 'backlog',
      priority         TEXT NOT NULL DEFAULT 'medium',
      tags             TEXT NOT NULL DEFAULT '[]',
      project_id       TEXT,
      work_type        TEXT,
      linked_card_id   TEXT,
      depends_on       TEXT NOT NULL DEFAULT '[]',
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      problem_description  TEXT NOT NULL DEFAULT '',
      implementation_plan  TEXT NOT NULL DEFAULT '',
      acceptance_criteria  TEXT NOT NULL DEFAULT '',
      notes            TEXT NOT NULL DEFAULT '',
      review_notes     TEXT NOT NULL DEFAULT '',
      research         TEXT NOT NULL DEFAULT '',
      verify_url       TEXT NOT NULL DEFAULT '',
      work_log         TEXT NOT NULL DEFAULT '[]',
      attachments      TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE card_history (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id  TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      col      TEXT NOT NULL,
      moved_at TEXT NOT NULL
    );
    CREATE TABLE projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      work_dir    TEXT NOT NULL DEFAULT '',
      github_repo TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
  `);
  return db;
}

// ---- listBoardCards equivalent: store.list() returns correct counts ----

describe("Board data layer — card listing", () => {
  let db: InstanceType<typeof Database>;
  let store: CardStore;

  beforeEach(() => {
    db = createTestDb();
    store = new CardStore(db);
  });

  it("returns empty array when DB has no cards (not crash)", () => {
    const cards = store.list();
    expect(cards).toEqual([]);
    expect(cards).toHaveLength(0);
  });

  it("returns correct card count when DB has cards", () => {
    store.create({ title: "Card 1" });
    store.create({ title: "Card 2" });
    store.create({ title: "Card 3" });
    const cards = store.list();
    expect(cards).toHaveLength(3);
  });

  it("card objects have all required BoardCard fields", () => {
    const created = store.create({ title: "Test card", priority: "high", tags: ["build"] });
    const cards = store.list();
    const card = cards[0];
    expect(card.id).toBe(created.id);
    expect(card.title).toBe("Test card");
    expect(card.column).toBe("backlog");
    expect(card.priority).toBe("high");
    expect(card.tags).toEqual(["build"]);
    expect(card.created_at).toBeDefined();
    expect(card.updated_at).toBeDefined();
  });
});

// ---- listProjects equivalent: projects table returns data ----

describe("Board data layer — projects listing", () => {
  let db: InstanceType<typeof Database>;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns empty array when no projects exist (not crash)", () => {
    const rows = db.prepare(
      `SELECT id, name, description, work_dir, github_repo FROM projects WHERE status = 'active'`
    ).all();
    expect(rows).toEqual([]);
  });

  it("returns projects when they exist in DB", () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO projects (id, name, description, work_dir, github_repo, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
    ).run("prj_001", "MiniClaw", "Plugin ecosystem", "/path/to/project", "user/repo", now, now);

    db.prepare(
      `INSERT INTO projects (id, name, description, work_dir, github_repo, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
    ).run("prj_002", "OpenClaw", "Agent runtime", "/path/to/openclaw", "user/openclaw", now, now);

    const rows = db.prepare(
      `SELECT id, name, description, work_dir, github_repo FROM projects WHERE status = 'active' ORDER BY created_at ASC`
    ).all() as Array<{ id: string; name: string; description: string; work_dir: string; github_repo: string }>;

    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("MiniClaw");
    expect(rows[1].name).toBe("OpenClaw");
  });

  it("excludes inactive projects", () => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO projects (id, name, description, work_dir, github_repo, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
    ).run("prj_active", "Active Project", "", "", "", now, now);

    db.prepare(
      `INSERT INTO projects (id, name, description, work_dir, github_repo, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'archived', ?, ?)`
    ).run("prj_archived", "Archived Project", "", "", "", now, now);

    const rows = db.prepare(
      `SELECT id, name FROM projects WHERE status = 'active'`
    ).all() as Array<{ id: string; name: string }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Active Project");
  });
});

// ---- getCard equivalent: returns all fields including research/notes ----

describe("Board data layer — getCard context persistence", () => {
  let db: InstanceType<typeof Database>;
  let store: CardStore;

  beforeEach(() => {
    db = createTestDb();
    store = new CardStore(db);
  });

  it("getCard (findById) returns null-equivalent for missing card", () => {
    expect(() => store.findById("crd_nonexistent")).toThrow(/not found/i);
  });

  it("getCard returns research field when populated", () => {
    const card = store.create({
      title: "Research card",
      research: "## Findings\nImportant research data here.",
    });
    const found = store.findById(card.id);
    expect(found.research).toBe("## Findings\nImportant research data here.");
  });

  it("getCard returns notes field when populated", () => {
    const card = store.create({
      title: "Notes card",
      notes: "2026-03-22: Work done. Branch: crd_abc123",
    });
    const found = store.findById(card.id);
    expect(found.notes).toBe("2026-03-22: Work done. Branch: crd_abc123");
  });

  it("getCard returns ALL card fields (context persistence regression)", () => {
    const card = store.create({
      title: "Full context card",
      problem_description: "The problem statement",
      implementation_plan: "Step 1, Step 2",
      acceptance_criteria: "- [ ] criterion 1\n- [ ] criterion 2",
      notes: "Session notes here",
      research: "Research findings here",
      verify_url: "http://localhost:3001/test",
    });
    const found = store.findById(card.id);
    expect(found.title).toBe("Full context card");
    expect(found.problem_description).toBe("The problem statement");
    expect(found.implementation_plan).toBe("Step 1, Step 2");
    expect(found.acceptance_criteria).toBe("- [ ] criterion 1\n- [ ] criterion 2");
    expect(found.notes).toBe("Session notes here");
    expect(found.research).toBe("Research findings here");
    expect(found.verify_url).toBe("http://localhost:3001/test");
    expect(found.review_notes).toBe("");
    expect(found.column).toBe("backlog");
    expect(found.history).toHaveLength(1);
  });

  it("getCard returns updated fields after store.update()", () => {
    const card = store.create({ title: "Updatable card" });
    store.update(card.id, {
      notes: "Updated notes",
      research: "Updated research",
      problem_description: "Updated problem",
    });
    const found = store.findById(card.id);
    expect(found.notes).toBe("Updated notes");
    expect(found.research).toBe("Updated research");
    expect(found.problem_description).toBe("Updated problem");
  });
});
