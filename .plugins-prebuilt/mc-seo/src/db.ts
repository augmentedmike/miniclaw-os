/**
 * db.ts — SQLite state for mc-seo
 *
 * Tables:
 *   audits       — per-page audit results (history)
 *   submissions  — outreach/directory submission tracking
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

  close(): void {
    this.db.close();
  }
}
