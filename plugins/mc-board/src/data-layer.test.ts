/**
 * data-layer.test.ts — Unit tests for CardStore data layer.
 *
 * Covers:
 *   - CardStore.list(column) filters correctly
 *   - CardStore.list() returns empty for column with no cards
 *   - CardStore.listByProject() returns only matching cards
 *   - CardStore.listByProject() returns empty for nonexistent project
 *   - CardStore.create() + findById() round-trip preserves all fields
 */

import { describe, it, expect, beforeEach } from "vitest";
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
      work_log         TEXT NOT NULL DEFAULT '[]'
    );
    CREATE TABLE card_history (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id  TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      col      TEXT NOT NULL,
      moved_at TEXT NOT NULL
    );
  `);
  return db;
}

describe("CardStore.list(column)", () => {
  let db: InstanceType<typeof Database>;
  let store: CardStore;

  beforeEach(() => {
    db = createTestDb();
    store = new CardStore(db);
  });

  it("returns empty array for column with no cards", () => {
    const result = store.list("backlog");
    expect(result).toHaveLength(0);
  });

  it("returns only cards in the specified column", () => {
    store.create({ title: "Backlog card" }); // goes to backlog by default
    // Force a second card into in-progress
    const card2 = store.create({ title: "Progress card" });
    db.prepare("UPDATE cards SET col = 'in-progress' WHERE id = ?").run(card2.id);

    const backlogCards = store.list("backlog");
    expect(backlogCards).toHaveLength(1);
    expect(backlogCards[0].title).toBe("Backlog card");

    const progressCards = store.list("in-progress");
    expect(progressCards).toHaveLength(1);
    expect(progressCards[0].title).toBe("Progress card");
  });

  it("returns all cards when no column filter is given", () => {
    store.create({ title: "Card A" });
    const b = store.create({ title: "Card B" });
    db.prepare("UPDATE cards SET col = 'in-progress' WHERE id = ?").run(b.id);

    const all = store.list();
    expect(all).toHaveLength(2);
  });

  it("returns empty for a column that exists but has no cards assigned", () => {
    store.create({ title: "Backlog only card" });
    const result = store.list("in-review");
    expect(result).toHaveLength(0);
  });
});

describe("CardStore.listByProject()", () => {
  let db: InstanceType<typeof Database>;
  let store: CardStore;

  beforeEach(() => {
    db = createTestDb();
    store = new CardStore(db);
  });

  it("returns only cards for the specified project_id", () => {
    store.create({ title: "Project A card", project_id: "proj_aaaa" });
    store.create({ title: "Project B card", project_id: "proj_bbbb" });
    store.create({ title: "Unlinked card" });

    const result = store.listByProject("proj_aaaa");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Project A card");
  });

  it("returns empty for nonexistent project_id", () => {
    store.create({ title: "Some card", project_id: "proj_real" });
    const result = store.listByProject("proj_nonexistent");
    expect(result).toHaveLength(0);
  });

  it("returns multiple cards for same project", () => {
    store.create({ title: "Card 1", project_id: "proj_multi" });
    store.create({ title: "Card 2", project_id: "proj_multi" });
    store.create({ title: "Card 3", project_id: "proj_other" });

    const result = store.listByProject("proj_multi");
    expect(result).toHaveLength(2);
    expect(result.map(c => c.title).sort()).toEqual(["Card 1", "Card 2"]);
  });
});

describe("CardStore.create() + findById() round-trip", () => {
  let db: InstanceType<typeof Database>;
  let store: CardStore;

  beforeEach(() => {
    db = createTestDb();
    store = new CardStore(db);
  });

  it("preserves title, priority, and tags", () => {
    const card = store.create({
      title: "Round-trip card",
      priority: "high",
      tags: ["feature", "bug"],
    });

    const found = store.findById(card.id);
    expect(found.title).toBe("Round-trip card");
    expect(found.priority).toBe("high");
    expect(found.tags).toEqual(["feature", "bug"]);
  });

  it("preserves problem_description and implementation_plan", () => {
    const card = store.create({
      title: "Detailed card",
      problem_description: "The login is broken",
      implementation_plan: "Fix auth flow",
      acceptance_criteria: "- [ ] Login works",
    });

    const found = store.findById(card.id);
    expect(found.problem_description).toBe("The login is broken");
    expect(found.implementation_plan).toBe("Fix auth flow");
    expect(found.acceptance_criteria).toBe("- [ ] Login works");
  });

  it("newly created card starts in backlog", () => {
    const card = store.create({ title: "New card" });
    expect(card.column).toBe("backlog");
  });

  it("throws for unknown id", () => {
    expect(() => store.findById("crd_nonexistent")).toThrow();
  });
});
