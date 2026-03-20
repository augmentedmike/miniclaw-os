import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
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

/**
 * Mock embedder that returns deterministic Float32Array vectors based on
 * a simple hash of the input text. This exercises the vector search code path
 * without requiring a real embedding model.
 */
class VecMockEmbedder implements IEmbedder {
  private dims = 768;
  isReady(): boolean {
    return true;
  }
  getDims(): number {
    return this.dims;
  }
  async load(): Promise<void> {}
  async embed(text: string): Promise<Float32Array | null> {
    return VecMockEmbedder.deterministicVector(text, this.dims);
  }

  /** Generate a deterministic unit vector from text via simple hash */
  static deterministicVector(text: string, dims = 768): Float32Array {
    const vec = new Float32Array(dims);
    // Simple hash-based seeding: each char shifts the seed
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed = ((seed << 5) - seed + text.charCodeAt(i)) | 0;
    }
    // Fill vector with pseudo-random values derived from the seed
    for (let i = 0; i < dims; i++) {
      seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
      vec[i] = (seed / 0x7fffffff) * 2 - 1; // range [-1, 1]
    }
    // Normalize to unit vector (cosine similarity requires it)
    let norm = 0;
    for (let i = 0; i < dims; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < dims; i++) vec[i] /= norm;
    return vec;
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

  // ── Vector search path (mocked vec) ────────────────────────────────

  describe("with vector search enabled (mocked)", () => {
    let vecEmbedder: VecMockEmbedder;
    let vecDir: string;
    let vecStore: KBStore;

    // Track entry IDs for vec result mocking
    let dockerGuideId: string;
    let postgresId: string;
    let dockerErrorId: string;
    let ciPipelineId: string;

    beforeEach(() => {
      vecDir = makeTmpDir();
      vecStore = new KBStore(vecDir);
      vecEmbedder = new VecMockEmbedder();

      // Seed same data, capturing IDs
      dockerGuideId = vecStore.add(
        sampleEntry({
          type: "guide",
          title: "Docker Setup Guide",
          content: "Install Docker on macOS using Homebrew. Configure daemon settings.",
          tags: ["docker", "setup"],
        }),
      ).id;
      postgresId = vecStore.add(
        sampleEntry({
          type: "fact",
          title: "PostgreSQL Tuning",
          content: "Optimize PostgreSQL with shared_buffers and work_mem settings.",
          tags: ["postgres", "performance"],
        }),
      ).id;
      dockerErrorId = vecStore.add(
        sampleEntry({
          type: "error",
          title: "Docker Build Failure",
          content: "Docker build fails when COPY references files outside context.",
          tags: ["docker", "error"],
        }),
      ).id;
      ciPipelineId = vecStore.add(
        sampleEntry({
          type: "workflow",
          title: "CI Pipeline Setup",
          content: "Configure GitHub Actions with Docker containers for testing.",
          tags: ["ci", "docker"],
        }),
      ).id;

      // Mock vec availability: stub isVecLoaded → true and vecSearch → results
      vi.spyOn(vecStore, "isVecLoaded").mockReturnValue(true);
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vecStore.close();
      rmSync(vecDir, { recursive: true, force: true });
    });

    it("returns results with vecDistance when embedder provides vectors", async () => {
      // Mock vecSearch to return entries with distances
      vi.spyOn(vecStore, "vecSearch").mockReturnValue([
        { id: dockerGuideId, distance: 0.2 },
        { id: dockerErrorId, distance: 0.4 },
        { id: ciPipelineId, distance: 0.6 },
      ]);

      const results = await hybridSearch(vecStore, vecEmbedder, "Docker");
      expect(results.length).toBeGreaterThan(0);

      // At least one result should have vecDistance set
      const withVecDist = results.filter((r) => r.vecDistance !== undefined);
      expect(withVecDist.length).toBeGreaterThan(0);

      for (const r of withVecDist) {
        expect(typeof r.vecDistance).toBe("number");
        expect(r.vecDistance).toBeGreaterThanOrEqual(0);
      }
    });

    it("RRF merge produces higher scores for dual-signal matches", async () => {
      // Docker Guide matches both FTS ("Docker") and vec (low distance)
      // PostgreSQL only matches vec (not FTS for "Docker" query)
      vi.spyOn(vecStore, "vecSearch").mockReturnValue([
        { id: dockerGuideId, distance: 0.1 },   // matches both FTS + vec
        { id: postgresId, distance: 0.3 },       // vec-only (FTS won't match "Docker")
      ]);

      const results = await hybridSearch(vecStore, vecEmbedder, "Docker");

      // Find the Docker Guide and PostgreSQL entries
      const dockerResult = results.find((r) => r.entry.id === dockerGuideId);
      const pgResult = results.find((r) => r.entry.id === postgresId);

      expect(dockerResult).toBeDefined();
      // Docker Guide has both FTS rank + vec rank → higher RRF score
      // PostgreSQL has only vec rank → lower RRF score
      if (dockerResult && pgResult) {
        expect(dockerResult.score).toBeGreaterThan(pgResult.score);
      }
    });

    it("vecThreshold filters out distant vectors", async () => {
      // Return vec results with varying distances
      vi.spyOn(vecStore, "vecSearch").mockReturnValue([
        { id: dockerGuideId, distance: 0.3 },
        { id: postgresId, distance: 1.8 },       // above threshold
        { id: dockerErrorId, distance: 1.9 },     // above threshold
      ]);

      // Use a strict threshold that excludes distant entries
      const results = await hybridSearch(vecStore, vecEmbedder, "Docker", {
        vecThreshold: 0.5,
      });

      // PostgreSQL (distance 1.8) should NOT have a vecDistance because it was filtered
      const pgResult = results.find((r) => r.entry.id === postgresId);
      // If it appears at all, it's from FTS only — vecDistance should be undefined
      // (PostgreSQL won't match FTS for "Docker" query, so it shouldn't appear)
      if (pgResult) {
        expect(pgResult.vecDistance).toBeUndefined();
      }

      // Docker Guide (distance 0.3) should have vecDistance
      const dockerResult = results.find((r) => r.entry.id === dockerGuideId);
      if (dockerResult) {
        expect(dockerResult.vecDistance).toBe(0.3);
      }
    });

    it("vec-only results appear when FTS misses", async () => {
      // Add an entry with non-FTS-tokenizable content
      const weirdId = vecStore.add(
        sampleEntry({
          type: "fact",
          title: "αβγ δεζ ηθι",
          content: "κλμ νξο πρσ τυφ χψω",
          tags: ["greek"],
        }),
      ).id;

      // FTS won't match this query, but vec will
      vi.spyOn(vecStore, "vecSearch").mockReturnValue([
        { id: weirdId, distance: 0.15 },
      ]);

      const results = await hybridSearch(vecStore, vecEmbedder, "αβγ δεζ");
      // The entry should appear via vec path even though FTS can't tokenize Greek
      const found = results.find((r) => r.entry.id === weirdId);
      expect(found).toBeDefined();
      expect(found!.vecDistance).toBe(0.15);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("handles unicode queries", async () => {
      store.add(
        sampleEntry({
          title: "日本語ガイド",
          content: "Dockerの使い方についての日本語ドキュメント。",
          tags: ["japanese"],
        }),
      );

      // Should not throw, may or may not find results depending on tokenizer
      const results = await hybridSearch(store, embedder, "日本語");
      // Substring fallback should find it
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.title).toBe("日本語ガイド");
    });

    it("handles queries with special FTS characters", async () => {
      // Characters like quotes, parens, brackets are stripped by ftsSearch
      const results = await hybridSearch(store, embedder, '"Docker" (setup) [guide]');
      // Should not throw and should find Docker results
      expect(results.length).toBeGreaterThan(0);
    });

    it("handles very long content entries", async () => {
      const longContent = "Docker ".repeat(5000) + "container orchestration is powerful.";
      store.add(
        sampleEntry({
          title: "Long Content Entry",
          content: longContent,
          tags: ["long"],
        }),
      );

      const results = await hybridSearch(store, embedder, "Docker");
      expect(results.length).toBeGreaterThan(0);
      // The long entry should be findable
      const longResult = results.find((r) => r.entry.title === "Long Content Entry");
      expect(longResult).toBeDefined();
    });

    it("handles queries with only special characters gracefully", async () => {
      // All special chars get stripped, leaving empty tokens → falls back to substring
      const results = await hybridSearch(store, embedder, "!@#$%^&*()");
      // Should not throw — returns fallback results or empty
      expect(Array.isArray(results)).toBe(true);
    });

    it("handles emoji in content and queries", async () => {
      store.add(
        sampleEntry({
          title: "Emoji Guide 🚀",
          content: "Deploy with confidence 🐳 using Docker containers.",
          tags: ["emoji"],
        }),
      );

      const results = await hybridSearch(store, embedder, "🐳");
      // Substring fallback should find it
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.content).toContain("🐳");
    });
  });

  // ── Conditional vec integration (real sqlite-vec) ───────────────────

  describe("real sqlite-vec integration", () => {
    it.skipIf(!(() => {
      try {
        const d = makeTmpDir();
        const s = new KBStore(d);
        const loaded = s.isVecLoaded();
        s.close();
        rmSync(d, { recursive: true, force: true });
        return loaded;
      } catch { return false; }
    })())("end-to-end vec search with real sqlite-vec", async () => {
      // This test only runs when sqlite-vec is actually available
      const d = makeTmpDir();
      const s = new KBStore(d);
      const vecEmb = new VecMockEmbedder();

      try {
        const vec1 = await vecEmb.embed("Docker setup");
        const vec2 = await vecEmb.embed("PostgreSQL tuning");

        s.add(
          sampleEntry({
            title: "Docker Real Vec",
            content: "Docker setup with real vector indexing.",
            tags: ["docker"],
          }),
          vec1!,
        );
        s.add(
          sampleEntry({
            title: "PG Real Vec",
            content: "PostgreSQL tuning with real vector indexing.",
            tags: ["postgres"],
          }),
          vec2!,
        );

        const results = await hybridSearch(s, vecEmb, "Docker setup");
        expect(results.length).toBeGreaterThan(0);
      } finally {
        s.close();
        rmSync(d, { recursive: true, force: true });
      }
    });
  });
});
