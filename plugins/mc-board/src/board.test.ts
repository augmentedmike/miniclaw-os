/**
 * board.test.ts — Unit tests for board rendering functions.
 *
 * Covers:
 *   - renderCompactBoard: empty board message, grouped columns
 *   - renderFullBoard: empty board, column grouping
 *   - renderCompactBoardWithProjects: empty projects array
 *   - renderColumnContext: column filter returning no matches
 */

import { describe, it, expect } from "vitest";
import {
  renderCompactBoard,
  renderFullBoard,
  renderCompactBoardWithProjects,
  renderColumnContext,
} from "./board.js";
import type { Card } from "./card.js";
import type { Project } from "./project.js";

function makeCard(overrides: Partial<Card> = {}): Card {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "crd_test01",
    title: "Test card",
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

function makeProject(overrides: Partial<Project> = {}): Project {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    id: "proj_test01",
    name: "Test Project",
    slug: "test-project",
    description: "",
    work_dir: "/tmp/test-project",
    github_repo: "",
    build_command: "",
    status: "active",
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

// ---- renderCompactBoard ----

describe("renderCompactBoard", () => {
  it("returns empty-board message for 0 cards", () => {
    const result = renderCompactBoard([]);
    expect(result).toBe("(no cards on board)");
  });

  it("includes card id and title", () => {
    const card = makeCard({ id: "crd_abc123", title: "My test card" });
    const result = renderCompactBoard([card]);
    expect(result).toContain("crd_abc123");
    expect(result).toContain("My test card");
  });

  it("groups cards by column — backlog card appears under backlog", () => {
    const card = makeCard({ id: "crd_b01", column: "backlog", title: "Backlog item" });
    const result = renderCompactBoard([card]);
    expect(result).toContain("backlog");
    expect(result).toContain("Backlog item");
  });

  it("groups cards by column — in-progress card appears correctly", () => {
    const card = makeCard({ id: "crd_p01", column: "in-progress", title: "Active work" });
    const result = renderCompactBoard([card]);
    expect(result).toContain("in-progress");
    expect(result).toContain("Active work");
  });

  it("cards in different columns are separated correctly", () => {
    const backlogCard = makeCard({ id: "crd_b01", column: "backlog", title: "Backlog item" });
    const progressCard = makeCard({ id: "crd_p01", column: "in-progress", title: "Progress item" });
    const result = renderCompactBoard([backlogCard, progressCard]);
    expect(result).toContain("backlog");
    expect(result).toContain("in-progress");
    expect(result).toContain("Backlog item");
    expect(result).toContain("Progress item");
  });

  it("high priority card shows priority label", () => {
    const card = makeCard({ id: "crd_h01", priority: "high", title: "High prio card" });
    const result = renderCompactBoard([card]);
    expect(result).toContain("[high]");
  });

  it("medium priority card does not show priority label", () => {
    const card = makeCard({ id: "crd_m01", priority: "medium", title: "Medium prio card" });
    const result = renderCompactBoard([card]);
    expect(result).not.toContain("[medium]");
  });
});

// ---- renderFullBoard ----

describe("renderFullBoard", () => {
  it("returns empty-board message for 0 cards", () => {
    const result = renderFullBoard([]);
    expect(result.toLowerCase()).toContain("no cards");
  });

  it("shows all column headers", () => {
    const card = makeCard({ id: "crd_x01", column: "backlog", title: "A card" });
    const result = renderFullBoard([card]);
    expect(result.toUpperCase()).toContain("BACKLOG");
  });

  it("shows card in its correct column section", () => {
    const card = makeCard({ id: "crd_r01", column: "in-review", title: "In Review card" });
    const result = renderFullBoard([card]);
    expect(result).toContain("IN REVIEW");
    expect(result).toContain("In Review card");
  });

  it("shows (empty) for columns with no cards", () => {
    const card = makeCard({ id: "crd_b02", column: "backlog", title: "Only backlog card" });
    const result = renderFullBoard([card]);
    expect(result).toContain("(empty)");
  });
});

// ---- renderCompactBoardWithProjects ----

describe("renderCompactBoardWithProjects", () => {
  it("returns empty-board message for 0 cards", () => {
    const result = renderCompactBoardWithProjects([], []);
    expect(result).toBe("(no cards on board)");
  });

  it("handles empty projects array gracefully (no crash)", () => {
    const card = makeCard({ id: "crd_up01", title: "Unlinked card" });
    expect(() => renderCompactBoardWithProjects([card], [])).not.toThrow();
  });

  it("renders unlinked cards when projects array is empty", () => {
    const card = makeCard({ id: "crd_up02", title: "Unlinked card" });
    const result = renderCompactBoardWithProjects([card], []);
    expect(result).toContain("Unlinked card");
  });

  it("groups cards under project name when project exists", () => {
    const project = makeProject({ id: "proj_p01", name: "Alpha Project" });
    const card = makeCard({ id: "crd_lp01", title: "Linked card", project_id: "proj_p01" });
    const result = renderCompactBoardWithProjects([card], [project]);
    expect(result).toContain("Alpha Project");
    expect(result).toContain("Linked card");
  });

  it("cards with unknown project_id fall into unlinked section", () => {
    const card = makeCard({ id: "crd_up03", title: "Ghost project card", project_id: "proj_unknown" });
    const result = renderCompactBoardWithProjects([card], []);
    expect(result).toContain("Ghost project card");
  });
});

// ---- renderColumnContext ----

describe("renderColumnContext", () => {
  it("returns no-cards message when column is empty", () => {
    const result = renderColumnContext("backlog", [], []);
    expect(result.toLowerCase()).toContain("no cards");
  });

  it("returns no-cards message when filter tags match nothing", () => {
    const card = makeCard({ id: "crd_t01", column: "backlog", tags: ["feature"] });
    const result = renderColumnContext("backlog", [card], [], ["bug"]);
    expect(result.toLowerCase()).toContain("no cards");
  });

  it("returns matching cards when filter tag matches", () => {
    const card = makeCard({ id: "crd_t02", column: "backlog", title: "Feature card", tags: ["feature"] });
    const result = renderColumnContext("backlog", [card], [], ["feature"]);
    expect(result).toContain("Feature card");
  });

  it("only shows cards in the specified column", () => {
    const backlogCard = makeCard({ id: "crd_col1", column: "backlog", title: "Backlog card" });
    const progressCard = makeCard({ id: "crd_col2", column: "in-progress", title: "Progress card" });
    const result = renderColumnContext("backlog", [backlogCard, progressCard], []);
    expect(result).toContain("Backlog card");
    expect(result).not.toContain("Progress card");
  });
});
