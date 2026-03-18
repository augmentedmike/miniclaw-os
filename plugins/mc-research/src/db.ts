/**
 * db.ts — SQLite state for mc-research
 *
 * Tables:
 *   research_reports      — deep research query results
 *   competitors           — tracked competitors
 *   competitor_snapshots  — periodic competitor page snapshots
 *   web_searches          — cached web search results
 */

import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";

export type ReportRow = {
  id: number;
  query: string;
  focus: string;
  source: string;
  result: string;
  citations: string; // JSON array
  created_at: number;
};

export type CompetitorRow = {
  id: number;
  name: string;
  domain: string;
  notes: string;
  created_at: number;
};

export type SnapshotRow = {
  id: number;
  competitor_id: number;
  page_type: string;
  url: string;
  data: string; // JSON
  diff_summary: string;
  fetched_at: number;
};

export type SearchRow = {
  id: number;
  query: string;
  provider: string;
  results: string; // JSON
  created_at: number;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS research_reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  query       TEXT NOT NULL,
  focus       TEXT NOT NULL DEFAULT 'web',
  source      TEXT NOT NULL DEFAULT 'perplexity',
  result      TEXT NOT NULL,
  citations   TEXT NOT NULL DEFAULT '[]',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS reports_query ON research_reports(query);
CREATE INDEX IF NOT EXISTS reports_created ON research_reports(created_at);

CREATE TABLE IF NOT EXISTS competitors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  domain      TEXT NOT NULL UNIQUE,
  notes       TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS competitors_domain ON competitors(domain);

CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  competitor_id INTEGER NOT NULL REFERENCES competitors(id),
  page_type     TEXT NOT NULL,
  url           TEXT NOT NULL,
  data          TEXT NOT NULL DEFAULT '{}',
  diff_summary  TEXT NOT NULL DEFAULT '',
  fetched_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS snapshots_competitor ON competitor_snapshots(competitor_id, page_type);

CREATE TABLE IF NOT EXISTS web_searches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  query       TEXT NOT NULL,
  provider    TEXT NOT NULL,
  results     TEXT NOT NULL DEFAULT '[]',
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS searches_query ON web_searches(query);
`;

export class ResearchDb {
  private db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec(SCHEMA);
  }

  // ── Reports ──────────────────────────────────────────────────────

  saveReport(query: string, focus: string, source: string, result: string, citations: string[]): number {
    const info = this.db.prepare(`
      INSERT INTO research_reports (query, focus, source, result, citations, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(query, focus, source, result, JSON.stringify(citations), Date.now());
    return Number(info.lastInsertRowid);
  }

  getReports(limit = 20): ReportRow[] {
    return this.db.prepare(`SELECT * FROM research_reports ORDER BY created_at DESC LIMIT ?`).all(limit) as ReportRow[];
  }

  getReportById(id: number): ReportRow | undefined {
    return this.db.prepare(`SELECT * FROM research_reports WHERE id = ?`).get(id) as ReportRow | undefined;
  }

  searchReports(query: string): ReportRow[] {
    return this.db.prepare(`SELECT * FROM research_reports WHERE query LIKE ? ORDER BY created_at DESC LIMIT 20`)
      .all(`%${query}%`) as ReportRow[];
  }

  // ── Competitors ──────────────────────────────────────────────────

  addCompetitor(name: string, domain: string, notes: string): number {
    const info = this.db.prepare(`
      INSERT INTO competitors (name, domain, notes, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(domain) DO UPDATE SET name = excluded.name, notes = excluded.notes
    `).run(name, domain, notes, Date.now());
    return Number(info.lastInsertRowid);
  }

  getCompetitors(): CompetitorRow[] {
    return this.db.prepare(`SELECT * FROM competitors ORDER BY name`).all() as CompetitorRow[];
  }

  getCompetitorByDomain(domain: string): CompetitorRow | undefined {
    return this.db.prepare(`SELECT * FROM competitors WHERE domain = ?`).get(domain) as CompetitorRow | undefined;
  }

  removeCompetitor(domain: string): boolean {
    const competitor = this.getCompetitorByDomain(domain);
    if (competitor) {
      this.db.prepare(`DELETE FROM competitor_snapshots WHERE competitor_id = ?`).run(competitor.id);
    }
    const info = this.db.prepare(`DELETE FROM competitors WHERE domain = ?`).run(domain);
    return info.changes > 0;
  }

  // ── Snapshots ────────────────────────────────────────────────────

  saveSnapshot(competitorId: number, pageType: string, url: string, data: object, diffSummary: string): number {
    const info = this.db.prepare(`
      INSERT INTO competitor_snapshots (competitor_id, page_type, url, data, diff_summary, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(competitorId, pageType, url, JSON.stringify(data), diffSummary, Date.now());
    return Number(info.lastInsertRowid);
  }

  getLatestSnapshot(competitorId: number, pageType: string): SnapshotRow | undefined {
    return this.db.prepare(`
      SELECT * FROM competitor_snapshots
      WHERE competitor_id = ? AND page_type = ?
      ORDER BY fetched_at DESC LIMIT 1
    `).get(competitorId, pageType) as SnapshotRow | undefined;
  }

  getSnapshots(competitorId: number): SnapshotRow[] {
    return this.db.prepare(`
      SELECT * FROM competitor_snapshots WHERE competitor_id = ? ORDER BY fetched_at DESC
    `).all(competitorId) as SnapshotRow[];
  }

  // ── Web searches ─────────────────────────────────────────────────

  saveSearch(query: string, provider: string, results: object[]): number {
    const info = this.db.prepare(`
      INSERT INTO web_searches (query, provider, results, created_at)
      VALUES (?, ?, ?, ?)
    `).run(query, provider, JSON.stringify(results), Date.now());
    return Number(info.lastInsertRowid);
  }

  getSearches(limit = 20): SearchRow[] {
    return this.db.prepare(`SELECT * FROM web_searches ORDER BY created_at DESC LIMIT ?`).all(limit) as SearchRow[];
  }

  close(): void {
    this.db.close();
  }
}
