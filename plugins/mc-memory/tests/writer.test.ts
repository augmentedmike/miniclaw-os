/**
 * tests/writer.test.ts
 *
 * Tests write() for all 3 targets:
 *   - episodic: write-then-readback, content integrity (no truncation)
 *   - memo: write-then-readback, full line content
 *   - kb: write verifies entry stored with correct content
 *   - episodicQualityGate: rejects short and no-alpha content
 *   - forceTarget: routes correctly
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { write, episodicQualityGate } from "../src/writer.js";
import type { KBStore, Embedder, KBEntry, KBEntryCreate } from "../src/types.js";

/* ── Shared mocks ──────────────────────────────────────────────────────── */

function makeMockStore(): KBStore & { entries: KBEntry[] } {
  const entries: KBEntry[] = [];
  return {
    entries,
    add: (entry: KBEntryCreate, _vector?: Float32Array) => {
      const created: KBEntry = {
        ...entry,
        id: `kb-${entries.length + 1}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        tags: entry.tags ?? [],
      };
      entries.push(created);
      return created;
    },
    update: () => ({} as KBEntry),
    get: (id: string) => entries.find((e) => e.id === id),
    list: () => entries,
    ftsSearch: () => [],
    vecSearch: () => [],
    isVecLoaded: () => false,
  };
}

const mockEmbedder: Embedder = {
  isReady: () => false,
  embed: async () => null,
  load: async () => {},
  getDims: () => 0,
};

/* ── Test fixtures ──────────────────────────────────────────────────────── */

let tmpDir: string;
let memoDir: string;
let episodicDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-memory-writer-test-"));
  memoDir = path.join(tmpDir, "memos");
  episodicDir = path.join(tmpDir, "episodic");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/* ── episodic write-then-readback ──────────────────────────────────────── */

describe("writer: episodic write-then-readback", () => {
  it("writes an episodic file and reads back the full content (no truncation)", async () => {
    const content =
      "This is an important observation about the system. The deployment process " +
      "requires three steps: build, test, and release. Never skip the test phase.";
    const store = makeMockStore();

    const result = await write(store, mockEmbedder, memoDir, episodicDir, content);

    expect(result.stored_in).toBe("episodic");
    expect(result.path).toBeTruthy();

    // File must exist
    const filePath = result.path!;
    expect(fs.existsSync(filePath)).toBe(true);

    // Read back and verify content intact
    const fileContent = fs.readFileSync(filePath, "utf-8");
    expect(fileContent).toContain(content);

    // Verify frontmatter structure
    expect(fileContent).toMatch(/^---\ndate: .+\n---/);
  });

  it("preserves 2000+ char content with no truncation", async () => {
    const longContent =
      "This is a long memory entry about a complex system interaction. " +
      "The investigation revealed that the root cause was a race condition " +
      "in the async job queue. When two workers picked up the same job, " +
      "they would both attempt to write to the same database record. " +
      "The fix was to add a distributed lock using Redis SETNX. " +
      "The lesson learned is that all job queue implementations must " +
      "include idempotency checks at the application layer. " +
      "This is especially important in high-throughput systems where " +
      "multiple workers run concurrently. ".repeat(50);

    expect(longContent.length).toBeGreaterThan(2000);
    const store = makeMockStore();

    const result = await write(store, mockEmbedder, memoDir, episodicDir, longContent, {
      forceTarget: "episodic",
      minLength: 50,
    });

    expect(result.stored_in).toBe("episodic");
    const filePath = result.path!;
    const fileContent = fs.readFileSync(filePath, "utf-8");
    // Full content must be present — not truncated
    expect(fileContent).toContain(longContent.slice(-100));
    expect(fileContent.length).toBeGreaterThan(2000);
  });

  it("filename follows YYYY-MM-DD-HHMMSS-slug.md format", async () => {
    const content = "The cache invalidation strategy was fixed by clearing on deploy.";
    const store = makeMockStore();

    const result = await write(store, mockEmbedder, memoDir, episodicDir, content);

    expect(result.stored_in).toBe("episodic");
    const fileName = path.basename(result.path!);
    expect(fileName).toMatch(/^\d{4}-\d{2}-\d{2}-\d{6}-[a-z0-9-]+\.md$/);
  });
});

/* ── memo write-then-readback ───────────────────────────────────────────── */

describe("writer: memo write-then-readback", () => {
  it("writes a memo file and reads back the full line content", async () => {
    const content = "tried fs.watch but it fails on Linux, do not retry this approach";
    const cardId = "crd_test001";
    const store = makeMockStore();

    const result = await write(store, mockEmbedder, memoDir, episodicDir, content, {
      cardId,
    });

    expect(result.stored_in).toBe("memo");
    expect(result.cardId).toBe(cardId);
    expect(result.path).toBeTruthy();

    const filePath = result.path!;
    expect(fs.existsSync(filePath)).toBe(true);

    // Read back — line must contain timestamp + content
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const lines = fileContent.split("\n").filter((l) => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(1);

    const lastLine = lines[lines.length - 1];
    // Must contain ISO timestamp prefix
    expect(lastLine).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Must contain the original content
    expect(lastLine).toContain(content);
  });

  it("appends multiple entries to the same memo file", async () => {
    const cardId = "crd_test002";
    const store = makeMockStore();

    await write(store, mockEmbedder, memoDir, episodicDir, "first note tried and failed", { cardId });
    await write(store, mockEmbedder, memoDir, episodicDir, "second note tried and failed", { cardId });

    const filePath = path.join(memoDir, `${cardId}.md`);
    const fileContent = fs.readFileSync(filePath, "utf-8");
    const lines = fileContent.split("\n").filter((l) => l.trim());
    expect(lines.length).toBe(2);
  });
});

/* ── KB write ───────────────────────────────────────────────────────────── */

describe("writer: KB write verifies entry stored with correct content", () => {
  it("routes to KB when content has strong KB signals", async () => {
    const content =
      "Error: ENOSPC when running webpack. Fix: increase inotify watchers via sysctl fs.inotify.max_user_watches=524288. Solution is permanent and should be added to system setup docs.";
    const store = makeMockStore();

    const result = await write(store, mockEmbedder, memoDir, episodicDir, content);

    expect(result.stored_in).toBe("kb");
    expect(result.id).toBeTruthy();
    expect(store.entries.length).toBe(1);

    const entry = store.entries[0];
    expect(entry.content).toBe(content);
    expect(entry.tags).toContain("auto-routed");
  });

  it("forceTarget=kb stores to KB regardless of content signals", async () => {
    const content = "The sky is blue and birds are singing outside today at noon.";
    const store = makeMockStore();

    const result = await write(store, mockEmbedder, memoDir, episodicDir, content, {
      forceTarget: "kb",
    });

    expect(result.stored_in).toBe("kb");
    expect(store.entries.length).toBe(1);
    expect(store.entries[0].content).toBe(content);
  });

  it("KB write includes card tag when cardId is provided", async () => {
    const content =
      "Solution found: the error was caused by a missing environment variable. Fix: add NODE_ENV=production to the deployment config. This resolves the issue permanently.";
    const cardId = "crd_test003";
    const store = makeMockStore();

    await write(store, mockEmbedder, memoDir, episodicDir, content, {
      cardId,
      forceTarget: "kb",
    });

    expect(store.entries[0].tags).toContain(`card:${cardId}`);
  });

  it("KB write generates title from first line of content", async () => {
    const content =
      "Root cause: The database connection pool was exhausted.\nFix: increase pool size to 50.\nThis is a permanent solution to the connection timeout errors.";
    const store = makeMockStore();

    await write(store, mockEmbedder, memoDir, episodicDir, content, { forceTarget: "kb" });

    const entry = store.entries[0];
    expect(entry.title).toBeTruthy();
    expect(entry.title.length).toBeLessThanOrEqual(83); // 80 + "..."
  });
});

/* ── episodicQualityGate ────────────────────────────────────────────────── */

describe("writer: episodicQualityGate", () => {
  it("rejects content shorter than 50 chars (default)", () => {
    const result = episodicQualityGate("too short");
    expect(result).not.toBeNull();
    expect(result).toContain("too short");
  });

  it("rejects content shorter than custom minLength", () => {
    const content = "This is valid enough for 50 chars but not for 200.";
    const result = episodicQualityGate(content, 200);
    expect(result).not.toBeNull();
    expect(result).toContain("minimum 200");
  });

  it("rejects content with no alphabetic words", () => {
    const result = episodicQualityGate("12345 67890 !@#$% @@@ 999 --- ??? 00000 ====", 10);
    expect(result).not.toBeNull();
    expect(result).toContain("no alphabetic words");
  });

  it("accepts valid multi-sentence content", () => {
    const result = episodicQualityGate(
      "This is a valid memory entry with enough content to pass the quality gate.",
    );
    expect(result).toBeNull();
  });

  it("write() returns rejected when content fails quality gate", async () => {
    const store = makeMockStore();
    const result = await write(store, mockEmbedder, memoDir, episodicDir, "short");
    expect(result.stored_in).toBe("rejected");
    expect(result.reason).toBeTruthy();
  });
});

/* ── forceTarget routing ────────────────────────────────────────────────── */

describe("writer: forceTarget override", () => {
  it("forceTarget=memo without cardId falls back to episodic", async () => {
    const content =
      "The deployment pipeline requires manual approval for production changes. Always check the diff first.";
    const store = makeMockStore();

    const result = await write(store, mockEmbedder, memoDir, episodicDir, content, {
      forceTarget: "memo",
      // no cardId
    });

    // Without cardId, memo falls back to episodic
    expect(result.stored_in).toBe("episodic");
  });

  it("forceTarget=memo with cardId stores to memo", async () => {
    const content =
      "The deployment pipeline requires manual approval for production changes. Always check the diff first.";
    const cardId = "crd_test_force";
    const store = makeMockStore();

    const result = await write(store, mockEmbedder, memoDir, episodicDir, content, {
      forceTarget: "memo",
      cardId,
    });

    expect(result.stored_in).toBe("memo");
  });

  it("forceTarget=episodic with minLength=30 accepts 30-49 char content (agent_end hook scenario)", async () => {
    // agent_end hook uses minLength: 30 — shorter than the default 50
    // This verifies that short but meaningful session summaries aren't rejected
    const content = "Fixed memory hook path issue."; // 29 chars — should be rejected
    const store = makeMockStore();
    const shortResult = await write(store, mockEmbedder, memoDir, episodicDir, content, {
      forceTarget: "episodic",
      minLength: 30,
    });
    expect(shortResult.stored_in).toBe("rejected"); // 29 chars < 30

    const borderContent = "Fixed memory hook path issue ok"; // 31 chars — should pass
    const passResult = await write(store, mockEmbedder, memoDir, episodicDir, borderContent, {
      forceTarget: "episodic",
      minLength: 30,
    });
    expect(passResult.stored_in).toBe("episodic");
  });

  it("forceTarget=episodic with source=agent_end_hook routes to episodic", async () => {
    // Covers the agent_end auto-capture path for general sessions (no cardId)
    const content =
      "Session completed: reviewed memory pipeline fixes, verified episodic write path is correct.";
    const store = makeMockStore();

    const result = await write(store, mockEmbedder, memoDir, episodicDir, content, {
      forceTarget: "episodic",
      source: "agent_end_hook",
      minLength: 30,
    });

    expect(result.stored_in).toBe("episodic");
  });
});
