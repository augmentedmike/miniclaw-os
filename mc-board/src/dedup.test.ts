/**
 * dedup.test.ts — Unit tests for title-based duplicate detection.
 *
 * Covers:
 *   - normalizeTitle / tokenize
 *   - jaccardSimilarity
 *   - areDuplicates (exact + semantic)
 *   - findTitleConflict (with project scoping + excludeId)
 *   - formatConflictError output
 */

import { describe, expect, it } from "vitest";
import {
  areDuplicates,
  findAllConflicts,
  findTitleConflict,
  formatConflictError,
  formatConflictList,
  jaccardSimilarity,
  normalizeTitle,
  SIMILARITY_THRESHOLD,
  tokenize,
} from "./dedup.js";
import type { Card } from "./card.js";

// ---- Helpers ----

function makeCard(overrides: Partial<Card> & { title: string }): Card {
  const now = new Date().toISOString();
  return {
    id: `crd_${Math.random().toString(16).slice(2, 10)}`,
    column: "backlog",
    priority: "medium",
    tags: [],
    created_at: now,
    updated_at: now,
    history: [{ column: "backlog", moved_at: now }],
    problem_description: "",
    implementation_plan: "",
    acceptance_criteria: "",
    notes: "",
    review_notes: "",
    ...overrides,
  };
}

// ---- normalizeTitle ----

describe("normalizeTitle", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeTitle("Fix the Login Bug!")).toBe("fix the login bug");
  });

  it("collapses whitespace", () => {
    expect(normalizeTitle("  foo   bar  ")).toBe("foo bar");
  });

  it("handles empty string", () => {
    expect(normalizeTitle("")).toBe("");
  });

  it("strips special characters", () => {
    expect(normalizeTitle("API: v2.0 redesign — now")).toBe("api  v2 0 redesign  now".replace(/\s+/g, " ").trim());
  });
});

// ---- tokenize ----

describe("tokenize", () => {
  it("removes stop words", () => {
    const tokens = tokenize("Fix the login bug for the user");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("for");
    expect(tokens).toContain("fix");
    expect(tokens).toContain("login");
    expect(tokens).toContain("bug");
    expect(tokens).toContain("user");
  });

  it("removes single-character words", () => {
    const tokens = tokenize("A b c defgh");
    expect(tokens).not.toContain("b");
    expect(tokens).not.toContain("c");
    expect(tokens).toContain("defgh");
  });

  it("returns empty for stop-word-only title", () => {
    expect(tokenize("the and or a")).toEqual([]);
  });
});

// ---- jaccardSimilarity ----

describe("jaccardSimilarity", () => {
  it("returns 1.0 for identical sets", () => {
    const s = new Set(["fix", "login", "bug"]);
    expect(jaccardSimilarity(s, s)).toBe(1.0);
  });

  it("returns 0.0 for disjoint sets", () => {
    expect(jaccardSimilarity(new Set(["foo"]), new Set(["bar"]))).toBe(0.0);
  });

  it("returns 1.0 for two empty sets", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1.0);
  });

  it("returns 0.0 when one set is empty", () => {
    expect(jaccardSimilarity(new Set(["foo"]), new Set())).toBe(0.0);
  });

  it("computes partial overlap correctly", () => {
    // intersection: {b} = 1; union: {a, b, c} = 3 → 1/3
    const sim = jaccardSimilarity(new Set(["a", "b"]), new Set(["b", "c"]));
    expect(sim).toBeCloseTo(1 / 3, 5);
  });

  it("computes 0.75 for 3-of-4 overlap", () => {
    // intersection: {a,b,c} = 3; union: {a,b,c,d} = 4 → 0.75
    const sim = jaccardSimilarity(
      new Set(["a", "b", "c"]),
      new Set(["a", "b", "c", "d"]),
    );
    expect(sim).toBeCloseTo(0.75, 5);
  });
});

// ---- areDuplicates ----

describe("areDuplicates", () => {
  it("detects exact title match (case-insensitive)", () => {
    expect(areDuplicates("Fix Login Bug", "fix login bug")).toBe(true);
  });

  it("detects exact match after punctuation strip", () => {
    expect(areDuplicates("Fix login bug!", "Fix login bug")).toBe(true);
  });

  it("detects semantic duplicate (≥70% Jaccard)", () => {
    // "Build verified contacts system registry trusted identities"
    // vs "Build contacts registry for trusted identity verification"
    // Both have enough tokens with >70% overlap
    expect(
      areDuplicates(
        "Build verified contacts system for trusted identities",
        "Build contacts registry system for trusted identities",
      ),
    ).toBe(true);
  });

  it("does NOT flag distinct tasks as duplicates", () => {
    expect(
      areDuplicates(
        "Fix OAuth token refresh bug",
        "Add dark mode to dashboard UI",
      ),
    ).toBe(false);
  });

  it("does NOT flag short titles with partial overlap (≤2 tokens)", () => {
    // "Add auth" vs "Fix auth" — 1/2 token overlap = 0.5, but short → false
    expect(areDuplicates("Add auth", "Fix auth")).toBe(false);
  });

  it("does NOT flag titles with ~50% overlap as duplicates", () => {
    // "Build plugin system" vs "Plugin store browser" — moderate overlap
    const sim =
      jaccardSimilarity(
        new Set(tokenize("Build plugin system")),
        new Set(tokenize("Plugin store browser")),
      );
    // Only "plugin" overlaps in 4-token union → ~0.25
    expect(sim).toBeLessThan(SIMILARITY_THRESHOLD);
    expect(areDuplicates("Build plugin system", "Plugin store browser")).toBe(false);
  });

  it("is symmetric — A vs B equals B vs A", () => {
    const a = "Refactor authentication module for session handling";
    const b = "Refactor session handling in authentication module";
    expect(areDuplicates(a, b)).toBe(areDuplicates(b, a));
  });
});

// ---- findTitleConflict ----

describe("findTitleConflict", () => {
  it("returns null when no cards exist", () => {
    expect(findTitleConflict("Any title", [])).toBeNull();
  });

  it("returns null when no conflict", () => {
    const cards = [
      makeCard({ title: "Add dark mode to dashboard" }),
      makeCard({ title: "Fix OAuth token bug" }),
    ];
    expect(findTitleConflict("Build Redis integration plugin", cards)).toBeNull();
  });

  it("detects exact title match", () => {
    const existing = makeCard({ title: "Fix login bug", id: "crd_aaa00001" });
    const conflict = findTitleConflict("Fix login bug", [existing]);
    expect(conflict).not.toBeNull();
    expect(conflict!.card.id).toBe("crd_aaa00001");
    expect(conflict!.similarity).toBe(1.0);
  });

  it("detects semantic duplicate", () => {
    const existing = makeCard({
      id: "crd_aaa00002",
      title: "Build contacts registry for trusted identities system",
    });
    const conflict = findTitleConflict(
      "Build verified contacts system for trusted identities",
      [existing],
    );
    expect(conflict).not.toBeNull();
    expect(conflict!.similarity).toBeGreaterThanOrEqual(SIMILARITY_THRESHOLD);
  });

  it("excludes card by excludeId", () => {
    const existing = makeCard({ title: "Fix login bug", id: "crd_same001" });
    // Same title but we're checking the card against itself during rename — should be clear
    const conflict = findTitleConflict("Fix login bug", [existing], "crd_same001");
    expect(conflict).toBeNull();
  });

  it("skips shipped cards (not passed in — caller filters)", () => {
    // findTitleConflict itself doesn't filter by column; that's the store's job.
    // Verify that a shipped card passed in would match (store should exclude it).
    const shipped = makeCard({ title: "Fix login bug", id: "crd_shipped1", column: "shipped" });
    // If caller passes shipped card, it WOULD match — store.checkTitleConflict filters it out
    const conflict = findTitleConflict("Fix login bug", [shipped]);
    expect(conflict).not.toBeNull(); // raw function doesn't filter
  });

  it("consolidation: after exclude, finds next conflict if two exist", () => {
    const card1 = makeCard({ title: "Fix login bug", id: "crd_conflict1" });
    const card2 = makeCard({ title: "Fix login bug", id: "crd_conflict2" });
    // Exclude card1 — should still find card2
    const conflict = findTitleConflict("Fix login bug", [card1, card2], "crd_conflict1");
    expect(conflict).not.toBeNull();
    expect(conflict!.card.id).toBe("crd_conflict2");
  });
});

// ---- formatConflictError ----

describe("formatConflictError", () => {
  it("includes DUPLICATE DETECTED header", () => {
    const card = makeCard({ title: "Fix login bug", id: "crd_fmt0001" });
    const msg = formatConflictError("Fix login bug", { card, similarity: 1.0 });
    expect(msg).toContain("DUPLICATE DETECTED");
    expect(msg).toContain("Fix login bug");
    expect(msg).toContain("crd_fmt0001");
  });

  it("labels exact match correctly", () => {
    const card = makeCard({ title: "Fix login bug", id: "crd_fmt0002" });
    const msg = formatConflictError("Fix login bug", { card, similarity: 1.0 });
    expect(msg).toContain("exact match");
  });

  it("labels semantic similarity with percentage", () => {
    const card = makeCard({ title: "Fix login bug variant", id: "crd_fmt0003" });
    const msg = formatConflictError("Fix login similar", { card, similarity: 0.75 });
    expect(msg).toContain("75% similar");
  });

  it("includes project note when card has project_id", () => {
    const card = makeCard({
      title: "Fix bug",
      id: "crd_fmt0004",
      project_id: "prj_abc123",
    });
    const msg = formatConflictError("Fix bug", { card, similarity: 1.0 });
    expect(msg).toContain("prj_abc123");
  });

  it("includes instructions to view and merge", () => {
    const card = makeCard({ title: "Fix bug", id: "crd_fmt0005" });
    const msg = formatConflictError("Fix bug", { card, similarity: 1.0 });
    expect(msg).toContain("brain show");
    expect(msg).toContain("brain update");
  });
});

// ---- findAllConflicts ----

describe("findAllConflicts", () => {
  it("returns empty array when no cards exist", () => {
    expect(findAllConflicts("Any title", [])).toEqual([]);
  });

  it("returns empty array when no conflicts", () => {
    const cards = [
      makeCard({ title: "Add dark mode to dashboard" }),
      makeCard({ title: "Fix OAuth token bug" }),
    ];
    expect(findAllConflicts("Build Redis integration plugin", cards)).toEqual([]);
  });

  it("returns ALL matching cards, not just first", () => {
    // Use titles with high token overlap (>70% Jaccard)
    const card1 = makeCard({ title: "Fix login authentication bug session handler", id: "crd_all001" });
    const card2 = makeCard({ title: "Fix login authentication bug session refresh", id: "crd_all002" });
    const card3 = makeCard({ title: "Add dark mode to dashboard", id: "crd_all003" });
    const conflicts = findAllConflicts(
      "Fix login authentication bug session handler refresh",
      [card1, card2, card3],
    );
    expect(conflicts.length).toBe(2);
    expect(conflicts.map(c => c.card.id)).toContain("crd_all001");
    expect(conflicts.map(c => c.card.id)).toContain("crd_all002");
  });

  it("returns results sorted by similarity descending", () => {
    const exact = makeCard({ title: "Fix login bug", id: "crd_sort001" });
    const similar = makeCard({
      title: "Build contacts registry system for trusted identities",
      id: "crd_sort002",
    });
    const conflicts = findAllConflicts("Fix login bug", [similar, exact]);
    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    expect(conflicts[0].card.id).toBe("crd_sort001");
    expect(conflicts[0].similarity).toBe(1.0);
  });

  it("matches on problem_description text", () => {
    const card = makeCard({
      title: "Refactor authentication",
      id: "crd_prob001",
      problem_description: "The session handling middleware needs complete overhaul to support token refresh and rotation",
    });
    // Title alone wouldn't match, but problem text shares tokens
    const conflicts = findAllConflicts(
      "Overhaul middleware for token handling",
      [card],
      "The session handling middleware needs complete redesign to support token refresh and rotation",
    );
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].card.id).toBe("crd_prob001");
  });

  it("excludes card by excludeId", () => {
    const card = makeCard({ title: "Fix login bug", id: "crd_excl001" });
    const conflicts = findAllConflicts("Fix login bug", [card], undefined, "crd_excl001");
    expect(conflicts).toEqual([]);
  });

  it("short titles (≤2 tokens) without problem text require exact match", () => {
    const card = makeCard({ title: "Add auth", id: "crd_short001" });
    // "Fix auth" vs "Add auth" — only 1 of 2 tokens overlap, short title, no problem text
    const conflicts = findAllConflicts("Fix auth", [card]);
    expect(conflicts).toEqual([]);
  });

  it("short titles with exact match still detected", () => {
    const card = makeCard({ title: "Add auth", id: "crd_short002" });
    const conflicts = findAllConflicts("Add auth", [card]);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].similarity).toBe(1.0);
  });
});

// ---- formatConflictList ----

describe("formatConflictList", () => {
  it("returns empty string for no conflicts", () => {
    expect(formatConflictList("Test", [])).toBe("");
  });

  it("includes card ID, title, column, and similarity percentage", () => {
    const card = makeCard({ title: "Fix login bug", id: "crd_list001", column: "backlog" });
    const msg = formatConflictList("Fix login bug", [{ card, similarity: 0.85 }]);
    expect(msg).toContain("crd_list001");
    expect(msg).toContain("Fix login bug");
    expect(msg).toContain("backlog");
    expect(msg).toContain("85% similar");
  });

  it("shows exact match label for 1.0 similarity", () => {
    const card = makeCard({ title: "Fix login bug", id: "crd_list002", column: "in-progress" });
    const msg = formatConflictList("Fix login bug", [{ card, similarity: 1.0 }]);
    expect(msg).toContain("exact match");
    expect(msg).toContain("in-progress");
  });

  it("shows numbered list for multiple conflicts", () => {
    const card1 = makeCard({ title: "Fix login bug", id: "crd_list003", column: "backlog" });
    const card2 = makeCard({ title: "Fix login issue", id: "crd_list004", column: "in-progress" });
    const msg = formatConflictList("Fix login problem", [
      { card: card1, similarity: 0.90 },
      { card: card2, similarity: 0.75 },
    ]);
    expect(msg).toContain("1.");
    expect(msg).toContain("2.");
    expect(msg).toContain("crd_list003");
    expect(msg).toContain("crd_list004");
  });

  it("includes --force hint", () => {
    const card = makeCard({ title: "Fix bug", id: "crd_list005" });
    const msg = formatConflictList("Fix bug", [{ card, similarity: 1.0 }]);
    expect(msg).toContain("--force");
  });

  it("includes SIMILAR CARDS FOUND header with title", () => {
    const card = makeCard({ title: "Fix bug", id: "crd_list006" });
    const msg = formatConflictList("Fix bug", [{ card, similarity: 1.0 }]);
    expect(msg).toContain('SIMILAR CARDS FOUND for "Fix bug"');
  });
});
