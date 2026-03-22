import { describe, it, expect } from "vitest";
import { checkGate } from "./state.js";
import type { Card } from "./card.js";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "crd_test0001",
    title: "Test card",
    column: "in-review",
    priority: "medium",
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    history: [],
    problem_description: "Test problem",
    implementation_plan: "Test plan",
    acceptance_criteria: "- [x] done",
    notes: "",
    review_notes: "",
    research: "",
    verify_url: "",
    work_log: [],
    ...overrides,
  };
}

describe("gateApprove (in-review → shipped)", () => {
  it("rejects when review_notes is empty", () => {
    const card = makeCard({ review_notes: "" });
    const result = checkGate(card, "shipped");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some(f => f.field === "review_notes")).toBe(true);
    }
  });

  it("rejects when review_notes has no commit hash", () => {
    const card = makeCard({ review_notes: "Looks good, approved. no-pr" });
    const result = checkGate(card, "shipped");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some(f => f.reason.includes("no commit hash"))).toBe(true);
    }
  });

  it("rejects when review_notes has no PR evidence", () => {
    const card = makeCard({ review_notes: "Commit abc1234 landed." });
    const result = checkGate(card, "shipped");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some(f => f.reason.includes("no PR merge evidence"))).toBe(true);
    }
  });

  it("rejects when verify_url is set but no verification evidence in review_notes", () => {
    const card = makeCard({
      review_notes: "Commit abc1234 on main. PR #42 merged.",
      verify_url: "http://localhost:3001/health",
    });
    const result = checkGate(card, "shipped");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some(f => f.field === "verify_url")).toBe(true);
    }
  });

  it("passes with proper commit hash + PR evidence + no verify_url", () => {
    const card = makeCard({
      review_notes: "Commit abc1234 on main. PR #42 merged. All criteria met.",
      verify_url: "",
    });
    const result = checkGate(card, "shipped");
    expect(result.ok).toBe(true);
  });

  it("passes with proper commit hash + no-pr marker + no verify_url", () => {
    const card = makeCard({
      review_notes: "Commit abc1234 on main. no-pr (direct push). All criteria met.",
      verify_url: "",
    });
    const result = checkGate(card, "shipped");
    expect(result.ok).toBe(true);
  });

  it("passes with full evidence including verify_url confirmation", () => {
    const card = makeCard({
      review_notes: "Commit abc1234 on main. PR #42 merged. verified live — HTTP 200.",
      verify_url: "http://localhost:3001/health",
    });
    const result = checkGate(card, "shipped");
    expect(result.ok).toBe(true);
  });

  it("passes when verify_url evidence uses HTTP status pattern", () => {
    const card = makeCard({
      review_notes: "Commit abc1234 on main. PR #42 merged. curl returned HTTP/1.1 200 OK",
      verify_url: "http://localhost:3001/health",
    });
    const result = checkGate(card, "shipped");
    expect(result.ok).toBe(true);
  });

  it("cards without verify_url or project can ship with just commit hash + PR evidence", () => {
    const card = makeCard({
      review_notes: "Commit deadbeef on main. no-pr. Research card, no deploy.",
      verify_url: "",
    });
    const result = checkGate(card, "shipped");
    expect(result.ok).toBe(true);
  });
});

describe("gateSubmit (in-progress → in-review)", () => {
  it("rejects when acceptance criteria have unchecked items", () => {
    const card = makeCard({
      column: "in-progress",
      acceptance_criteria: "- [ ] not done\n- [x] done",
    });
    const result = checkGate(card, "in-review");
    expect(result.ok).toBe(false);
  });

  it("passes when all criteria are checked", () => {
    const card = makeCard({
      column: "in-progress",
      acceptance_criteria: "- [x] done\n- [x] also done",
    });
    const result = checkGate(card, "in-review");
    expect(result.ok).toBe(true);
  });
});
