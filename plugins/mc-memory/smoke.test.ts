/**
 * mc-memory — Smoke tests
 *
 * Tests routing, recall, and promotion logic without requiring
 * a running plugin runtime or embedder model.
 */

import { describe, it, expect } from "bun:test";
import { route } from "./src/router.js";

describe("mc-memory router", () => {
  it("routes card-scoped failure notes to memo", () => {
    const result = route(
      "tried using fs.watch but it doesn't work on Linux, do not retry",
      { cardId: "crd_abc123" },
    );
    expect(result.target).toBe("memo");
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it("routes error+fix content to kb", () => {
    const result = route(
      "Error: ENOSPC when running webpack. Fix: increase inotify watchers via sysctl. Solution is permanent.",
    );
    expect(result.target).toBe("kb");
    expect(result.kbType).toBe("error");
  });

  it("routes workflow descriptions to kb", () => {
    const result = route(
      "Workflow for deploying to production: always run tests first, then build, then deploy via CI pipeline. Never skip the build step.",
    );
    expect(result.target).toBe("kb");
    expect(result.kbType).toBe("workflow");
  });

  it("routes lessons to kb", () => {
    const result = route(
      "Lesson learned: next time always check the migration status before running a deploy. Takeaway: add a pre-flight check.",
    );
    expect(result.target).toBe("kb");
    expect(result.kbType).toBe("lesson");
  });

  it("routes howto content to kb", () => {
    const result = route(
      "How to reset the development database: run `npm run db:reset`, then seed with `npm run db:seed`. Guide for new developers.",
    );
    expect(result.target).toBe("kb");
    expect(result.kbType).toBe("howto");
  });

  it("defaults to memo when card context present with no signals", () => {
    const result = route(
      "The sky is blue today and the birds are singing.",
      { cardId: "crd_xyz789" },
    );
    expect(result.target).toBe("memo");
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("defaults to episodic without card context and no signals", () => {
    const result = route(
      "The sky is blue today and the birds are singing.",
    );
    expect(result.target).toBe("episodic");
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("routes completed steps to memo with card context", () => {
    const result = route(
      "step completed: DB migrated to v3, do not re-run the migration",
      { cardId: "crd_def456" },
    );
    expect(result.target).toBe("memo");
  });

  it("routes facts to kb", () => {
    const result = route(
      "Fact: the API rate limit is 100 requests per minute. Remember to always implement exponential backoff. Rule: never exceed 80 rps.",
    );
    expect(result.target).toBe("kb");
    expect(result.kbType).toBe("fact");
  });
});
