/**
 * archive.test.ts — unit tests for ArchiveStore
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ArchiveStore } from "./archive.js";
import type { Card } from "./card.js";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "crd_test01",
    title: "Test card",
    column: "shipped",
    priority: "medium",
    tags: [],
    created_at: "2026-03-03T00:00:00.000Z",
    updated_at: "2026-03-03T01:00:00.000Z",
    history: [
      { column: "backlog", moved_at: "2026-03-03T00:00:00.000Z" },
      { column: "shipped", moved_at: "2026-03-03T01:00:00.000Z" },
    ],
    problem_description: "A test problem",
    implementation_plan: "A test plan",
    acceptance_criteria: "- [x] done",
    notes: "All good",
    review_notes: "LGTM",
    ...overrides,
  };
}

let tmpDir: string;
let stateDir: string;
let archive: ArchiveStore;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "brain-archive-test-"));
  stateDir = tmpDir;
  archive = new ArchiveStore(stateDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ArchiveStore", () => {
  it("starts with no archives", () => {
    expect(archive.listArchives()).toHaveLength(0);
    expect(archive.readAll()).toHaveLength(0);
  });

  it("archives a card and removes source file", () => {
    const card = makeCard();
    const sourceFile = path.join(tmpDir, "crd_test01-test-card.md");
    fs.writeFileSync(sourceFile, "dummy content");

    archive.archiveCard(card, sourceFile);

    expect(fs.existsSync(sourceFile)).toBe(false);
    const archives = archive.listArchives();
    expect(archives).toHaveLength(1);
    expect(archives[0].cardCount).toBe(1);
  });

  it("reads back archived cards correctly", () => {
    const card = makeCard({ id: "crd_abc123", title: "My archived card" });
    const sourceFile = path.join(tmpDir, "dummy.md");
    fs.writeFileSync(sourceFile, "x");

    archive.archiveCard(card, sourceFile);

    const all = archive.readAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("crd_abc123");
    expect(all[0].title).toBe("My archived card");
    expect(all[0].column).toBe("shipped");
  });

  it("accumulates multiple cards in the same archive", () => {
    for (let i = 1; i <= 5; i++) {
      const card = makeCard({ id: `crd_card0${i}`, title: `Card ${i}` });
      const src = path.join(tmpDir, `card${i}.md`);
      fs.writeFileSync(src, "x");
      archive.archiveCard(card, src);
    }

    const archives = archive.listArchives();
    expect(archives).toHaveLength(1);
    expect(archives[0].cardCount).toBe(5);
    expect(archive.readAll()).toHaveLength(5);
  });

  it("rotates to a new archive when size limit exceeded", () => {
    // Seed a fake 6MB archive file so the next card must go to archive-002
    const archiveDir = path.join(stateDir, "archive");
    fs.mkdirSync(archiveDir, { recursive: true });
    const bigFile = path.join(archiveDir, "brain-archive-001.jsonl.gz");
    // Write raw bytes > 5MB so _archiveSize (which measures compressed file size) exceeds MAX_BYTES
    const fakeContent = Buffer.alloc(6 * 1024 * 1024, "x");
    fs.writeFileSync(bigFile, fakeContent); // not gzipped — size check is on raw file bytes

    const card = makeCard({ id: "crd_overflow", title: "overflow card" });
    const src = path.join(tmpDir, "overflow.md");
    fs.writeFileSync(src, "x");
    archive.archiveCard(card, src);

    const archives = archive.listArchives();
    expect(archives).toHaveLength(2);
    expect(archives[1].name).toBe("brain-archive-002.jsonl.gz");
  });

  it("search finds cards by title", () => {
    const cards = [
      makeCard({ id: "crd_aaa", title: "Fix the login bug" }),
      makeCard({ id: "crd_bbb", title: "Add dark mode" }),
      makeCard({ id: "crd_ccc", title: "Fix broken tests" }),
    ];
    for (const card of cards) {
      const src = path.join(tmpDir, `${card.id}.md`);
      fs.writeFileSync(src, "x");
      archive.archiveCard(card, src);
    }

    const results = archive.search("fix");
    expect(results).toHaveLength(2);
    expect(results.map(c => c.id).sort()).toEqual(["crd_aaa", "crd_ccc"].sort());
  });

  it("search finds cards by id", () => {
    const card = makeCard({ id: "crd_xyz99", title: "Some task" });
    const src = path.join(tmpDir, "xyz.md");
    fs.writeFileSync(src, "x");
    archive.archiveCard(card, src);

    const results = archive.search("xyz99");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("crd_xyz99");
  });

  it("search returns empty for no match", () => {
    const card = makeCard({ id: "crd_aaa", title: "Deploy to prod" });
    const src = path.join(tmpDir, "aaa.md");
    fs.writeFileSync(src, "x");
    archive.archiveCard(card, src);

    expect(archive.search("nonexistent")).toHaveLength(0);
  });

  it("handles missing source file gracefully", () => {
    const card = makeCard();
    // Source file doesn't exist — should still archive the card
    archive.archiveCard(card, path.join(tmpDir, "ghost.md"));

    expect(archive.readAll()).toHaveLength(1);
  });

  it("listArchives returns size in bytes", () => {
    const card = makeCard();
    const src = path.join(tmpDir, "x.md");
    fs.writeFileSync(src, "x");
    archive.archiveCard(card, src);

    const archives = archive.listArchives();
    expect(archives[0].sizeBytes).toBeGreaterThan(0);
  });
});
