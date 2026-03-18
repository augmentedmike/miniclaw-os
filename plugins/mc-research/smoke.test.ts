import { test, expect } from "vitest";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "./src/config.ts";
import { ResearchDb } from "./src/db.ts";
import { diffSnapshots } from "./src/scraper.ts";
import { formatHistory, formatCompetitorList, formatSearchResults } from "./src/reporter.ts";
import * as os from "node:os";
import * as fs from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("index.ts exists", () => {
  expect(existsSync(__dirname + "/index.ts")).toBe(true);
});

test("resolveConfig returns defaults", () => {
  const cfg = resolveConfig({});
  expect(cfg).toBeDefined();
  expect(cfg.perplexityModel).toBe("sonar");
  expect(cfg.searchProvider).toBe("google");
  expect(cfg.maxSnapshotPages).toBe(5);
  expect(typeof cfg.stateDir).toBe("string");
});

test("resolveConfig accepts overrides", () => {
  const cfg = resolveConfig({
    perplexityModel: "sonar-pro",
    searchProvider: "serp",
    maxSnapshotPages: 3,
  });
  expect(cfg.perplexityModel).toBe("sonar-pro");
  expect(cfg.searchProvider).toBe("serp");
  expect(cfg.maxSnapshotPages).toBe(3);
});

test("ResearchDb creates tables and does CRUD", () => {
  const tmpDir = fs.mkdtempSync(join(os.tmpdir(), "mc-research-test-"));
  const dbPath = join(tmpDir, "test.db");
  const db = new ResearchDb(dbPath);

  // Reports
  const reportId = db.saveReport("test query", "web", "perplexity", "test answer", ["https://example.com"]);
  expect(reportId).toBeGreaterThan(0);
  const reports = db.getReports();
  expect(reports.length).toBe(1);
  expect(reports[0].query).toBe("test query");

  const found = db.searchReports("test");
  expect(found.length).toBe(1);

  // Competitors
  const compId = db.addCompetitor("TestCo", "testco.com", "A test competitor");
  expect(compId).toBeGreaterThan(0);
  const competitors = db.getCompetitors();
  expect(competitors.length).toBe(1);
  expect(competitors[0].name).toBe("TestCo");

  const comp = db.getCompetitorByDomain("testco.com");
  expect(comp).toBeDefined();
  expect(comp!.domain).toBe("testco.com");

  // Snapshots
  const snapId = db.saveSnapshot(comp!.id, "pricing", "https://testco.com/pricing", { title: "Pricing" }, "Initial snapshot");
  expect(snapId).toBeGreaterThan(0);
  const latest = db.getLatestSnapshot(comp!.id, "pricing");
  expect(latest).toBeDefined();
  expect(latest!.page_type).toBe("pricing");

  // Web searches
  const searchId = db.saveSearch("test search", "google", [{ title: "Result", url: "https://example.com", snippet: "..." }]);
  expect(searchId).toBeGreaterThan(0);
  const searches = db.getSearches();
  expect(searches.length).toBe(1);

  // Remove competitor
  const removed = db.removeCompetitor("testco.com");
  expect(removed).toBe(true);
  expect(db.getCompetitors().length).toBe(0);

  db.close();
  fs.rmSync(tmpDir, { recursive: true });
});

test("diffSnapshots detects changes", () => {
  const prev = { url: "https://test.com", title: "Old Title", headings: ["H1"], textContent: "hello world", links: ["https://a.com"], meta: {}, fetchedAt: 1000 };
  const curr = { url: "https://test.com", title: "New Title", headings: ["H1", "H2"], textContent: "hello world updated", links: ["https://a.com", "https://b.com"], meta: {}, fetchedAt: 2000 };

  const diff = diffSnapshots(prev, curr);
  expect(diff.hasChanges).toBe(true);
  expect(diff.details.length).toBeGreaterThan(0);
  expect(diff.details.some((d) => d.includes("Title changed"))).toBe(true);
});

test("diffSnapshots handles initial snapshot", () => {
  const curr = { url: "https://test.com", title: "Title", headings: [], textContent: "", links: [], meta: {}, fetchedAt: 1000 };
  const diff = diffSnapshots(null, curr);
  expect(diff.hasChanges).toBe(true);
  expect(diff.summary).toBe("Initial snapshot captured");
});

test("formatHistory handles empty list", () => {
  const result = formatHistory([]);
  expect(result).toContain("No research history");
});

test("formatCompetitorList handles empty list", () => {
  const result = formatCompetitorList([]);
  expect(result).toContain("No competitors tracked");
});

test("formatSearchResults formats results", () => {
  const results = [{ title: "Test", url: "https://test.com", snippet: "A test result" }];
  const formatted = formatSearchResults(results, "test query", "google");
  expect(formatted).toContain("test query");
  expect(formatted).toContain("google");
  expect(formatted).toContain("Test");
});
