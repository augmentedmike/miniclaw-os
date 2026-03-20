import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KBStore } from "./store.js";
import type { KBEntryCreate } from "./entry.js";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "mc-kb-test-"));
}

function sampleEntry(overrides: Partial<KBEntryCreate> = {}): KBEntryCreate {
  return {
    type: "fact",
    title: "Test Entry",
    content: "This is test content about knowledge base operations.",
    tags: ["test", "sample"],
    ...overrides,
  };
}

describe("KBStore", () => {
  let dir: string;
  let store: KBStore;

  beforeEach(() => {
    dir = makeTmpDir();
    store = new KBStore(dir);
  });

  afterEach(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });

  // ── CRUD ──────────────────────────────────────────────────────────

  describe("CRUD", () => {
    it("add creates and returns an entry with generated ID", () => {
      const entry = store.add(sampleEntry());
      expect(entry.id).toMatch(/^kb_[0-9a-f]{8}$/);
      expect(entry.title).toBe("Test Entry");
      expect(entry.tags).toEqual(["test", "sample"]);
      expect(entry.created_at).toBeTruthy();
      expect(entry.updated_at).toBeTruthy();
    });

    it("add uses provided ID when given", () => {
      const entry = store.add(sampleEntry({ id: "kb_custom01" } as any));
      expect(entry.id).toBe("kb_custom01");
    });

    it("get retrieves an existing entry by ID", () => {
      const created = store.add(sampleEntry());
      const fetched = store.get(created.id);
      expect(fetched).toBeDefined();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.title).toBe(created.title);
      expect(fetched!.content).toBe(created.content);
      expect(fetched!.tags).toEqual(created.tags);
    });

    it("get returns undefined for missing ID", () => {
      const result = store.get("kb_nonexist");
      expect(result).toBeUndefined();
    });

    it("update modifies an existing entry", () => {
      const created = store.add(
        sampleEntry({ created_at: "2025-01-01T00:00:00.000Z", updated_at: "2025-01-01T00:00:00.000Z" }),
      );
      const updated = store.update(created.id, {
        title: "Updated Title",
        content: "Updated content.",
      });
      expect(updated.title).toBe("Updated Title");
      expect(updated.content).toBe("Updated content.");
      expect(updated.tags).toEqual(created.tags); // unchanged
      // updated_at should be newer than the fixed old timestamp
      expect(updated.updated_at).not.toBe("2025-01-01T00:00:00.000Z");
    });

    it("update throws for non-existent entry", () => {
      expect(() => store.update("kb_nonexist", { title: "nope" })).toThrow(
        "Entry not found",
      );
    });

    it("remove deletes an entry", () => {
      const created = store.add(sampleEntry());
      store.remove(created.id);
      expect(store.get(created.id)).toBeUndefined();
    });

    it("remove is idempotent for missing ID", () => {
      // Should not throw
      store.remove("kb_nonexist");
    });
  });

  // ── List / Filter ─────────────────────────────────────────────────

  describe("list", () => {
    beforeEach(() => {
      store.add(sampleEntry({ type: "fact", title: "Fact A", tags: ["alpha"] }));
      store.add(sampleEntry({ type: "guide", title: "Guide B", tags: ["beta"] }));
      store.add(sampleEntry({ type: "fact", title: "Fact C", tags: ["alpha", "beta"] }));
      store.add(sampleEntry({ type: "error", title: "Error D", tags: ["gamma"] }));
    });

    it("returns all entries when no filter", () => {
      const all = store.list();
      expect(all.length).toBe(4);
    });

    it("filters by type", () => {
      const facts = store.list({ type: "fact" });
      expect(facts.length).toBe(2);
      expect(facts.every((e) => e.type === "fact")).toBe(true);
    });

    it("filters by tag", () => {
      const alphas = store.list({ tag: "alpha" });
      expect(alphas.length).toBe(2);
      expect(alphas.every((e) => e.tags.includes("alpha"))).toBe(true);
    });

    it("filters by type and tag together", () => {
      const results = store.list({ type: "fact", tag: "beta" });
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("Fact C");
    });

    it("respects limit", () => {
      const limited = store.list({ limit: 2 });
      expect(limited.length).toBe(2);
    });
  });

  // ── Stats ─────────────────────────────────────────────────────────

  describe("stats", () => {
    it("returns correct counts by type", () => {
      store.add(sampleEntry({ type: "fact" }));
      store.add(sampleEntry({ type: "fact" }));
      store.add(sampleEntry({ type: "guide" }));

      const s = store.stats();
      expect(s.total).toBe(3);
      expect(s.fact).toBe(2);
      expect(s.guide).toBe(1);
    });

    it("returns zero total for empty store", () => {
      const s = store.stats();
      expect(s.total).toBe(0);
    });
  });

  // ── FTS Search ────────────────────────────────────────────────────

  describe("ftsSearch", () => {
    beforeEach(() => {
      store.add(
        sampleEntry({
          title: "Docker Setup Guide",
          content: "How to install and configure Docker containers for deployment.",
        }),
      );
      store.add(
        sampleEntry({
          title: "PostgreSQL Backup",
          content: "Running pg_dump to create database backups on a schedule.",
        }),
      );
      store.add(
        sampleEntry({
          title: "Kubernetes Orchestration",
          content: "Deploy containers with Kubernetes and manage Docker images.",
        }),
      );
    });

    it("finds entries by single keyword", () => {
      const results = store.ftsSearch("Docker");
      expect(results.length).toBeGreaterThan(0);
      // All results should have an id and rank
      for (const r of results) {
        expect(r.id).toMatch(/^kb_/);
        expect(typeof r.rank).toBe("number");
      }
    });

    it("finds entries matching multiple keywords (AND)", () => {
      const results = store.ftsSearch("Docker containers");
      expect(results.length).toBeGreaterThan(0);
    });

    it("falls back to OR when AND returns nothing", () => {
      // "PostgreSQL" + "containers" won't both appear in any single entry
      // AND fails, OR should find entries with either word
      const results = store.ftsSearch("PostgreSQL containers");
      expect(results.length).toBeGreaterThan(0);
    });

    it("returns empty array for empty query", () => {
      const results = store.ftsSearch("");
      expect(results).toEqual([]);
    });

    it("returns empty array for whitespace-only query", () => {
      const results = store.ftsSearch("   ");
      expect(results).toEqual([]);
    });

    it("handles special characters gracefully", () => {
      // Should not throw, may return empty
      const results = store.ftsSearch("docker's [v2.0] {config}");
      // Just verify no crash — results depend on tokenizer handling
      expect(Array.isArray(results)).toBe(true);
    });

    it("porter stemming matches word variants", () => {
      // 'running' should match 'Running' in the pg_dump entry via porter stemmer
      const results = store.ftsSearch("running");
      expect(results.length).toBeGreaterThan(0);
    });

    it("respects limit parameter", () => {
      const results = store.ftsSearch("Docker", 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it("ranks results by BM25 (negative, lower = better)", () => {
      const results = store.ftsSearch("Docker");
      if (results.length >= 2) {
        // Results should be ordered by rank ascending (more negative = better match)
        expect(results[0].rank).toBeLessThanOrEqual(results[1].rank);
      }
    });
  });
});
