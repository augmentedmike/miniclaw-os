/**
 * tests/promote.test.ts
 *
 * Tests promote() and annotateMemo():
 *   - promote creates KB entry with correct tags (promoted, from-memo/from-episodic)
 *   - annotateMemo modifies source memo file
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { promote, annotateMemo } from "../src/promote.js";
import type { KBStore, Embedder, KBEntry, KBEntryCreate } from "../src/types.js";

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

/* ── Test fixtures ──────────────────────────────────────────────────────── */

let tmpDir: string;
let memoDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-memory-promote-test-"));
  memoDir = path.join(tmpDir, "memos");
  fs.mkdirSync(memoDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/* ── promote() — episodic source ─────────────────────────────────────────── */

describe("promote: episodic → KB", () => {
  it("creates KB entry with promoted and from-episodic tags", async () => {
    const store = makeMockStore();
    const content =
      "The connection pool exhaustion was caused by missing connection release in error paths. " +
      "Fix: add finally block to always release connections. This is a permanent solution.";

    const result = await promote(store, mockEmbedder, {
      content,
      source_type: "episodic",
      source_ref: "2026-03-22",
    });

    expect(result.kb_id).toBeTruthy();
    expect(result.source_type).toBe("episodic");

    const entry = store.entries[0];
    expect(entry.tags).toContain("promoted");
    expect(entry.tags).toContain("from-episodic");
  });

  it("uses provided title override", async () => {
    const store = makeMockStore();
    const content =
      "Lesson learned: always use explicit connection timeouts to prevent pool exhaustion in production systems.";

    const result = await promote(store, mockEmbedder, {
      content,
      title: "Connection pool management lesson",
      source_type: "episodic",
      source_ref: "2026-03-22",
    });

    expect(result.title).toBe("Connection pool management lesson");
    expect(store.entries[0].title).toBe("Connection pool management lesson");
  });

  it("uses provided type override", async () => {
    const store = makeMockStore();
    const content =
      "Root cause analysis: the memory leak was caused by circular references in event listeners. Fix: use WeakRef for back-references.";

    const result = await promote(store, mockEmbedder, {
      content,
      type: "postmortem",
      source_type: "episodic",
      source_ref: "2026-03-22",
    });

    expect(result.type).toBe("postmortem");
    expect(store.entries[0].type).toBe("postmortem");
  });

  it("merges additional tags with promoted and from-episodic", async () => {
    const store = makeMockStore();
    const content =
      "The JWT token validation was incorrect. Always verify both signature and expiry claims. Fix: add expiry check to auth middleware.";

    await promote(store, mockEmbedder, {
      content,
      tags: ["security", "auth"],
      source_type: "episodic",
      source_ref: "2026-03-22",
    });

    const tags = store.entries[0].tags;
    expect(tags).toContain("security");
    expect(tags).toContain("auth");
    expect(tags).toContain("promoted");
    expect(tags).toContain("from-episodic");
  });
});

/* ── promote() — memo source ─────────────────────────────────────────────── */

describe("promote: memo → KB", () => {
  it("creates KB entry with promoted and from-memo tags", async () => {
    const store = makeMockStore();
    const content =
      "Session note: The workaround for the CORS issue was to add the origin header to the allowlist. " +
      "This should be documented as the standard fix for cross-origin API calls.";

    const result = await promote(store, mockEmbedder, {
      content,
      source_type: "memo",
      source_ref: "crd_abc123",
    });

    expect(result.kb_id).toBeTruthy();
    expect(result.source_type).toBe("memo");
    expect(result.source_ref).toBe("crd_abc123");

    const entry = store.entries[0];
    expect(entry.tags).toContain("promoted");
    expect(entry.tags).toContain("from-memo");
    expect(entry.source).toBe("memo:crd_abc123");
  });

  it("auto-generates title from first line of content", async () => {
    const store = makeMockStore();
    const content =
      "The API rate limit was hit during bulk import. " +
      "Fix: add exponential backoff with jitter to the HTTP client. Never send requests without retry logic.";

    const result = await promote(store, mockEmbedder, {
      content,
      source_type: "memo",
      source_ref: "crd_def456",
    });

    expect(result.title.length).toBeGreaterThan(5);
    expect(result.title.length).toBeLessThanOrEqual(83);
  });
});

/* ── annotateMemo() ──────────────────────────────────────────────────────── */

describe("annotateMemo: modifies source memo file", () => {
  it("appends promotion marker to the matching line in memo file", () => {
    const cardId = "crd_annotate_test";
    const lineContent = "tried the legacy authentication flow, do not retry";
    const kbId = "kb-42";

    // Create memo file with the line
    const filePath = path.join(memoDir, `${cardId}.md`);
    fs.writeFileSync(filePath, `2026-03-22T10:00:00Z ${lineContent}\n`, "utf-8");

    annotateMemo(memoDir, cardId, lineContent, kbId);

    const updatedContent = fs.readFileSync(filePath, "utf-8");
    expect(updatedContent).toContain(`→ promoted to ${kbId}`);
    expect(updatedContent).toContain(lineContent);
  });

  it("does not modify file when lineContent is not found", () => {
    const cardId = "crd_annotate_noop";
    const filePath = path.join(memoDir, `${cardId}.md`);
    const originalContent = "2026-03-22T10:00:00Z some other note entirely\n";
    fs.writeFileSync(filePath, originalContent, "utf-8");

    annotateMemo(memoDir, cardId, "nonexistent line content", "kb-99");

    const currentContent = fs.readFileSync(filePath, "utf-8");
    expect(currentContent).toBe(originalContent);
  });

  it("does nothing when memo file does not exist", () => {
    // Should not throw even if file is missing
    expect(() => {
      annotateMemo(memoDir, "crd_nonexistent", "some content", "kb-1");
    }).not.toThrow();
  });

  it("modifies the file on disk (not just in memory)", () => {
    const cardId = "crd_annotate_disk";
    const lineContent = "completed the migration step, do not re-run";
    const kbId = "kb-77";

    const filePath = path.join(memoDir, `${cardId}.md`);
    fs.writeFileSync(filePath, `2026-03-22T10:00:00Z ${lineContent}\n`, "utf-8");

    annotateMemo(memoDir, cardId, lineContent, kbId);

    // Re-read from disk (not from any in-memory cache)
    const diskContent = fs.readFileSync(filePath, "utf-8");
    expect(diskContent).toContain(`→ promoted to ${kbId}`);
  });
});
