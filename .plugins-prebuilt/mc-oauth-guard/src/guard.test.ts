import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  OAuthGuard,
  matchOAuthRefreshError,
  computeBackoff,
  type GuardConfig,
} from "./guard.js";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "oauth-guard-test-"));
}

function makeConfig(stateDir: string): GuardConfig {
  return {
    maxConsecutiveFailures: 3,
    minBackoffMs: 300_000, // 5 min
    maxBackoffMs: 3_600_000, // 1 hour
    keychainRecovery: false,
    stateDir,
  };
}

describe("matchOAuthRefreshError", () => {
  it("matches Anthropic OAuth error", () => {
    const result = matchOAuthRefreshError(
      "Error: OAuth token refresh failed for anthropic: Failed to refresh OAuth token for anthropic. Please try again or re-authenticate.",
    );
    expect(result).toEqual({ provider: "anthropic" });
  });

  it("matches other providers", () => {
    const result = matchOAuthRefreshError(
      "OAuth token refresh failed for openai: something went wrong",
    );
    expect(result).toEqual({ provider: "openai" });
  });

  it("returns null for non-matching errors", () => {
    expect(matchOAuthRefreshError("Some random error")).toBeNull();
    expect(matchOAuthRefreshError("")).toBeNull();
  });
});

describe("computeBackoff", () => {
  it("returns minMs for first failure", () => {
    expect(computeBackoff(1, 300_000, 3_600_000)).toBe(300_000);
  });

  it("doubles on second failure", () => {
    expect(computeBackoff(2, 300_000, 3_600_000)).toBe(600_000);
  });

  it("caps at maxMs", () => {
    expect(computeBackoff(10, 300_000, 3_600_000)).toBe(3_600_000);
  });

  it("handles zero failures gracefully", () => {
    expect(computeBackoff(0, 300_000, 3_600_000)).toBe(300_000);
  });
});

describe("OAuthGuard", () => {
  let tmpDir: string;
  let guard: OAuthGuard;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    guard = new OAuthGuard(makeConfig(tmpDir));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("starts with no tracked profiles", () => {
    expect(guard.getAllStates()).toEqual({});
  });

  it("records failures and increments count", () => {
    const s1 = guard.recordFailure("claude-cli", "anthropic");
    expect(s1.consecutiveFailures).toBe(1);
    expect(s1.disabled).toBe(false);

    const s2 = guard.recordFailure("claude-cli", "anthropic");
    expect(s2.consecutiveFailures).toBe(2);
    expect(s2.disabled).toBe(false);
  });

  it("auto-disables after 3 consecutive failures", () => {
    guard.recordFailure("claude-cli", "anthropic");
    guard.recordFailure("claude-cli", "anthropic");
    const s3 = guard.recordFailure("claude-cli", "anthropic");

    expect(s3.consecutiveFailures).toBe(3);
    expect(s3.disabled).toBe(true);
    expect(s3.disabledAt).toBeGreaterThan(0);
  });

  it("shouldBlock returns blocked=true for disabled profiles", () => {
    guard.recordFailure("claude-cli", "anthropic");
    guard.recordFailure("claude-cli", "anthropic");
    guard.recordFailure("claude-cli", "anthropic");

    const check = guard.shouldBlock("claude-cli");
    expect(check.blocked).toBe(true);
    expect(check.reason).toContain("auto-disabled");
    expect(check.reason).toContain("paste-token");
  });

  it("shouldBlock returns blocked=true during backoff", () => {
    guard.recordFailure("claude-cli", "anthropic");
    // First failure → 5 min backoff, so should be blocked now
    const check = guard.shouldBlock("claude-cli");
    expect(check.blocked).toBe(true);
    expect(check.reason).toContain("backoff");
  });

  it("shouldBlock returns blocked=false for unknown profiles", () => {
    const check = guard.shouldBlock("nonexistent");
    expect(check.blocked).toBe(false);
  });

  it("recordSuccess clears failure state", () => {
    guard.recordFailure("claude-cli", "anthropic");
    guard.recordFailure("claude-cli", "anthropic");
    guard.recordSuccess("claude-cli");

    expect(guard.getProfileState("claude-cli")).toBeUndefined();
    expect(guard.shouldBlock("claude-cli").blocked).toBe(false);
  });

  it("resetProfile clears a specific profile", () => {
    guard.recordFailure("claude-cli", "anthropic");
    guard.recordFailure("other", "openai");
    guard.resetProfile("claude-cli");

    expect(guard.getProfileState("claude-cli")).toBeUndefined();
    expect(guard.getProfileState("other")).toBeDefined();
  });

  it("resetAll clears everything", () => {
    guard.recordFailure("claude-cli", "anthropic");
    guard.recordFailure("other", "openai");
    guard.resetAll();

    expect(guard.getAllStates()).toEqual({});
  });

  it("persists state across instances", () => {
    guard.recordFailure("claude-cli", "anthropic");
    guard.recordFailure("claude-cli", "anthropic");

    // Create a new guard reading from the same state file
    const guard2 = new OAuthGuard(makeConfig(tmpDir));
    const state = guard2.getProfileState("claude-cli");
    expect(state?.consecutiveFailures).toBe(2);
  });

  it("applies exponential backoff — nextRetryAt increases with failures", () => {
    const s1 = guard.recordFailure("claude-cli", "anthropic");
    const backoff1 = s1.nextRetryAt - s1.lastFailureAt;

    const s2 = guard.recordFailure("claude-cli", "anthropic");
    const backoff2 = s2.nextRetryAt - s2.lastFailureAt;

    expect(backoff2).toBeGreaterThan(backoff1);
  });

  it("backoff is at least 5 minutes after 3 failures", () => {
    guard.recordFailure("claude-cli", "anthropic");
    guard.recordFailure("claude-cli", "anthropic");
    const s3 = guard.recordFailure("claude-cli", "anthropic");

    const backoffMs = s3.nextRetryAt - s3.lastFailureAt;
    // 3rd failure: min * 2^2 = 300000 * 4 = 1200000 (20 min)
    expect(backoffMs).toBeGreaterThanOrEqual(300_000);
  });

  it("markRecoveryAttempted sets the flag", () => {
    guard.recordFailure("claude-cli", "anthropic");
    guard.markRecoveryAttempted("claude-cli");

    const state = guard.getProfileState("claude-cli");
    expect(state?.recoveryAttempted).toBe(true);
  });
});
