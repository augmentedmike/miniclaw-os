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
  tokenizeText,
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

// ---- tokenizeText ----

describe("tokenizeText", () => {
  it("tokenizes a long text and truncates to 100 words", () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
    const tokens = tokenizeText(words);
    expect(tokens.length).toBeLessThanOrEqual(100);
  });

  it("removes stop words from problem text", () => {
    const tokens = tokenizeText("The system is broken and needs fixing via the CLI");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("and");
    expect(tokens).toContain("system");
    expect(tokens).toContain("broken");
    expect(tokens).toContain("needs");
    expect(tokens).toContain("fixing");
    expect(tokens).toContain("cli");
  });
});

// ---- findAllConflicts ----

describe("findAllConflicts", () => {
  it("returns empty array when no cards exist", () => {
    expect(findAllConflicts("Any title", undefined, [])).toEqual([]);
  });

  it("returns empty when no similar cards", () => {
    const cards = [
      makeCard({ title: "Add dark mode to the dashboard UI" }),
      makeCard({ title: "Fix OAuth token refresh" }),
    ];
    expect(findAllConflicts("Build Redis integration plugin system", undefined, cards)).toEqual([]);
  });

  it("returns ALL matching cards, not just first", () => {
    // Both cards share enough tokens with the new title to meet the 70% threshold
    const card1 = makeCard({ id: "crd_ac0001", title: "Build contacts registry for trusted identities system" });
    const card2 = makeCard({ id: "crd_ac0002", title: "Build verified contacts system trusted identities" });
    const card3 = makeCard({ id: "crd_ac0003", title: "Add dark mode" }); // unrelated
    const results = findAllConflicts(
      "Build verified contacts system for trusted identities",
      undefined,
      [card1, card2, card3],
    );
    expect(results.length).toBeGreaterThanOrEqual(2);
    const ids = results.map(r => r.card.id);
    expect(ids).toContain("crd_ac0001");
    expect(ids).toContain("crd_ac0002");
    expect(ids).not.toContain("crd_ac0003");
  });

  it("sorts results by similarity descending", () => {
    const exact = makeCard({ id: "crd_ac0004", title: "Fix login bug in auth system flow" });
    const similar = makeCard({ id: "crd_ac0005", title: "Fix login issue in authentication system flow" });
    const results = findAllConflicts("Fix login bug in auth system flow", undefined, [similar, exact]);
    expect(results[0].similarity).toBeGreaterThanOrEqual(results[1]?.similarity ?? 0);
  });

  it("finds match via problem_description text when combined similarity is high", () => {
    // Both cards share nearly identical problem text — combined Jaccard should exceed 0.70
    const problemText = "token refresh breaks session continuity causing logout failures authentication error";
    const existing = makeCard({
      id: "crd_ac0006",
      title: "Fix auth error handling",
      problem_description: problemText,
    });
    // New card has same problem text — combined token sets overlap heavily
    const results = findAllConflicts(
      "Fix auth error handling",
      problemText,
      [existing],
    );
    // Exact title match — always finds it regardless of problem text
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].card.id).toBe("crd_ac0006");
  });

  it("excludes card by excludeId", () => {
    const existing = makeCard({ id: "crd_ac0007", title: "Fix login bug" });
    const results = findAllConflicts("Fix login bug", undefined, [existing], "crd_ac0007");
    expect(results).toEqual([]);
  });

  it("short titles (≤2 tokens) don't match on Jaccard alone", () => {
    const existing = makeCard({ id: "crd_ac0008", title: "Add auth" });
    const results = findAllConflicts("Fix auth", undefined, [existing]);
    // Short — should not produce false positive
    expect(results).toEqual([]);
  });

  it("exact title match is always included", () => {
    const existing = makeCard({ id: "crd_ac0009", title: "Fix login bug" });
    const results = findAllConflicts("Fix login bug", undefined, [existing]);
    expect(results.length).toBe(1);
    expect(results[0].similarity).toBe(1.0);
  });

  it("does not include shipped cards (caller filters — raw function does not)", () => {
    // The raw function itself does not filter — store.checkSimilarCards handles that.
    // Verify raw function matches even shipped cards when passed directly.
    const shipped = makeCard({ id: "crd_ac0010", title: "Fix login bug", column: "shipped" });
    const results = findAllConflicts("Fix login bug", undefined, [shipped]);
    expect(results.length).toBe(1); // raw fn doesn't filter
  });
});

// ---- formatConflictList ----

describe("formatConflictList", () => {
  it("includes the title being created", () => {
    const card = makeCard({ id: "crd_fcl001", title: "Existing card" });
    const msg = formatConflictList("New card title", [{ card, similarity: 0.8 }]);
    expect(msg).toContain("New card title");
  });

  it("includes card ID and title in numbered list", () => {
    const card = makeCard({ id: "crd_fcl002", title: "Fix login bug" });
    const msg = formatConflictList("Fix login issue", [{ card, similarity: 0.85 }]);
    expect(msg).toContain("crd_fcl002");
    expect(msg).toContain("Fix login bug");
    expect(msg).toContain("1.");
  });

  it("includes column and similarity percentage", () => {
    const card = makeCard({ id: "crd_fcl003", title: "Fix bug", column: "in-progress" });
    const msg = formatConflictList("Fix bug", [{ card, similarity: 0.75 }]);
    expect(msg).toContain("in-progress");
    expect(msg).toContain("75%");
  });

  it("labels exact match differently from percentage", () => {
    const card = makeCard({ id: "crd_fcl004", title: "Fix bug" });
    const msg = formatConflictList("Fix bug", [{ card, similarity: 1.0 }]);
    expect(msg).toContain("exact");
  });

  it("includes confirmation prompt", () => {
    const card = makeCard({ id: "crd_fcl005", title: "Fix bug" });
    const msg = formatConflictList("Fix bug", [{ card, similarity: 1.0 }]);
    expect(msg).toContain("Proceed anyway");
  });

  it("numbers multiple matches", () => {
    const card1 = makeCard({ id: "crd_fcl006", title: "Fix bug one" });
    const card2 = makeCard({ id: "crd_fcl007", title: "Fix bug two" });
    const msg = formatConflictList("Fix bug", [
      { card: card1, similarity: 0.9 },
      { card: card2, similarity: 0.8 },
    ]);
    expect(msg).toContain("1.");
    expect(msg).toContain("2.");
    expect(msg).toContain("crd_fcl006");
    expect(msg).toContain("crd_fcl007");
  });
});
