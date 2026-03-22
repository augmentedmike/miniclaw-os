/**
 * mc-memory — Smoke tests
 *
 * Tests routing, recall, promotion, and write logic without requiring
 * a running plugin runtime or embedder model.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { route } from "./src/router.js";
import { episodicQualityGate } from "./src/writer.js";
import { write } from "./src/writer.js";
import { promote } from "./src/promote.js";
import type { KBStore, Embedder, KBEntry, KBEntryCreate, SearchResult } from "./src/types.js";

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

/* ── Router tests ──────────────────────────────────────────────────────── */

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

/* ── Episodic quality gate tests ───────────────────────────────────────── */

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

/* ── writeEpisodic integration tests (original) ────────────────────────── */

describe("mc-memory writeEpisodic integration", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-memory-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("rejects short garbage content via write()", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    const result = await write(makeMockStore(), mockEmbedder, memoDir, episodicDir, "junk", {});
    expect(result.stored_in).toBe("rejected");
    expect(result.reason).toBeDefined();
  });

  it("accepts valid content and writes episodic file", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    const content = "Today I configured the CI pipeline to run integration tests before deployment. This ensures broken builds never reach production.";
    const result = await write(makeMockStore(), mockEmbedder, memoDir, episodicDir, content, {});
    expect(result.stored_in).toBe("episodic");
    expect(result.path).toBeDefined();
    expect(fs.existsSync(result.path!)).toBe(true);
  });

  it("applies quality gate even when forceTarget is episodic", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    const result = await write(makeMockStore(), mockEmbedder, memoDir, episodicDir, "x", {
      forceTarget: "episodic",
    });
    expect(result.stored_in).toBe("rejected");
    expect(result.reason).toContain("too short");
  });
});

/* ── writeMemo path tests ──────────────────────────────────────────────── */

describe("mc-memory writeMemo path (write with cardId)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-memory-memo-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("routes to memo when cardId is provided and content is card-scoped", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    const content = "tried approach X, got error Y, do not retry this";
    const result = await write(makeMockStore(), mockEmbedder, memoDir, episodicDir, content, {
      cardId: "crd_memo_test1",
    });
    expect(result.stored_in).toBe("memo");
    expect(result.cardId).toBe("crd_memo_test1");
    expect(result.path).toBeDefined();
  });

  it("creates memo file with correct content on disk", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    const content = "DB migrated to v3, do not re-run the migration";
    const result = await write(makeMockStore(), mockEmbedder, memoDir, episodicDir, content, {
      cardId: "crd_memo_disk",
    });

    expect(result.stored_in).toBe("memo");
    const filePath = path.join(memoDir, "crd_memo_disk.md");
    expect(fs.existsSync(filePath)).toBe(true);

    const fileContent = fs.readFileSync(filePath, "utf-8");
    expect(fileContent).toContain(content);
    expect(fileContent.trim().length).toBeGreaterThan(0);
  });

  it("forced memo write creates memo file regardless of content signals", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    // Content that would normally route to KB, but forceTarget overrides
    const content = "Error: ENOSPC when building. Fix: increase watchers.";
    const result = await write(makeMockStore(), mockEmbedder, memoDir, episodicDir, content, {
      cardId: "crd_forced_memo",
      forceTarget: "memo",
    });
    expect(result.stored_in).toBe("memo");
    expect(result.cardId).toBe("crd_forced_memo");
  });

  it("memo write without cardId falls back to episodic", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    const content = "tried approach X, got error Y, do not retry this — but no card context so this should be long enough to pass quality gate";
    const result = await write(makeMockStore(), mockEmbedder, memoDir, episodicDir, content, {
      forceTarget: "memo",
    });
    // No cardId → should fall back to episodic
    expect(result.stored_in).toBe("episodic");
  });

  it("silent failure detection: memo write must produce non-empty readable file", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    const content = "step completed: installed dependencies, do not re-run npm install";
    const result = await write(makeMockStore(), mockEmbedder, memoDir, episodicDir, content, {
      cardId: "crd_silent_check",
    });

    expect(result.stored_in).toBe("memo");

    // THE ORIGINAL BUG: write succeeds but file is empty/missing
    const filePath = path.join(memoDir, "crd_silent_check.md");
    expect(fs.existsSync(filePath)).toBe(true);

    const fileContent = fs.readFileSync(filePath, "utf-8");
    expect(fileContent.trim().length).toBeGreaterThan(0);
    expect(fileContent).toContain(content);
  });
});

/* ── searchMemos tests ─────────────────────────────────────────────────── */

describe("mc-memory searchMemos (via recall)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-memory-recall-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // We can't import searchMemos directly (it's not exported), so we test
  // via the recall function which calls searchMemos internally.
  // We dynamically import recall to test the full pipeline.

  it("finds memo content via keyword search through recall()", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    fs.mkdirSync(memoDir, { recursive: true });

    // Write a memo directly
    const ts = new Date().toISOString();
    fs.writeFileSync(
      path.join(memoDir, "crd_search1.md"),
      `${ts} webpack configuration failed with ENOSPC error\n${ts} tried increasing inotify watchers, that fixed it\n`,
      "utf-8",
    );

    // Import recall
    const { recall } = await import("./src/recall.js");

    // Mock hybridSearch to return empty (we only want memo results)
    const mockHybridSearch = async () => [] as SearchResult[];

    const results = await recall(
      makeMockStore(),
      mockEmbedder,
      mockHybridSearch,
      memoDir,
      episodicDir,
      "webpack ENOSPC",
      { cardId: "crd_search1" },
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.source === "memo")).toBe(true);
    expect(results.some((r) => r.line?.includes("ENOSPC"))).toBe(true);
  });

  it("returns empty for non-matching query", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    fs.mkdirSync(memoDir, { recursive: true });

    fs.writeFileSync(
      path.join(memoDir, "crd_nomatch.md"),
      "2024-01-01T00:00:00.000Z some completely unrelated note\n",
      "utf-8",
    );

    const { recall } = await import("./src/recall.js");
    const mockHybridSearch = async () => [] as SearchResult[];

    const results = await recall(
      makeMockStore(),
      mockEmbedder,
      mockHybridSearch,
      memoDir,
      episodicDir,
      "kubernetes deployment helm",
      { cardId: "crd_nomatch" },
    );

    const memoResults = results.filter((r) => r.source === "memo");
    expect(memoResults.length).toBe(0);
  });
});

/* ── searchEpisodic tests ──────────────────────────────────────────────── */

describe("mc-memory searchEpisodic (via recall)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-memory-episodic-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("finds episodic content via keyword search through recall()", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    fs.mkdirSync(episodicDir, { recursive: true });

    // Write an episodic file with today's date so it's within daysBack
    const today = new Date().toISOString().slice(0, 10);
    const fileName = `${today}-120000-ci-pipeline-configuration.md`;
    fs.writeFileSync(
      path.join(episodicDir, fileName),
      `---\ndate: ${today}T12:00:00.000Z\n---\n\nConfigured the CI pipeline to run integration tests before deployment. This ensures broken builds never reach production.\n`,
      "utf-8",
    );

    const { recall } = await import("./src/recall.js");
    const mockHybridSearch = async () => [] as SearchResult[];

    const results = await recall(
      makeMockStore(),
      mockEmbedder,
      mockHybridSearch,
      memoDir,
      episodicDir,
      "pipeline integration tests deployment",
      { daysBack: 7 },
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.source === "episodic")).toBe(true);
    expect(results.some((r) => r.snippet?.includes("pipeline") || r.content?.includes("pipeline"))).toBe(true);
  });

  it("does not find episodic files older than daysBack", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    fs.mkdirSync(episodicDir, { recursive: true });

    // Write an episodic file from 30 days ago
    const oldDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    fs.writeFileSync(
      path.join(episodicDir, `${oldDate}-120000-old-memory.md`),
      `---\ndate: ${oldDate}T12:00:00.000Z\n---\n\nThis is an old memory about webpack configuration that should not appear in results.\n`,
      "utf-8",
    );

    const { recall } = await import("./src/recall.js");
    const mockHybridSearch = async () => [] as SearchResult[];

    const results = await recall(
      makeMockStore(),
      mockEmbedder,
      mockHybridSearch,
      memoDir,
      episodicDir,
      "webpack configuration",
      { daysBack: 7 },
    );

    const episodicResults = results.filter((r) => r.source === "episodic");
    expect(episodicResults.length).toBe(0);
  });
});

/* ── Write → Recall integration round-trip ─────────────────────────────── */

describe("mc-memory write → recall integration round-trip", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-memory-roundtrip-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("memo: write via memory_write then recall finds it", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    const store = makeMockStore();

    // Write via the write() function with card context
    const content = "tried using spawnSync for browser tests, process hangs on macOS, do not retry";
    const writeResult = await write(store, mockEmbedder, memoDir, episodicDir, content, {
      cardId: "crd_roundtrip_memo",
    });
    expect(writeResult.stored_in).toBe("memo");

    // Verify file exists and has content (catches silent failure)
    const filePath = path.join(memoDir, "crd_roundtrip_memo.md");
    expect(fs.existsSync(filePath)).toBe(true);
    const fileContent = fs.readFileSync(filePath, "utf-8");
    expect(fileContent).toContain("spawnSync");
    expect(fileContent.trim().length).toBeGreaterThan(0);

    // Recall should find the memo
    const { recall } = await import("./src/recall.js");
    const mockHybridSearch = async () => [] as SearchResult[];

    const recallResults = await recall(
      store,
      mockEmbedder,
      mockHybridSearch,
      memoDir,
      episodicDir,
      "spawnSync browser hangs macOS",
      { cardId: "crd_roundtrip_memo" },
    );

    expect(recallResults.length).toBeGreaterThan(0);
    expect(recallResults.some((r) => r.source === "memo")).toBe(true);
    expect(recallResults.some((r) => r.line?.includes("spawnSync"))).toBe(true);
  });

  it("episodic: write via memory_write then recall finds it", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    const store = makeMockStore();

    // Write episodic content (no card context, long enough to pass quality gate)
    const content = "Discovered that the deployment pipeline requires explicit Docker image tagging before pushing to the registry. Without tags, latest is overwritten and rollback becomes impossible.";
    const writeResult = await write(store, mockEmbedder, memoDir, episodicDir, content, {});
    expect(writeResult.stored_in).toBe("episodic");
    expect(writeResult.path).toBeDefined();
    expect(fs.existsSync(writeResult.path!)).toBe(true);

    // Recall should find it
    const { recall } = await import("./src/recall.js");
    const mockHybridSearch = async () => [] as SearchResult[];

    const recallResults = await recall(
      store,
      mockEmbedder,
      mockHybridSearch,
      memoDir,
      episodicDir,
      "Docker deployment pipeline tagging",
      { daysBack: 7 },
    );

    expect(recallResults.length).toBeGreaterThan(0);
    expect(recallResults.some((r) => r.source === "episodic")).toBe(true);
  });

  it("memo + episodic: write to both stores, recall merges results", async () => {
    const memoDir = path.join(tmpDir, "memos");
    const episodicDir = path.join(tmpDir, "episodic");
    const store = makeMockStore();

    // Write a memo
    await write(store, mockEmbedder, memoDir, episodicDir,
      "tried Redis cache for session storage, connection timeout on port 6379, do not retry without VPN",
      { cardId: "crd_merged" },
    );

    // Write an episodic entry about a related topic (force episodic to avoid KB routing)
    await write(store, mockEmbedder, memoDir, episodicDir,
      "Redis session storage requires VPN access to the internal network. The connection timeout on port 6379 is caused by the firewall blocking external connections.",
      { forceTarget: "episodic" },
    );

    const { recall } = await import("./src/recall.js");
    const mockHybridSearch = async () => [] as SearchResult[];

    const results = await recall(
      store,
      mockEmbedder,
      mockHybridSearch,
      memoDir,
      episodicDir,
      "Redis connection timeout port 6379",
      { cardId: "crd_merged", daysBack: 7 },
    );

    expect(results.length).toBeGreaterThan(0);
    const sources = new Set(results.map((r) => r.source));
    expect(sources.has("memo")).toBe(true);
    expect(sources.has("episodic")).toBe(true);
  });
});

/* ── Promote tests ─────────────────────────────────────────────────────── */

describe("mc-memory promote()", () => {
  it("promotes memo content to KB with correct metadata", async () => {
    const store = makeMockStore();
    const result = await promote(store, mockEmbedder, {
      content: "Error: ENOSPC when running webpack. Fix: increase inotify watchers via sysctl. This is a permanent solution.",
      source_type: "memo",
      source_ref: "crd_promote1",
    });

    expect(result.kb_id).toBeDefined();
    expect(result.title).toBeDefined();
    expect(result.title.length).toBeGreaterThan(0);
    expect(result.source_type).toBe("memo");
    expect(result.source_ref).toBe("crd_promote1");

    // Verify the KB entry was created in the store
    const entry = store.entries.find((e) => e.id === result.kb_id);
    expect(entry).toBeDefined();
    expect(entry!.tags).toContain("promoted");
    expect(entry!.tags).toContain("from-memo");
    expect(entry!.content).toContain("ENOSPC");
  });

  it("promotes episodic content to KB with correct metadata", async () => {
    const store = makeMockStore();
    const result = await promote(store, mockEmbedder, {
      content: "How to reset the development database: run npm run db:reset then seed with npm run db:seed. This guide is for new developers joining the team.",
      source_type: "episodic",
      source_ref: "2024-01-15",
    });

    expect(result.kb_id).toBeDefined();
    expect(result.source_type).toBe("episodic");
    expect(result.source_ref).toBe("2024-01-15");

    const entry = store.entries.find((e) => e.id === result.kb_id);
    expect(entry).toBeDefined();
    expect(entry!.tags).toContain("promoted");
    expect(entry!.tags).toContain("from-episodic");
  });

  it("respects title and type overrides", async () => {
    const store = makeMockStore();
    const result = await promote(store, mockEmbedder, {
      content: "Some content that would auto-detect as something else.",
      title: "Custom Title Override",
      type: "workflow",
      source_type: "memo",
      source_ref: "crd_override",
      tags: ["custom-tag"],
    });

    expect(result.title).toBe("Custom Title Override");
    expect(result.type).toBe("workflow");

    const entry = store.entries.find((e) => e.id === result.kb_id);
    expect(entry).toBeDefined();
    expect(entry!.title).toBe("Custom Title Override");
    expect(entry!.type).toBe("workflow");
    expect(entry!.tags).toContain("custom-tag");
    expect(entry!.tags).toContain("promoted");
  });
});
