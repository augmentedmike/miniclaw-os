/**
 * tests/router.test.ts
 *
 * Tests route() for all three target patterns:
 *   - Memo signals with cardId → memo target
 *   - KB signals → kb target with correct kbType
 *   - No signals, no cardId → episodic fallback
 */

import { describe, it, expect } from "vitest";
import { route } from "../src/router.js";

describe("router: memo signals with cardId → memo", () => {
  it("routes card-scoped failure notes to memo", () => {
    const result = route(
      "tried using fs.watch but it doesn't work on Linux, do not retry",
      { cardId: "crd_abc123" },
    );
    expect(result.target).toBe("memo");
    expect(result.confidence).toBeGreaterThan(0.3);
  });

  it("routes session notes to memo when cardId present", () => {
    const result = route(
      "this run failed due to env conflict, workaround: unset TURBOPACK first",
      { cardId: "crd_def456" },
    );
    expect(result.target).toBe("memo");
  });

  it("routes 'already done' notes to memo with card context", () => {
    const result = route(
      "step completed: DB migrated successfully, do not re-run the migration",
      { cardId: "crd_xyz789" },
    );
    expect(result.target).toBe("memo");
  });

  it("defaults to memo when card context present with no signals", () => {
    const result = route(
      "The sky is blue today and the birds are singing outside.",
      { cardId: "crd_xyz789" },
    );
    expect(result.target).toBe("memo");
  });
});

describe("router: KB signals → kb with correct kbType", () => {
  it("routes error+fix content to kb with kbType=error", () => {
    const result = route(
      "Error: ENOSPC when running webpack. Fix: increase inotify watchers via sysctl. Solution is permanent.",
    );
    expect(result.target).toBe("kb");
    expect(result.kbType).toBe("error");
  });

  it("routes workflow descriptions to kb with kbType=workflow", () => {
    const result = route(
      "Workflow for deploying to production: always run tests first, then build, then deploy via CI pipeline. Never skip the build step.",
    );
    expect(result.target).toBe("kb");
    expect(result.kbType).toBe("workflow");
  });

  it("routes lessons to kb with kbType=lesson", () => {
    const result = route(
      "Lesson learned: next time always check the migration status before running a deploy. Takeaway: add a pre-flight check.",
    );
    expect(result.target).toBe("kb");
    expect(result.kbType).toBe("lesson");
  });

  it("routes howto content to kb with kbType=howto", () => {
    const result = route(
      "How to reset the development database: run npm run db:reset, then seed with npm run db:seed. Guide for new developers.",
    );
    expect(result.target).toBe("kb");
    expect(result.kbType).toBe("howto");
  });

  it("routes facts to kb", () => {
    const result = route(
      "Important fact: never deploy on Fridays. Rule: always have a rollback plan ready before any production deployment.",
    );
    expect(result.target).toBe("kb");
  });

  it("routes postmortem content to kb with kbType=postmortem", () => {
    const result = route(
      "Postmortem: the outage was caused by a misconfigured load balancer. Root cause: the health check endpoint was returning 200 even when the service was down. Prevention: add integration tests for health checks.",
    );
    expect(result.target).toBe("kb");
    expect(result.kbType).toBe("postmortem");
  });

  it("confidence is between 0 and 1", () => {
    const result = route(
      "Solution: the connection timeout was fixed by adding a retry policy. Always use exponential backoff.",
    );
    expect(result.target).toBe("kb");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });
});

describe("router: no signals, no cardId → episodic fallback", () => {
  it("defaults to episodic without card context and no signals", () => {
    const result = route("The weather is nice today and I feel good.");
    expect(result.target).toBe("episodic");
  });

  it("returns episodic with low confidence for neutral content", () => {
    const result = route("Observed something interesting during the morning standup.");
    expect(result.target).toBe("episodic");
    expect(result.confidence).toBeLessThanOrEqual(0.5);
  });

  it("returns a reason string for all routes", () => {
    const episodic = route("The morning standup went smoothly today.");
    expect(typeof episodic.reason).toBe("string");
    expect(episodic.reason.length).toBeGreaterThan(0);

    const kb = route(
      "Solution: always use parameterized queries to prevent SQL injection. This is a permanent rule.",
    );
    expect(typeof kb.reason).toBe("string");

    const memo = route("tried the approach, it failed, this run is broken", { cardId: "crd_1" });
    expect(typeof memo.reason).toBe("string");
  });
});
