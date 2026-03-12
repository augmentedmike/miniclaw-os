/**
 * mc-reflection — ReflectionStore: SQLite CRUD for reflection entries.
 * Also writes markdown snapshots for easy reading.
 */

import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ReflectionEntry, ReflectionCreate } from "./types.js";
import { generateReflectionId } from "./types.js";

export class ReflectionStore {
  private db: Database.Database;
  private entriesDir: string;

  constructor(private readonly dbDir: string) {
    fs.mkdirSync(dbDir, { recursive: true });
    this.entriesDir = path.join(dbDir, "entries");
    fs.mkdirSync(this.entriesDir, { recursive: true });

    this.db = new Database(path.join(dbDir, "reflections.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reflections (
        id                TEXT PRIMARY KEY,
        date              TEXT NOT NULL,
        created_at        TEXT NOT NULL,
        summary           TEXT NOT NULL,
        went_well         TEXT NOT NULL DEFAULT '[]',
        went_wrong        TEXT NOT NULL DEFAULT '[]',
        lessons           TEXT NOT NULL DEFAULT '[]',
        action_items      TEXT NOT NULL DEFAULT '[]',
        kb_entries_created TEXT NOT NULL DEFAULT '[]',
        cards_created     TEXT NOT NULL DEFAULT '[]',
        raw_context       TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_reflections_date ON reflections(date);
    `);
  }

  save(entry: ReflectionCreate): ReflectionEntry {
    const id = generateReflectionId();
    const now = new Date().toISOString();

    const full: ReflectionEntry = {
      id,
      date: entry.date,
      created_at: now,
      summary: entry.summary,
      went_well: entry.went_well ?? [],
      went_wrong: entry.went_wrong ?? [],
      lessons: entry.lessons ?? [],
      action_items: entry.action_items ?? [],
      kb_entries_created: entry.kb_entries_created ?? [],
      cards_created: entry.cards_created ?? [],
      raw_context: entry.raw_context ?? "",
    };

    this.db.prepare(`
      INSERT INTO reflections (id, date, created_at, summary, went_well, went_wrong,
        lessons, action_items, kb_entries_created, cards_created, raw_context)
      VALUES (@id, @date, @created_at, @summary, @went_well, @went_wrong,
        @lessons, @action_items, @kb_entries_created, @cards_created, @raw_context)
    `).run({
      id: full.id,
      date: full.date,
      created_at: full.created_at,
      summary: full.summary,
      went_well: JSON.stringify(full.went_well),
      went_wrong: JSON.stringify(full.went_wrong),
      lessons: JSON.stringify(full.lessons),
      action_items: JSON.stringify(full.action_items),
      kb_entries_created: JSON.stringify(full.kb_entries_created),
      cards_created: JSON.stringify(full.cards_created),
      raw_context: full.raw_context,
    });

    this.writeMarkdown(full);
    return full;
  }

  get(id: string): ReflectionEntry | undefined {
    const row = this.db.prepare(`SELECT * FROM reflections WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToEntry(row) : undefined;
  }

  getByDate(date: string): ReflectionEntry | undefined {
    const row = this.db.prepare(`SELECT * FROM reflections WHERE date = ? ORDER BY created_at DESC LIMIT 1`).get(date) as Record<string, unknown> | undefined;
    return row ? this.rowToEntry(row) : undefined;
  }

  list(limit = 30): ReflectionEntry[] {
    const rows = this.db.prepare(`SELECT * FROM reflections ORDER BY date DESC, created_at DESC LIMIT ?`).all(limit) as Record<string, unknown>[];
    return rows.map(r => this.rowToEntry(r));
  }

  private rowToEntry(row: Record<string, unknown>): ReflectionEntry {
    return {
      id: row.id as string,
      date: row.date as string,
      created_at: row.created_at as string,
      summary: row.summary as string,
      went_well: JSON.parse((row.went_well as string) || "[]"),
      went_wrong: JSON.parse((row.went_wrong as string) || "[]"),
      lessons: JSON.parse((row.lessons as string) || "[]"),
      action_items: JSON.parse((row.action_items as string) || "[]"),
      kb_entries_created: JSON.parse((row.kb_entries_created as string) || "[]"),
      cards_created: JSON.parse((row.cards_created as string) || "[]"),
      raw_context: (row.raw_context as string) ?? "",
    };
  }

  private writeMarkdown(entry: ReflectionEntry): void {
    const mdPath = path.join(this.entriesDir, `${entry.date}-${entry.id}.md`);
    const lines: string[] = [
      `---`,
      `id: ${entry.id}`,
      `date: ${entry.date}`,
      `created_at: ${entry.created_at}`,
      `---`,
      ``,
      `# Reflection — ${entry.date}`,
      ``,
      `## Summary`,
      entry.summary,
      ``,
    ];

    if (entry.went_well.length > 0) {
      lines.push(`## What Went Well`);
      for (const item of entry.went_well) lines.push(`- ${item}`);
      lines.push(``);
    }

    if (entry.went_wrong.length > 0) {
      lines.push(`## What Went Wrong`);
      for (const item of entry.went_wrong) lines.push(`- ${item}`);
      lines.push(``);
    }

    if (entry.lessons.length > 0) {
      lines.push(`## Lessons`);
      for (const item of entry.lessons) lines.push(`- ${item}`);
      lines.push(``);
    }

    if (entry.action_items.length > 0) {
      lines.push(`## Action Items`);
      for (const item of entry.action_items) lines.push(`- ${item}`);
      lines.push(``);
    }

    if (entry.kb_entries_created.length > 0) {
      lines.push(`## KB Entries Created`);
      for (const item of entry.kb_entries_created) lines.push(`- ${item}`);
      lines.push(``);
    }

    if (entry.cards_created.length > 0) {
      lines.push(`## Board Cards Created`);
      for (const item of entry.cards_created) lines.push(`- ${item}`);
      lines.push(``);
    }

    fs.writeFileSync(mdPath, lines.join("\n"), "utf-8");
  }

  close(): void {
    this.db.close();
  }
}
