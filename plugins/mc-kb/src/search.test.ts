import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KBStore } from "./store.js";
import { hybridSearch } from "./search.js";
import type { IEmbedder } from "./types.js";
import type { KBEntryCreate } from "./entry.js";

/** Mock embedder that always returns null vectors (FTS-only path) */
class NullEmbedder implements IEmbedder {
  isReady(): boolean {
    return false;
  }
  getDims(): number {
    return 768;
  }
  async load(): Promise<void> {}
  async embed(_text: string): Promise<Float32Array | null> {
    return null;
  }
}

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "mc-kb-search-test-"));
}

function sampleEntry(overrides: Partial<KBEntryCreate> = {}): KBEntryCreate {
  return {
    type: "fact",
    title: "Test Entry",
    content: "Generic test content.",
    tags: [],
    ...overrides,
  };
}

describe("hybridSearch", () => {
  let dir: string;
  let store: KBStore;
  let embedder: NullEmbedder;

  beforeEach(() => {
    dir = makeTmpDir();
    store = new KBStore(dir);
    embedder = new NullEmbedder();

    // Seed data
    store.add(
      sampleEntry({
        type: "guide",
        title: "Docker Setup Guide",
        content: "Install Docker on macOS using Homebrew. Configure daemon settings.",
        tags: ["docker", "setup"],
      }),
    );
    store.add(
      sampleEntry({
        type: "fact",
        title: "PostgreSQL Tuning",
        content: "Optimize PostgreSQL with shared_buffers and work_mem settings.",
        tags: ["postgres", "performance"],
      }),
    );
    store.add(
      sampleEntry({
        type: "error",
        title: "Docker Build Failure",
        content: "Docker build fails when COPY references files outside context.",
        tags: ["docker", "error"],
      }),
    );
    store.add(
      sampleEntry({
        type: "workflow",
        title: "CI Pipeline Setup",
        content: "Configure GitHub Actions with Docker containers for testing.",
        tags: ["ci", "docker"],
      }),
    );
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  // ── FTS-only search (null embedder) ───────────────────────────────

  it("returns results via FTS when embedder returns null vectors", async () => {
    const results = await hybridSearch(store, embedder, "Docker");
    expect(results.length).toBeGreaterThan(0);
    // All results should have entry, score
    for (const r of results) {
      expect(r.entry).toBeDefined();
      expect(r.entry.id).toMatch(/^kb_/);
      expect(typeof r.score).toBe("number");
      expect(r.score).toBeGreaterThan(0);
    }
  });

  it("returns results ranked by RRF score (higher = better)", async () => {
    const results = await hybridSearch(store, embedder, "Docker");
    if (results.length >= 2) {
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
    }
  });

  // ── Type / tag filtering ──────────────────────────────────────────

  it("filters results by type", async () => {
    const results = await hybridSearch(store, embedder, "Docker", {
      type: "guide",
    });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.entry.type).toBe("guide");
    }
  });

  it("filters results by tag", async () => {
    const results = await hybridSearch(store, embedder, "Docker", {
      tag: "error",
    });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.entry.tags).toContain("error");
    }
  });

  it("filters by both type and tag", async () => {
    const results = await hybridSearch(store, embedder, "Docker", {
      type: "error",
      tag: "docker",
    });
    expect(results.length).toBe(1);
    expect(results[0].entry.title).toBe("Docker Build Failure");
  });

  // ── n limit ───────────────────────────────────────────────────────

  it("respects n limit", async () => {
    const results = await hybridSearch(store, embedder, "Docker", { n: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  // ── Empty query ───────────────────────────────────────────────────

  it("returns fallback results for empty query (substring matches all)", async () => {
    // Empty string query: FTS returns nothing, substring fallback matches everything
    // since every string .includes("")
    const results = await hybridSearch(store, embedder, "");
    // All results come from substring fallback with score 0.1
    for (const r of results) {
      expect(r.score).toBe(0.1);
    }
  });

  // ── Substring fallback ────────────────────────────────────────────

  it("falls back to substring match when FTS returns nothing", async () => {
    // Add an entry with a unique string that FTS tokenizer may not match well
    store.add(
      sampleEntry({
        title: "XyZ123 Special Token",
        content: "This entry contains the unique marker QwErTy99 for testing substring fallback.",
        tags: ["fallback"],
      }),
    );

    // Search for the exact unique marker — FTS porter tokenizer + multi-strategy
    // may not find it, triggering substring fallback
    const results = await hybridSearch(store, embedder, "QwErTy99");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].entry.content).toContain("QwErTy99");
  });

  it("substring fallback respects type filter", async () => {
    store.add(
      sampleEntry({
        type: "lesson",
        title: "Zzz Unique Lesson",
        content: "UniqueMarker777 lesson content.",
        tags: [],
      }),
    );
    store.add(
      sampleEntry({
        type: "fact",
        title: "Zzz Unique Fact",
        content: "UniqueMarker777 fact content.",
        tags: [],
      }),
    );

    const results = await hybridSearch(store, embedder, "UniqueMarker777", {
      type: "lesson",
    });
    // Should find only the lesson type
    for (const r of results) {
      expect(r.entry.type).toBe("lesson");
    }
  });
});
