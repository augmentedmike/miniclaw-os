/**
 * tests/recall.test.ts
 *
 * Tests recall() across all stores:
 *   - recall finds episodic content by keyword
 *   - recall finds memo content by keyword
 *   - recall finds KB content via hybridSearch mock
 *   - recall on empty dirs returns empty array without error
 *   - cross-store merge returns results from all sources
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { recall } from "../src/recall.js";
import { write } from "../src/writer.js";
import type { KBStore, Embedder, KBEntry, KBEntryCreate, SearchResult } from "../src/types.js";

/* ── Mocks ──────────────────────────────────────────────────────────────── */

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

// hybridSearch mock that returns empty (tests episodic/memo paths in isolation)
const emptyHybridSearch = async () => [] as SearchResult[];

// hybridSearch mock that returns a KB result
function makeKbHybridSearch(entry: KBEntry) {
  return async (): Promise<SearchResult[]> => [
    { entry, score: 0.025, vecDistance: 0.3, ftsRank: -1.5 },
  ];
}

/* ── Test fixtures ──────────────────────────────────────────────────────── */

let tmpDir: string;
let memoDir: string;
let episodicDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-memory-recall-test-"));
  memoDir = path.join(tmpDir, "memos");
  episodicDir = path.join(tmpDir, "episodic");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/* ── Episodic recall ────────────────────────────────────────────────────── */

describe("recall: episodic store", () => {
  it("finds episodic content via keyword search", async () => {
    const store = makeMockStore();
    const content =
      "The inotify watchers limit was hit during webpack compilation. " +
      "Increasing fs.inotify.max_user_watches resolved the build failures permanently.";

    await write(store, mockEmbedder, memoDir, episodicDir, content);

    const results = await recall(store, mockEmbedder, emptyHybridSearch, memoDir, episodicDir, "inotify watchers", {
      daysBack: 30,
    });

    expect(results.length).toBeGreaterThan(0);
    const episodicResult = results.find((r) => r.source === "episodic");
    expect(episodicResult).toBeTruthy();
    expect(episodicResult!.content).toContain("inotify");
  });

  it("returns source=episodic for episodic results", async () => {
    const store = makeMockStore();
    const content =
      "The Redis cache TTL was set too low causing excessive database reads. " +
      "Setting the TTL to 3600 seconds resolved the performance problem.";

    await write(store, mockEmbedder, memoDir, episodicDir, content);

    const results = await recall(store, mockEmbedder, emptyHybridSearch, memoDir, episodicDir, "Redis cache TTL", {
      daysBack: 30,
    });

    const episodicResult = results.find((r) => r.source === "episodic");
    expect(episodicResult).toBeTruthy();
    expect(episodicResult!.source).toBe("episodic");
  });
});

/* ── Memo recall ────────────────────────────────────────────────────────── */

describe("recall: memo store", () => {
  it("finds memo content via keyword search", async () => {
    const cardId = "crd_recall_test";
    const store = makeMockStore();
    const content = "tried using the legacy API endpoint, it failed with 401, do not retry";

    await write(store, mockEmbedder, memoDir, episodicDir, content, { cardId });

    const results = await recall(store, mockEmbedder, emptyHybridSearch, memoDir, episodicDir, "legacy API endpoint");

    expect(results.length).toBeGreaterThan(0);
    const memoResult = results.find((r) => r.source === "memo");
    expect(memoResult).toBeTruthy();
    expect(memoResult!.source).toBe("memo");
    expect(memoResult!.line).toContain("legacy API");
  });

  it("returns source=memo for memo results", async () => {
    const cardId = "crd_recall_test2";
    const store = makeMockStore();
    const content = "session workaround: unset TURBOPACK before running dev server";

    await write(store, mockEmbedder, memoDir, episodicDir, content, { cardId });

    const results = await recall(store, mockEmbedder, emptyHybridSearch, memoDir, episodicDir, "workaround TURBOPACK");

    const memoResult = results.find((r) => r.source === "memo");
    expect(memoResult).toBeTruthy();
    expect(memoResult!.source).toBe("memo");
  });
});

/* ── KB recall ──────────────────────────────────────────────────────────── */

describe("recall: KB store", () => {
  it("returns KB results with source=kb", async () => {
    const store = makeMockStore();
    const entry = store.add({
      type: "error",
      title: "ENOSPC webpack build error",
      content: "Error ENOSPC during webpack build. Fix: increase inotify watchers.",
      tags: ["auto-routed"],
    });

    const kbSearch = makeKbHybridSearch(entry);
    const results = await recall(store, mockEmbedder, kbSearch, memoDir, episodicDir, "ENOSPC webpack");

    expect(results.length).toBeGreaterThan(0);
    const kbResult = results.find((r) => r.source === "kb");
    expect(kbResult).toBeTruthy();
    expect(kbResult!.source).toBe("kb");
    expect(kbResult!.entry?.title).toContain("ENOSPC");
  });
});

/* ── Empty state ────────────────────────────────────────────────────────── */

describe("recall: empty state returns empty array without error", () => {
  it("returns empty array when memo and episodic dirs do not exist", async () => {
    const store = makeMockStore();
    // Dirs don't exist — episodicDir and memoDir are just paths, never created

    const results = await recall(
      store,
      mockEmbedder,
      emptyHybridSearch,
      path.join(tmpDir, "nonexistent-memos"),
      path.join(tmpDir, "nonexistent-episodic"),
      "anything at all",
      { daysBack: 30 },
    );

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it("returns empty array when dirs exist but are empty", async () => {
    const store = makeMockStore();
    fs.mkdirSync(memoDir, { recursive: true });
    fs.mkdirSync(episodicDir, { recursive: true });

    const results = await recall(
      store,
      mockEmbedder,
      emptyHybridSearch,
      memoDir,
      episodicDir,
      "anything at all",
      { daysBack: 30 },
    );

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it("does not throw when called with empty query", async () => {
    const store = makeMockStore();

    await expect(
      recall(store, mockEmbedder, emptyHybridSearch, memoDir, episodicDir, "", { daysBack: 30 }),
    ).resolves.not.toThrow();
  });
});

/* ── Cross-store merge ──────────────────────────────────────────────────── */

describe("recall: cross-store merge", () => {
  it("returns results from episodic and memo when both match", async () => {
    const cardId = "crd_crossstore";
    const store = makeMockStore();

    // Write to episodic (no cardId, no signals)
    const episodicContent =
      "The authentication service returned unexpected token format. " +
      "Investigation revealed a version mismatch between client and server JWT libraries.";
    await write(store, mockEmbedder, memoDir, episodicDir, episodicContent);

    // Write to memo (with cardId, no signals → routes to memo)
    const memoContent = "session: authentication token format issue, this run failed, tried JWT v2";
    await write(store, mockEmbedder, memoDir, episodicDir, memoContent, { cardId });

    const results = await recall(
      store,
      mockEmbedder,
      emptyHybridSearch,
      memoDir,
      episodicDir,
      "authentication token",
      { daysBack: 30, n: 20 },
    );

    const sources = results.map((r) => r.source);
    expect(sources).toContain("episodic");
    expect(sources).toContain("memo");
  });
});
