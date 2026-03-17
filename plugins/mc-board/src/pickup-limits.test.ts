/**
 * pickup-limits.test.ts
 *
 * Tests for:
 *  1. isOverLimit() — returns true when pickup_count >= max for column
 *  2. autoCorrect() — moves stuck cards forward, updates notes, increments correction_count
 *  3. incrementGlobalCorrections() — daily counter, auto-resets
 *  4. Integration: pickup_count increments on each pickup
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import Database from "better-sqlite3";
import { isOverLimit, MAX_PICKUPS, autoCorrect, readCorrectionState, incrementGlobalCorrections, resetCorrectionState } from "./pickup-limits.js";
import type { Card, Column } from "./card.js";

// ---- DB helpers ----

function createTestDb() {
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
      pickup_count     INTEGER NOT NULL DEFAULT 0,
      correction_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE card_history (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      col     TEXT NOT NULL,
      moved_at TEXT NOT NULL
    );
    CREATE TABLE active_work (
      card_id      TEXT PRIMARY KEY,
      project_id   TEXT,
      title        TEXT NOT NULL,
      worker       TEXT NOT NULL,
      col          TEXT NOT NULL,
      picked_up_at TEXT NOT NULL
    );
    CREATE TABLE pickup_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id    TEXT NOT NULL,
      project_id TEXT,
      title      TEXT NOT NULL DEFAULT '',
      worker     TEXT NOT NULL,
      col        TEXT NOT NULL DEFAULT '',
      action     TEXT NOT NULL,
      at         TEXT NOT NULL
    );
  `);
  return db;
}

function insertCard(
  db: InstanceType<typeof Database>,
  id: string,
  col: Column,
  pickupCount = 0,
  tags: string[] = [],
): Card {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO cards (id, title, col, priority, tags, created_at, updated_at, pickup_count, correction_count)
    VALUES (?, ?, ?, 'medium', ?, ?, ?, ?, 0)
  `).run(id, `Card ${id}`, col, JSON.stringify(tags), now, now, pickupCount);
  db.prepare(`INSERT INTO card_history (card_id, col, moved_at) VALUES (?, ?, ?)`).run(id, col, now);
  return {
    id,
    title: `Card ${id}`,
    column: col,
    priority: "medium",
    tags,
    created_at: now,
    updated_at: now,
    history: [{ column: col, moved_at: now }],
    problem_description: "",
    implementation_plan: "",
    acceptance_criteria: "",
    notes: "",
    review_notes: "",
    research: "",
    verify_url: "",
    work_log: [],
    pickup_count: pickupCount,
    correction_count: 0,
  };
}

// ---- Minimal CardStore stub for tests ----
import { CardStore } from "./store.js";
import { openDb } from "./db.js";

function createTestStore(tmpDir: string) {
  const db = openDb(tmpDir);
  return new CardStore(db);
}

// ---- Tests: isOverLimit ----

describe("isOverLimit()", () => {
  it("returns false when pickup_count is below max", () => {
    const card = { pickup_count: 2 } as Card;
    expect(isOverLimit(card, "backlog")).toBe(false); // max=3
  });

  it("returns true when pickup_count equals max (backlog=3)", () => {
    const card = { pickup_count: 3 } as Card;
    expect(isOverLimit(card, "backlog")).toBe(true);
  });

  it("returns true when pickup_count exceeds max", () => {
    const card = { pickup_count: 5 } as Card;
    expect(isOverLimit(card, "backlog")).toBe(true);
  });

  it("uses correct max for in-progress (max=10)", () => {
    expect(isOverLimit({ pickup_count: 9 } as Card, "in-progress")).toBe(false);
    expect(isOverLimit({ pickup_count: 10 } as Card, "in-progress")).toBe(true);
  });

  it("uses correct max for in-review (max=2)", () => {
    expect(isOverLimit({ pickup_count: 1 } as Card, "in-review")).toBe(false);
    expect(isOverLimit({ pickup_count: 2 } as Card, "in-review")).toBe(true);
  });

  it("returns false for shipped (no limit)", () => {
    expect(isOverLimit({ pickup_count: 999 } as Card, "shipped")).toBe(false);
  });

  it("treats undefined pickup_count as 0 (safe default)", () => {
    const card = {} as Card; // pickup_count undefined
    expect(isOverLimit(card, "backlog")).toBe(false);
  });
});

// ---- Tests: MAX_PICKUPS values ----

describe("MAX_PICKUPS constants", () => {
  it("backlog = 3", () => expect(MAX_PICKUPS.backlog).toBe(3));
  it("in-progress = 10", () => expect(MAX_PICKUPS["in-progress"]).toBe(10));
  it("in-review = 2", () => expect(MAX_PICKUPS["in-review"]).toBe(2));
  it("shipped = Infinity", () => expect(MAX_PICKUPS.shipped).toBe(Infinity));
});

// ---- Tests: autoCorrect() with real store ----

describe("autoCorrect()", () => {
  let tmpDir: string;
  let store: CardStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-board-test-"));
    store = createTestStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("moves backlog → in-progress", () => {
    const card = store.create({ title: "Stuck backlog card", tags: [] });
    // Simulate pickup count
    store["db"].prepare("UPDATE cards SET pickup_count = 3 WHERE id = ?").run(card.id);
    const stuckCard = store.findById(card.id);
    const result = autoCorrect(stuckCard, "backlog", store);
    expect(result).not.toBeNull();
    expect(result!.toColumn).toBe("in-progress");
    expect(result!.holdTagAdded).toBe(false);
    const updated = store.findById(card.id);
    expect(updated.column).toBe("in-progress");
    expect(updated.correction_count).toBe(1);
    expect(updated.notes).toContain("AUTO-CORRECTED");
  });

  it("moves in-progress → in-review", () => {
    const card = store.create({ title: "Stuck in-progress card" });
    store["db"].prepare("UPDATE cards SET col = 'in-progress', pickup_count = 10 WHERE id = ?").run(card.id);
    const stuckCard = store.findById(card.id);
    const result = autoCorrect(stuckCard, "in-progress", store);
    expect(result).not.toBeNull();
    expect(result!.toColumn).toBe("in-review");
    const updated = store.findById(card.id);
    expect(updated.column).toBe("in-review");
  });

  it("moves in-review → backlog with hold tag", () => {
    const card = store.create({ title: "Stuck in-review card" });
    store["db"].prepare("UPDATE cards SET col = 'in-review', pickup_count = 2 WHERE id = ?").run(card.id);
    const stuckCard = store.findById(card.id);
    const result = autoCorrect(stuckCard, "in-review", store);
    expect(result).not.toBeNull();
    expect(result!.toColumn).toBe("backlog");
    expect(result!.holdTagAdded).toBe(true);
    const updated = store.findById(card.id);
    expect(updated.column).toBe("backlog");
    expect(updated.tags).toContain("hold");
  });

  it("returns null for shipped cards (no correction path)", () => {
    const card = store.create({ title: "Shipped card" });
    store["db"].prepare("UPDATE cards SET col = 'shipped' WHERE id = ?").run(card.id);
    const shippedCard = store.findById(card.id);
    const result = autoCorrect(shippedCard, "shipped", store);
    expect(result).toBeNull();
  });

  it("does not add hold tag twice", () => {
    const card = store.create({ title: "Already hold card", tags: ["hold"] });
    store["db"].prepare("UPDATE cards SET col = 'in-review', pickup_count = 2 WHERE id = ?").run(card.id);
    const stuckCard = store.findById(card.id);
    autoCorrect(stuckCard, "in-review", store);
    const updated = store.findById(card.id);
    const holdCount = updated.tags.filter(t => t === "hold").length;
    expect(holdCount).toBe(1);
  });

  it("appends to existing notes without overwriting them", () => {
    const card = store.create({ title: "Card with notes", notes: "Original note." });
    store["db"].prepare("UPDATE cards SET pickup_count = 3 WHERE id = ?").run(card.id);
    const stuckCard = store.findById(card.id);
    autoCorrect(stuckCard, "backlog", store);
    const updated = store.findById(card.id);
    expect(updated.notes).toContain("Original note.");
    expect(updated.notes).toContain("AUTO-CORRECTED");
  });
});

// ---- Tests: global correction counter ----

describe("incrementGlobalCorrections()", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-board-corrections-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts at 0 if no state file exists", () => {
    const state = readCorrectionState(tmpDir);
    expect(state.count).toBe(0);
  });

  it("increments count on each call", () => {
    let state = incrementGlobalCorrections(tmpDir);
    expect(state.count).toBe(1);
    state = incrementGlobalCorrections(tmpDir);
    expect(state.count).toBe(2);
    state = incrementGlobalCorrections(tmpDir);
    expect(state.count).toBe(3);
  });

  it("resets daily when date changes", () => {
    // Write a state with yesterday's date
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const stateFile = path.join(tmpDir, "USER", "brain", "correction-state.json");
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ count: 99, lastResetAt: yesterday.toISOString() }));

    const state = incrementGlobalCorrections(tmpDir);
    expect(state.count).toBe(1); // reset to 1 (new day, first correction)
  });

  it("resetCorrectionState sets count to 0", () => {
    incrementGlobalCorrections(tmpDir);
    incrementGlobalCorrections(tmpDir);
    resetCorrectionState(tmpDir);
    const state = readCorrectionState(tmpDir);
    expect(state.count).toBe(0);
  });
});

// ---- Tests: pickup_count increments via ActiveWorkStore ----

describe("pickup_count increments on pickup", () => {
  let tmpDir: string;
  let store: CardStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-board-active-"));
    store = createTestStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("increments pickup_count each time a card is picked up", async () => {
    const { ActiveWorkStore } = await import("./active-work.js");
    const activeWork = new ActiveWorkStore(tmpDir);
    const card = store.create({ title: "Track pickups" });

    activeWork.pickup({ cardId: card.id, title: card.title, worker: "w1", column: "backlog" });
    expect(store.findById(card.id).pickup_count).toBe(1);

    activeWork.release(card.id, "w1");
    activeWork.pickup({ cardId: card.id, title: card.title, worker: "w2", column: "backlog" });
    expect(store.findById(card.id).pickup_count).toBe(2);

    activeWork.release(card.id, "w2");
    activeWork.pickup({ cardId: card.id, title: card.title, worker: "w3", column: "backlog" });
    expect(store.findById(card.id).pickup_count).toBe(3);

    // Now over the limit
    expect(isOverLimit(store.findById(card.id), "backlog")).toBe(true);
  });
});
