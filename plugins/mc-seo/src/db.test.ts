/**
 * db.test.ts — tests for mc-seo DB methods (ranks, experiments)
 */

import { test, expect, beforeEach, afterEach, describe } from "vitest";
import { SeoDb } from "./db.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

let db: SeoDb;
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-seo-test-"));
  db = new SeoDb(path.join(tmpDir, "test.db"));
});

afterEach(() => {
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Ranks ────────────────────────────────────────────────────────────────────

describe("ranks", () => {
  test("saveRank and getLatestRank", () => {
    db.saveRank("example.com", "test keyword", "google", 5, "https://example.com/page");
    const latest = db.getLatestRank("example.com", "test keyword");
    expect(latest).toBeDefined();
    expect(latest!.domain).toBe("example.com");
    expect(latest!.keyword).toBe("test keyword");
    expect(latest!.engine).toBe("google");
    expect(latest!.position).toBe(5);
    expect(latest!.url).toBe("https://example.com/page");
  });

  test("getLatestRank returns undefined when no data", () => {
    const latest = db.getLatestRank("example.com", "nonexistent");
    expect(latest).toBeUndefined();
  });

  test("saveRank with null position", () => {
    db.saveRank("example.com", "rare keyword", "bing", null, null);
    const latest = db.getLatestRank("example.com", "rare keyword");
    expect(latest).toBeDefined();
    expect(latest!.position).toBeNull();
    expect(latest!.url).toBeNull();
  });

  test("getRankHistory returns entries in descending order", () => {
    db.saveRank("example.com", "kw", "google", 10, null);
    db.saveRank("example.com", "kw", "google", 8, null);
    db.saveRank("example.com", "kw", "google", 5, null);

    const history = db.getRankHistory("example.com", "kw");
    expect(history).toHaveLength(3);
    // Most recent first — position 5 was inserted last
    expect(history[0].position).toBe(5);
    expect(history[2].position).toBe(10);
  });

  test("getRankHistory respects limit", () => {
    for (let i = 0; i < 10; i++) {
      db.saveRank("example.com", "kw", "google", i + 1, null);
    }
    const history = db.getRankHistory("example.com", "kw", 3);
    expect(history).toHaveLength(3);
  });

  test("getTrackedKeywords returns distinct keywords", () => {
    db.saveRank("example.com", "keyword-a", "google", 1, null);
    db.saveRank("example.com", "keyword-b", "google", 2, null);
    db.saveRank("example.com", "keyword-a", "bing", 3, null);

    const keywords = db.getTrackedKeywords("example.com");
    expect(keywords.sort()).toEqual(["keyword-a", "keyword-b"]);
  });
});

// ── Experiments ──────────────────────────────────────────────────────────────

describe("experiments", () => {
  const baseExp = {
    id: "exp_test001",
    domain: "example.com",
    url: "https://example.com/page",
    hypothesis: "Adding keyword to title improves rank",
    change_type: "title",
    change_before: "Old Title",
    change_after: "New Title With Keyword",
    change_file: null,
    change_commit: null,
    metric: "score",
    baseline_value: 45,
    result_value: null,
    applied_at: null,
    measured_at: null,
    created_at: new Date().toISOString(),
    card_id: null,
    wait_days: 7,
  };

  test("createExperiment and getExperiment", () => {
    db.createExperiment(baseExp);
    const exp = db.getExperiment("exp_test001");
    expect(exp).toBeDefined();
    expect(exp!.id).toBe("exp_test001");
    expect(exp!.domain).toBe("example.com");
    expect(exp!.hypothesis).toBe("Adding keyword to title improves rank");
    expect(exp!.status).toBe("proposed");
    expect(exp!.baseline_value).toBe(45);
    expect(exp!.wait_days).toBe(7);
  });

  test("getExperiment returns undefined for missing id", () => {
    expect(db.getExperiment("nonexistent")).toBeUndefined();
  });

  test("updateExperiment changes fields", () => {
    db.createExperiment(baseExp);
    db.updateExperiment("exp_test001", {
      status: "waiting",
      change_commit: "abc123",
      applied_at: "2026-01-15T10:00:00Z",
    });

    const exp = db.getExperiment("exp_test001");
    expect(exp!.status).toBe("waiting");
    expect(exp!.change_commit).toBe("abc123");
    expect(exp!.applied_at).toBe("2026-01-15T10:00:00Z");
  });

  test("updateExperiment with no fields does nothing", () => {
    db.createExperiment(baseExp);
    db.updateExperiment("exp_test001", {});
    const exp = db.getExperiment("exp_test001");
    expect(exp!.status).toBe("proposed");
  });

  test("listExperiments returns all for domain", () => {
    db.createExperiment(baseExp);
    db.createExperiment({ ...baseExp, id: "exp_test002", url: "https://example.com/other" });
    db.createExperiment({ ...baseExp, id: "exp_test003", domain: "other.com" });

    const list = db.listExperiments("example.com");
    expect(list).toHaveLength(2);
  });

  test("getActiveExperiments returns applied/waiting only", () => {
    db.createExperiment({ ...baseExp, status: "proposed" });
    db.createExperiment({ ...baseExp, id: "exp_test002", status: "waiting" });
    db.createExperiment({ ...baseExp, id: "exp_test003", status: "applied" });
    db.createExperiment({ ...baseExp, id: "exp_test004", status: "kept" });
    db.createExperiment({ ...baseExp, id: "exp_test005", status: "reverted" });

    const active = db.getActiveExperiments();
    expect(active).toHaveLength(2);
    const statuses = active.map(e => e.status);
    expect(statuses).toContain("waiting");
    expect(statuses).toContain("applied");
  });

  test("createExperiment defaults status to proposed", () => {
    db.createExperiment({ ...baseExp, id: "exp_default" });
    const exp = db.getExperiment("exp_default");
    expect(exp!.status).toBe("proposed");
  });
});

// ── Audits (existing, sanity check) ─────────────────────────────────────────

describe("audits", () => {
  test("saveAudit and getLatestAudits", () => {
    db.saveAudit("example.com", "https://example.com/", 85, ["issue1"], ["suggestion1"], { score: 85 });
    const audits = db.getLatestAudits("example.com");
    expect(audits).toHaveLength(1);
    expect(audits[0].score).toBe(85);
    expect(audits[0].domain).toBe("example.com");
  });
});
