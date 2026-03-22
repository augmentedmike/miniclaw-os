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
