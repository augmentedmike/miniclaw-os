/**
 * store.test.ts — Unit tests for CardStore.move() criteria reset on backward transitions.
 */

import { describe, expect, it, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { CardStore } from "./store.js";
import type { Card, Column } from "./card.js";

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
  `);
  return db;
}

const CHECKED_CRITERIA = "- [x] First criterion\n- [x] Second criterion\n- [x] Third criterion";
const UNCHECKED_CRITERIA = "- [ ] First criterion\n- [ ] Second criterion\n- [ ] Third criterion";

function createCardInColumn(store: CardStore, db: InstanceType<typeof Database>, col: Column, criteria: string): Card {
  const card = store.create({
    title: "Test card",
    problem_description: "Test problem",
    implementation_plan: "Test plan",
    acceptance_criteria: criteria,
  });
  // Force the column directly in DB (bypassing state machine)
  db.prepare("UPDATE cards SET col = ? WHERE id = ?").run(col, card.id);
  return store.findById(card.id);
}

describe("CardStore.move() criteria reset", () => {
  let db: InstanceType<typeof Database>;
  let store: CardStore;

  beforeEach(() => {
    db = createTestDb();
    store = new CardStore(db);
  });

  it("resets criteria when moving in-review → in-progress", () => {
    const card = createCardInColumn(store, db, "in-review", CHECKED_CRITERIA);
    const moved = store.move(card, "in-progress");
    expect(moved.acceptance_criteria).toBe(UNCHECKED_CRITERIA);
  });

  it("resets criteria when moving shipped → in-progress", () => {
    const card = createCardInColumn(store, db, "shipped", CHECKED_CRITERIA);
    const moved = store.move(card, "in-progress");
    expect(moved.acceptance_criteria).toBe(UNCHECKED_CRITERIA);
  });

  it("resets criteria when moving shipped → backlog", () => {
    const card = createCardInColumn(store, db, "shipped", CHECKED_CRITERIA);
    const moved = store.move(card, "backlog");
    expect(moved.acceptance_criteria).toBe(UNCHECKED_CRITERIA);
  });

  it("preserves criteria when moving backlog → in-progress (forward)", () => {
    const card = createCardInColumn(store, db, "backlog", CHECKED_CRITERIA);
    const moved = store.move(card, "in-progress");
    expect(moved.acceptance_criteria).toBe(CHECKED_CRITERIA);
  });

  it("preserves criteria when moving in-progress → in-review (forward)", () => {
    const card = createCardInColumn(store, db, "in-progress", CHECKED_CRITERIA);
    const moved = store.move(card, "in-review");
    expect(moved.acceptance_criteria).toBe(CHECKED_CRITERIA);
  });

  it("preserves criteria when moving in-review → shipped (forward)", () => {
    const card = createCardInColumn(store, db, "in-review", CHECKED_CRITERIA);
    const moved = store.move(card, "shipped");
    expect(moved.acceptance_criteria).toBe(CHECKED_CRITERIA);
  });

  it("handles mixed checked/unchecked criteria on backward transition", () => {
    const mixed = "- [x] Done thing\n- [ ] Not done thing\n- [x] Another done";
    const expected = "- [ ] Done thing\n- [ ] Not done thing\n- [ ] Another done";
    const card = createCardInColumn(store, db, "in-review", mixed);
    const moved = store.move(card, "in-progress");
    expect(moved.acceptance_criteria).toBe(expected);
  });

  it("handles empty criteria gracefully on backward transition", () => {
    const card = createCardInColumn(store, db, "in-review", "");
    const moved = store.move(card, "in-progress");
    expect(moved.acceptance_criteria).toBe("");
  });
});

// ---- store.list() card count ----

describe("CardStore.list() card count", () => {
  let db: InstanceType<typeof Database>;
  let store: CardStore;

  beforeEach(() => {
    db = createTestDb();
    store = new CardStore(db);
  });

  it("returns 0 cards when store is empty", () => {
    expect(store.list()).toHaveLength(0);
  });

  it("returns correct count after creating 1 card", () => {
    store.create({ title: "Card A" });
    expect(store.list()).toHaveLength(1);
  });

  it("returns correct count after creating 5 cards", () => {
    for (let i = 0; i < 5; i++) {
      store.create({ title: `Card ${i}` });
    }
    expect(store.list()).toHaveLength(5);
  });

  it("returns correct count when filtering by column", () => {
    const card = store.create({ title: "Card A" });
    store.create({ title: "Card B" });
    // Move card A to in-progress
    db.prepare("UPDATE cards SET col = ? WHERE id = ?").run("in-progress", card.id);
    expect(store.list("backlog")).toHaveLength(1);
    expect(store.list("in-progress")).toHaveLength(1);
    expect(store.list()).toHaveLength(2);
  });
});

// ---- store.create() + findById() roundtrip ----

describe("CardStore create/findById roundtrip", () => {
  let db: InstanceType<typeof Database>;
  let store: CardStore;

  beforeEach(() => {
    db = createTestDb();
    store = new CardStore(db);
  });

  it("create returns a card with correct title", () => {
    const card = store.create({ title: "My new card" });
    expect(card.title).toBe("My new card");
    expect(card.id).toMatch(/^crd_/);
    expect(card.column).toBe("backlog");
  });

  it("findById retrieves the same card that was created", () => {
    const created = store.create({ title: "Roundtrip card" });
    const found = store.findById(created.id);
    expect(found.id).toBe(created.id);
    expect(found.title).toBe("Roundtrip card");
    expect(found.column).toBe("backlog");
  });

  it("findById throws for non-existent id", () => {
    expect(() => store.findById("crd_nonexistent")).toThrow(/not found/i);
  });

  it("create preserves all optional fields", () => {
    const card = store.create({
      title: "Full card",
      priority: "high",
      tags: ["build", "infra"],
      problem_description: "The problem",
      implementation_plan: "The plan",
      acceptance_criteria: "- [ ] step 1",
      notes: "Some notes",
      research: "Research data",
    });
    const found = store.findById(card.id);
    expect(found.priority).toBe("high");
    expect(found.tags).toEqual(["build", "infra"]);
    expect(found.problem_description).toBe("The problem");
    expect(found.implementation_plan).toBe("The plan");
    expect(found.acceptance_criteria).toBe("- [ ] step 1");
    expect(found.notes).toBe("Some notes");
    expect(found.research).toBe("Research data");
  });
});

// ---- store.checkTitleConflict() ----

describe("CardStore.checkTitleConflict()", () => {
  let db: InstanceType<typeof Database>;
  let store: CardStore;

  beforeEach(() => {
    db = createTestDb();
    store = new CardStore(db);
  });

  it("is a callable function on the store", () => {
    expect(typeof store.checkTitleConflict).toBe("function");
  });

  it("returns null when no cards exist", () => {
    const result = store.checkTitleConflict("Any title");
    expect(result).toBeNull();
  });

  it("detects exact title conflict", () => {
    store.create({ title: "Fix login bug" });
    const result = store.checkTitleConflict("Fix login bug");
    expect(result).not.toBeNull();
    expect(result!.similarity).toBe(1.0);
  });

  it("returns null when titles are distinct", () => {
    store.create({ title: "Fix login bug" });
    const result = store.checkTitleConflict("Add dark mode to dashboard UI");
    expect(result).toBeNull();
  });

  it("excludes card by excludeId", () => {
    const card = store.create({ title: "Fix login bug" });
    const result = store.checkTitleConflict("Fix login bug", { excludeId: card.id });
    expect(result).toBeNull();
  });

  it("excludes shipped cards from conflict check", () => {
    const card = store.create({ title: "Fix login bug" });
    // Move card to shipped
    db.prepare("UPDATE cards SET col = ? WHERE id = ?").run("shipped", card.id);
    const result = store.checkTitleConflict("Fix login bug");
    expect(result).toBeNull();
  });

  it("detects conflict among multiple cards", () => {
    store.create({ title: "Card alpha" });
    store.create({ title: "Fix login bug" });
    store.create({ title: "Card beta" });
    const result = store.checkTitleConflict("Fix login bug");
    expect(result).not.toBeNull();
    expect(result!.card.title).toBe("Fix login bug");
  });
});
