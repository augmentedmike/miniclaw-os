/**
 * db.ts — SQLite state for mc-seo
 *
 * Tables:
 *   audits       — per-page audit results (history)
 *   submissions  — outreach/directory submission tracking
 *   ranks        — SERP position history per domain+keyword
 *   experiments  — SEO experiment tracking (autoresearch)
 */

import Database from "better-sqlite3";
import * as path from "node:path";
import * as fs from "node:fs";

export type AuditRow = {
  id: number;
  domain: string;
  url: string;
  score: number;
  issues: string; // JSON
  suggestions: string; // JSON
  raw: string; // JSON full audit data
  crawled_at: number;
};

export type SubmissionRow = {
  id: number;
  domain: string;
  service: string;
  service_url: string;
  status: "pending" | "submitted" | "live" | "rejected" | "n/a";
  submitted_at: number | null;
  notes: string;
};

export type RankRow = {
  id: number;
  domain: string;
  keyword: string;
  engine: string;
  position: number | null;
  url: string | null;
  checked_at: string;
};

export type ExperimentRow = {
  id: string;
  domain: string;
  url: string;
  hypothesis: string;
  change_type: string;
  change_before: string | null;
  change_after: string | null;
  change_file: string | null;
  change_commit: string | null;
  metric: string;
  baseline_value: number | null;
  result_value: number | null;
  status: string;
  wait_days: number;
  applied_at: string | null;
  measured_at: string | null;
  created_at: string;
  card_id: string | null;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS audits (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  domain      TEXT NOT NULL,
  url         TEXT NOT NULL,
  score       INTEGER NOT NULL,
  issues      TEXT NOT NULL DEFAULT '[]',
  suggestions TEXT NOT NULL DEFAULT '[]',
  raw         TEXT NOT NULL DEFAULT '{}',
  crawled_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS audits_domain ON audits(domain);
CREATE INDEX IF NOT EXISTS audits_url ON audits(url, crawled_at);

CREATE TABLE IF NOT EXISTS submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  domain       TEXT NOT NULL,
  service      TEXT NOT NULL,
  service_url  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending',
  submitted_at INTEGER,
  notes        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS submissions_domain ON submissions(domain);
CREATE UNIQUE INDEX IF NOT EXISTS submissions_domain_service ON submissions(domain, service);

CREATE TABLE IF NOT EXISTS ranks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  domain     TEXT NOT NULL,
  keyword    TEXT NOT NULL,
  engine     TEXT NOT NULL,
  position   INTEGER,
  url        TEXT,
  checked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ranks_domain_keyword ON ranks(domain, keyword, checked_at);

CREATE TABLE IF NOT EXISTS experiments (
  id              TEXT PRIMARY KEY,
  domain          TEXT NOT NULL,
  url             TEXT NOT NULL,
  hypothesis      TEXT NOT NULL,
  change_type     TEXT NOT NULL,
  change_before   TEXT,
  change_after    TEXT,
  change_file     TEXT,
  change_commit   TEXT,
  metric          TEXT NOT NULL,
  baseline_value  REAL,
  result_value    REAL,
  status          TEXT NOT NULL DEFAULT 'proposed',
  wait_days       INTEGER NOT NULL DEFAULT 7,
  applied_at      TEXT,
  measured_at     TEXT,
  created_at      TEXT NOT NULL,
  card_id         TEXT
);
CREATE INDEX IF NOT EXISTS experiments_domain ON experiments(domain);
CREATE INDEX IF NOT EXISTS experiments_status ON experiments(status);
`;

export class SeoDb {
  private db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.exec(SCHEMA);
  }

  saveAudit(domain: string, url: string, score: number, issues: string[], suggestions: string[], raw: object): void {
    this.db.prepare(`
      INSERT INTO audits (domain, url, score, issues, suggestions, raw, crawled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(domain, url, score, JSON.stringify(issues), JSON.stringify(suggestions), JSON.stringify(raw), Date.now());
  }

  getLatestAudits(domain: string): AuditRow[] {
    return this.db.prepare(`
      SELECT a.* FROM audits a
      INNER JOIN (
        SELECT url, MAX(crawled_at) as max_at FROM audits WHERE domain = ? GROUP BY url
      ) b ON a.url = b.url AND a.crawled_at = b.max_at
      ORDER BY a.score ASC
    `).all(domain) as AuditRow[];
  }

  upsertSubmission(domain: string, service: string, serviceUrl: string, status: string, notes: string): void {
    this.db.prepare(`
      INSERT INTO submissions (domain, service, service_url, status, submitted_at, notes)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(domain, service) DO UPDATE SET
        service_url = excluded.service_url,
        status = excluded.status,
        submitted_at = CASE WHEN excluded.status IN ('submitted','live') THEN unixepoch()*1000 ELSE submitted_at END,
        notes = excluded.notes
    `).run(domain, service, serviceUrl, status, Date.now(), notes);
  }

  getSubmissions(domain?: string): SubmissionRow[] {
    if (domain) {
      return this.db.prepare(`SELECT * FROM submissions WHERE domain = ? ORDER BY service`).all(domain) as SubmissionRow[];
    }
    return this.db.prepare(`SELECT * FROM submissions ORDER BY domain, service`).all() as SubmissionRow[];
  }

  // ── Ranks ──────────────────────────────────────────────────────────────────

  saveRank(domain: string, keyword: string, engine: string, position: number | null, url: string | null | undefined): void {
    this.db.prepare(`
      INSERT INTO ranks (domain, keyword, engine, position, url, checked_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(domain, keyword, engine, position ?? null, url ?? null, new Date().toISOString());
  }

  getLatestRank(domain: string, keyword: string): RankRow | undefined {
    return this.db.prepare(`
      SELECT * FROM ranks
      WHERE domain = ? AND keyword = ?
      ORDER BY checked_at DESC
      LIMIT 1
    `).get(domain, keyword) as RankRow | undefined;
  }

  getRankHistory(domain: string, keyword: string, limit = 20): RankRow[] {
    return this.db.prepare(`
      SELECT * FROM ranks
      WHERE domain = ? AND keyword = ?
      ORDER BY checked_at DESC
      LIMIT ?
    `).all(domain, keyword, limit) as RankRow[];
  }

  // ── Experiments ───────────────────────────────────────────────────────────

  createExperiment(exp: Omit<ExperimentRow, "status"> & { status?: string }): void {
    const row = { status: "proposed", ...exp };
    this.db.prepare(`
      INSERT INTO experiments (id, domain, url, hypothesis, change_type, change_before, change_after,
        change_file, change_commit, metric, baseline_value, result_value, status, wait_days,
        applied_at, measured_at, created_at, card_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      row.id, row.domain, row.url, row.hypothesis, row.change_type,
      row.change_before ?? null, row.change_after ?? null,
      row.change_file ?? null, row.change_commit ?? null,
      row.metric, row.baseline_value ?? null, row.result_value ?? null,
      row.status, row.wait_days ?? 7,
      row.applied_at ?? null, row.measured_at ?? null,
      row.created_at, row.card_id ?? null
    );
  }

  getExperiment(id: string): ExperimentRow | undefined {
    return this.db.prepare(`SELECT * FROM experiments WHERE id = ?`).get(id) as ExperimentRow | undefined;
  }

  updateExperiment(id: string, fields: Partial<ExperimentRow>): void {
    const allowed = [
      "status", "change_before", "change_after", "change_file", "change_commit",
      "baseline_value", "result_value", "applied_at", "measured_at", "card_id",
    ] as const;
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const key of allowed) {
      if (key in fields) {
        sets.push(`${key} = ?`);
        values.push(fields[key as keyof ExperimentRow] ?? null);
      }
    }
    if (sets.length === 0) return;
    values.push(id);
    this.db.prepare(`UPDATE experiments SET ${sets.join(", ")} WHERE id = ?`).run(...values);
  }

  listExperiments(domain: string): ExperimentRow[] {
    return this.db.prepare(`
      SELECT * FROM experiments WHERE domain = ? ORDER BY created_at DESC
    `).all(domain) as ExperimentRow[];
  }

  getTrackedKeywords(domain: string): string[] {
    const rows = this.db.prepare(`
      SELECT DISTINCT keyword FROM ranks WHERE domain = ?
    `).all(domain) as Array<{ keyword: string }>;
    return rows.map(r => r.keyword);
  }

  getActiveExperiments(): ExperimentRow[] {
    return this.db.prepare(`
      SELECT * FROM experiments WHERE status IN ('applied', 'waiting') ORDER BY applied_at ASC
    `).all() as ExperimentRow[];
  }

  close(): void {
    this.db.close();
  }
}
