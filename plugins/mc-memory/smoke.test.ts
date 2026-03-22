/**
 * mc-memory — Smoke tests
 *
 * Tests routing, recall, and promotion logic without requiring
 * a running plugin runtime or embedder model.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { route } from "./src/router.js";
import { episodicQualityGate } from "./src/writer.js";
import { write } from "./src/writer.js";
import type { KBStore, Embedder, KBEntry, KBEntryCreate } from "./src/types.js";

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

describe("mc-memory episodic quality gate", () => {
  it("rejects content shorter than 50 chars", () => {
    const reason = episodicQualityGate("short");
    expect(reason).not.toBeNull();
    expect(reason).toContain("too short");
  });

  it("rejects content with no alphabetic words", () => {
    const reason = episodicQualityGate("1234567890 !@#$%^&*() 1234567890 !@#$%^&*() 1234567890");
    expect(reason).not.toBeNull();
    expect(reason).toContain("no alphabetic words");
  });

  it("accepts valid multi-sentence content", () => {
    const reason = episodicQualityGate(
      "Today I learned that the deployment pipeline requires three stages. Each stage validates the build artifacts before promotion.",
    );
    expect(reason).toBeNull();
  });

  it("respects custom minLength override", () => {
    const reason = episodicQualityGate("This is short but valid text", 10);
    expect(reason).toBeNull();
  });
});

describe("mc-memory writeEpisodic integration", () => {
  let tmpDir: string;
  const mockStore: KBStore = {
    add: (entry: KBEntryCreate) => ({ ...entry, id: "test-id", created_at: "", updated_at: "", tags: entry.tags ?? [] }) as KBEntry,
    update: () => ({} as KBEntry),
    get: () => undefined,
    list: () => [],
    ftsSearch: () => [],
    vecSearch: () => [],
    isVecLoaded: () => false,
  };
  const mockEmbedder: Embedder = {
    isReady: () => false,
    embed: async () => null,
    load: async () => {},
    getDims: () => 0,
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-memory-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("rejects short garbage content via write()", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    const result = await write(mockStore, mockEmbedder, memoDir, episodicDir, "junk", {});
    expect(result.stored_in).toBe("rejected");
    expect(result.reason).toBeDefined();
  });

  it("accepts valid content and writes episodic file", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    const content = "Today I configured the CI pipeline to run integration tests before deployment. This ensures broken builds never reach production.";
    const result = await write(mockStore, mockEmbedder, memoDir, episodicDir, content, {});
    expect(result.stored_in).toBe("episodic");
    expect(result.path).toBeDefined();
    expect(fs.existsSync(result.path!)).toBe(true);
  });

  it("applies quality gate even when forceTarget is episodic", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    const result = await write(mockStore, mockEmbedder, memoDir, episodicDir, "x", {
      forceTarget: "episodic",
    });
    expect(result.stored_in).toBe("rejected");
    expect(result.reason).toContain("too short");
  });
});
