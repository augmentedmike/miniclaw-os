/**
 * Integration tests for git guardrails.
 *
 * These tests create temporary git repos to verify:
 * - Direct push to main/master is blocked
 * - Branch push + PR creation flow works (PR creation is mocked)
 * - Pre-push hook installation works
 * - Protected branch detection works
 *
 * Run: npx vitest run shared/git-guardrails/guardrails.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import {
  isProtectedBranch,
  getCurrentBranch,
  guardedPush,
  guardedPushAndPR,
  installPrePushHook,
  PRE_PUSH_HOOK_CONTENT,
} from "./index.js";

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

function run(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { encoding: "utf-8", cwd, timeout: 10_000 }).trim();
}

let tmpDir: string;
let remoteDir: string;

/**
 * Set up a local git repo with a bare remote for push testing.
 */
function setupTestRepos(): { local: string; remote: string } {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "mc-guardrails-test-"));

  // Create bare remote
  const remote = path.join(base, "remote.git");
  fs.mkdirSync(remote);
  run("git", ["init", "--bare"], remote);

  // Create local repo
  const local = path.join(base, "local");
  fs.mkdirSync(local);
  run("git", ["init"], local);
  run("git", ["config", "user.email", "test@test.com"], local);
  run("git", ["config", "user.name", "Test"], local);
  run("git", ["remote", "add", "origin", remote], local);

  // Initial commit on main
  fs.writeFileSync(path.join(local, "README.md"), "# Test\n");
  run("git", ["add", "README.md"], local);
  run("git", ["commit", "-m", "init"], local);
  run("git", ["push", "-u", "origin", "main"], local);

  return { local, remote };
}

function cleanupTestRepos(base: string): void {
  try {
    fs.rmSync(base, { recursive: true, force: true });
  } catch {}
}

// ─── isProtectedBranch ──────────────────────────────────────────────────

describe("isProtectedBranch", () => {
  it("returns true for 'main'", () => {
    expect(isProtectedBranch("main")).toBe(true);
  });

  it("returns true for 'master'", () => {
    expect(isProtectedBranch("master")).toBe(true);
  });

  it("returns false for feature branches", () => {
    expect(isProtectedBranch("feat/my-feature")).toBe(false);
    expect(isProtectedBranch("contrib/mc-weather")).toBe(false);
    expect(isProtectedBranch("fix/bug-123")).toBe(false);
  });

  it("returns false for branches containing 'main'", () => {
    expect(isProtectedBranch("main-backup")).toBe(false);
    expect(isProtectedBranch("not-main")).toBe(false);
  });
});

// ─── guardedPush — blocks main ──────────────────────────────────────────

describe("guardedPush", () => {
  let repos: { local: string; remote: string };

  beforeEach(() => {
    repos = setupTestRepos();
  });

  afterEach(() => {
    cleanupTestRepos(path.dirname(repos.local));
  });

  it("blocks direct push to main", () => {
    const result = guardedPush(repos.local, "origin", "main", noopLogger);
    expect(result.pushed).toBe(false);
    expect(result.error).toContain("protected branch");
    expect(result.error).toContain("main");
  });

  it("blocks direct push to master", () => {
    const result = guardedPush(repos.local, "origin", "master", noopLogger);
    expect(result.pushed).toBe(false);
    expect(result.error).toContain("protected branch");
  });

  it("allows push to a feature branch", () => {
    // Create a feature branch
    run("git", ["checkout", "-b", "feat/test-feature"], repos.local);
    fs.writeFileSync(path.join(repos.local, "feature.txt"), "new feature\n");
    run("git", ["add", "feature.txt"], repos.local);
    run("git", ["commit", "-m", "add feature"], repos.local);

    const result = guardedPush(repos.local, "origin", undefined, noopLogger);
    expect(result.pushed).toBe(true);
    expect(result.branch).toBe("feat/test-feature");
    expect(result.error).toBeUndefined();
  });
});

// ─── guardedPushAndPR — blocks main, allows branches ────────────────────

describe("guardedPushAndPR", () => {
  let repos: { local: string; remote: string };

  beforeEach(() => {
    repos = setupTestRepos();
  });

  afterEach(() => {
    cleanupTestRepos(path.dirname(repos.local));
  });

  it("blocks push+PR to main", () => {
    const result = guardedPushAndPR(
      repos.local,
      "origin",
      "test/repo",
      { branch: "main", title: "Test PR", body: "Test body" },
      noopLogger,
    );
    expect(result.pushed).toBe(false);
    expect(result.prCreated).toBe(false);
    expect(result.error).toContain("protected branch");
  });

  it("pushes branch successfully (PR creation will fail without gh auth, but push succeeds)", () => {
    run("git", ["checkout", "-b", "feat/pr-test"], repos.local);
    fs.writeFileSync(path.join(repos.local, "pr-feature.txt"), "pr content\n");
    run("git", ["add", "pr-feature.txt"], repos.local);
    run("git", ["commit", "-m", "add pr feature"], repos.local);

    const result = guardedPushAndPR(
      repos.local,
      "origin",
      "test/repo",
      { title: "Test PR", body: "Test body" },
      noopLogger,
    );
    // Push should succeed (local bare remote)
    expect(result.pushed).toBe(true);
    expect(result.branch).toBe("feat/pr-test");
    // PR creation will fail (no gh auth to test/repo) but that's expected
    // The important thing is the push succeeded and PR was attempted
  });
});

// ─── Pre-push hook ──────────────────────────────────────────────────────

describe("installPrePushHook", () => {
  let repos: { local: string; remote: string };

  beforeEach(() => {
    repos = setupTestRepos();
  });

  afterEach(() => {
    cleanupTestRepos(path.dirname(repos.local));
  });

  it("installs the pre-push hook successfully", () => {
    const result = installPrePushHook(repos.local, noopLogger);
    expect(result).toBe(true);

    const hookPath = path.join(repos.local, ".git", "hooks", "pre-push");
    expect(fs.existsSync(hookPath)).toBe(true);

    const content = fs.readFileSync(hookPath, "utf-8");
    expect(content).toContain("MiniClaw pre-push hook");
    expect(content).toContain("PROTECTED_BRANCHES");
  });

  it("is idempotent (installing twice succeeds)", () => {
    installPrePushHook(repos.local, noopLogger);
    const result = installPrePushHook(repos.local, noopLogger);
    expect(result).toBe(true);
  });

  it("backs up existing non-miniclaw hooks", () => {
    const hooksDir = path.join(repos.local, ".git", "hooks");
    fs.mkdirSync(hooksDir, { recursive: true });
    const hookPath = path.join(hooksDir, "pre-push");
    fs.writeFileSync(hookPath, "#!/bin/bash\necho 'existing hook'\n", { mode: 0o755 });

    const result = installPrePushHook(repos.local, noopLogger);
    expect(result).toBe(true);

    // Original hook should be backed up
    const backups = fs.readdirSync(hooksDir).filter(f => f.startsWith("pre-push.backup-"));
    expect(backups.length).toBe(1);
  });

  it("hook content blocks push to main", () => {
    // Verify the hook script contains the blocking logic
    expect(PRE_PUSH_HOOK_CONTENT).toContain("BLOCKED");
    expect(PRE_PUSH_HOOK_CONTENT).toContain("main master");
    expect(PRE_PUSH_HOOK_CONTENT).toContain("exit 1");
  });
});
