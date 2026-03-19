/**
 * mc-kb — KBStore: SQLite CRUD + FTS5 + sqlite-vec
 *
 * Uses better-sqlite3 for sync SQLite access.
 * sqlite-vec loaded from openclaw's bundled node_modules.
 */

import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import {
  type KBEntry,
  type KBEntryCreate,
  type KBEntryPatch,
  generateKbId,
  now,
  entryToMarkdown,
} from "./entry.js";

// Use createRequire to load CJS modules from openclaw's bundled node_modules
const require = createRequire(import.meta.url);

function findSqliteVecPaths(): string[] {
  const paths: string[] = [];
  try {
    const { execSync } = require("node:child_process");
    const ocBin = fs.realpathSync(execSync("which openclaw", { encoding: "utf-8" }).trim());
    let dir = path.dirname(ocBin);
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(dir, "node_modules", "sqlite-vec");
      if (fs.existsSync(candidate)) { paths.push(candidate); break; }
      dir = path.dirname(dir);
    }
  } catch {}
  paths.push("sqlite-vec");
  return paths;
}

const SQLITE_VEC_PATHS = findSqliteVecPaths();

export interface FTSResult {
  id: string;
  rank: number; // BM25 rank (negative, lower = better)
}

export interface VecResult {
  id: string;
  distance: number; // cosine distance (0..2, lower = better)
}

export interface ListFilter {
  type?: string;
  tag?: string;
  limit?: number;
}

export class KBStore {
  private db: Database.Database;
  private entriesDir: string;
  private vecLoaded = false;

  constructor(private readonly dbDir: string) {
    fs.mkdirSync(dbDir, { recursive: true });
    const entriesDir = path.join(dbDir, "entries");
    fs.mkdirSync(entriesDir, { recursive: true });
    this.entriesDir = entriesDir;

    this.db = new Database(path.join(dbDir, "kb.db"));
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("cache_size = -8000"); // 8MB cache

    this.loadVec();
    this.init();
  }

  private loadVec(): void {
    for (const vecPath of SQLITE_VEC_PATHS) {
      try {
        const { load } = require(vecPath) as { load: (db: Database.Database) => void };
        load(this.db);
        this.vecLoaded = true;
        console.log(`[mc-kb] sqlite-vec loaded from ${vecPath}`);
        return;
      } catch {
        // try next path
      }
    }
    console.warn("[mc-kb] sqlite-vec unavailable — vector search disabled (FTS5-only mode)");
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entries (
        id          TEXT PRIMARY KEY,
        type        TEXT NOT NULL,
        title       TEXT NOT NULL,
        content     TEXT NOT NULL,
        summary     TEXT,
        tags        TEXT NOT NULL DEFAULT '[]',
        source      TEXT,
        severity    TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      -- Map entry_id → FTS rowid for updates/deletes
      CREATE TABLE IF NOT EXISTS kb_fts_rowmap (
        entry_id TEXT PRIMARY KEY,
        fts_rowid INTEGER NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
        entry_id UNINDEXED,
        title,
        content,
        tokenize = 'porter ascii'
      );
    `);

    if (this.vecLoaded) {
      try {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS entry_vectors
          USING vec0(
            entry_id TEXT PRIMARY KEY,
            embedding float[768]
          );
        `);
      } catch (err) {
        console.warn(`[mc-kb] Failed to create vec0 table: ${err}`);
        this.vecLoaded = false;
      }
    }
  }

  add(entry: KBEntryCreate, vector?: Float32Array): KBEntry {
    const id = entry.id ?? generateKbId();
    const ts = now();
    const full: KBEntry = {
      ...entry,
      id,
      tags: entry.tags ?? [],
      created_at: entry.created_at ?? ts,
      updated_at: entry.updated_at ?? ts,
    };

    const insertEntry = this.db.prepare(`
      INSERT INTO entries (id, type, title, content, summary, tags, source, severity, created_at, updated_at)
      VALUES (@id, @type, @title, @content, @summary, @tags, @source, @severity, @created_at, @updated_at)
    `);

    const insertFts = this.db.prepare(`
      INSERT INTO entries_fts (entry_id, title, content) VALUES (?, ?, ?)
    `);

    const insertFtsMap = this.db.prepare(`
      INSERT INTO kb_fts_rowmap (entry_id, fts_rowid) VALUES (?, ?)
    `);

    this.db.transaction(() => {
      insertEntry.run({
        ...full,
        tags: JSON.stringify(full.tags),
        summary: full.summary ?? null,
        source: full.source ?? null,
        severity: full.severity ?? null,
      });

      const ftsResult = insertFts.run(id, full.title, full.content);
      insertFtsMap.run(id, ftsResult.lastInsertRowid);
    })();

    if (vector && this.vecLoaded) {
      this.upsertVector(id, vector);
    }

    this.writeMarkdown(full);
    console.log(`[mc-kb] Added entry ${id}: ${full.title}`);
    return full;
  }

  update(id: string, patch: KBEntryPatch, vector?: Float32Array): KBEntry {
    const existing = this.get(id);
    if (!existing) throw new Error(`Entry not found: ${id}`);

    const updated: KBEntry = {
      ...existing,
      ...patch,
      tags: patch.tags ?? existing.tags,
      updated_at: now(),
    };

    const updateEntry = this.db.prepare(`
      UPDATE entries SET
        type = @type, title = @title, content = @content,
        summary = @summary, tags = @tags, source = @source,
        severity = @severity, updated_at = @updated_at
      WHERE id = @id
    `);

    const getRowid = this.db.prepare(`SELECT fts_rowid FROM kb_fts_rowmap WHERE entry_id = ?`);
    const deleteFts = this.db.prepare(`DELETE FROM entries_fts WHERE rowid = ?`);
    const insertFts = this.db.prepare(`INSERT INTO entries_fts (entry_id, title, content) VALUES (?, ?, ?)`);
    const updateMap = this.db.prepare(`UPDATE kb_fts_rowmap SET fts_rowid = ? WHERE entry_id = ?`);

    this.db.transaction(() => {
      updateEntry.run({
        id: updated.id,
        type: updated.type,
        title: updated.title,
        content: updated.content,
        summary: updated.summary ?? null,
        tags: JSON.stringify(updated.tags),
        source: updated.source ?? null,
        severity: updated.severity ?? null,
        updated_at: updated.updated_at,
      });

      const row = getRowid.get(id) as { fts_rowid: number } | undefined;
      if (row) {
        deleteFts.run(row.fts_rowid);
        const newFts = insertFts.run(id, updated.title, updated.content);
        updateMap.run(newFts.lastInsertRowid, id);
      }
    })();

    if (vector && this.vecLoaded) {
      this.upsertVector(id, vector);
    }

    this.writeMarkdown(updated);
    console.log(`[mc-kb] Updated entry ${id}`);
    return updated;
  }

  remove(id: string): void {
    const getRowid = this.db.prepare(`SELECT fts_rowid FROM kb_fts_rowmap WHERE entry_id = ?`);
    const deleteEntry = this.db.prepare(`DELETE FROM entries WHERE id = ?`);
    const deleteMap = this.db.prepare(`DELETE FROM kb_fts_rowmap WHERE entry_id = ?`);
    const deleteFts = this.db.prepare(`DELETE FROM entries_fts WHERE rowid = ?`);

    this.db.transaction(() => {
      const row = getRowid.get(id) as { fts_rowid: number } | undefined;
      if (row) {
        deleteFts.run(row.fts_rowid);
      }
      deleteMap.run(id);
      deleteEntry.run(id);
    })();

    if (this.vecLoaded) {
      try {
        this.db.prepare(`DELETE FROM entry_vectors WHERE entry_id = ?`).run(id);
      } catch { /* ignore */ }
    }

    const mdPath = path.join(this.entriesDir, `${id}.md`);
    if (fs.existsSync(mdPath)) fs.unlinkSync(mdPath);
    console.log(`[mc-kb] Removed entry ${id}`);
  }

  get(id: string): KBEntry | undefined {
    const row = this.db.prepare(`SELECT * FROM entries WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToEntry(row) : undefined;
  }

  list(filter: ListFilter = {}): KBEntry[] {
    let sql = `SELECT * FROM entries WHERE 1=1`;
    const params: unknown[] = [];

    if (filter.type) {
      sql += ` AND type = ?`;
      params.push(filter.type);
    }
    if (filter.tag) {
      // JSON array contains tag (simple substring check on serialized JSON)
      sql += ` AND tags LIKE ?`;
      params.push(`%"${filter.tag}"%`);
    }

    sql += ` ORDER BY updated_at DESC`;

    if (filter.limit) {
      sql += ` LIMIT ?`;
      params.push(filter.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((r) => this.rowToEntry(r));
  }

  ftsSearch(query: string, limit = 10): FTSResult[] {
    // Build FTS5 query: try exact phrase first, fall back to OR of tokens
    const tokens = query
      .replace(/['"*()[\]{}:^~]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length === 0) return [];

    // Try multiple query strategies and return first non-empty result
    const strategies = [
      tokens.map((t) => `"${t}"`).join(" "),        // AND (all words required)
      tokens.map((t) => `"${t}"`).join(" OR "),      // OR (any word)
      tokens.slice(0, 2).map((t) => `"${t}"`).join(" OR "), // OR first 2 tokens
    ];

    for (const ftsQuery of strategies) {
      try {
        const rows = this.db.prepare(`
          SELECT entry_id AS id, rank
          FROM entries_fts
          WHERE entries_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `).all(ftsQuery, limit) as { id: string; rank: number }[];
        if (rows.length > 0) return rows;
      } catch (err) {
        console.warn(`[mc-kb] FTS search error (query="${ftsQuery}"): ${err}`);
      }
    }
    return [];
  }

  vecSearch(vector: Float32Array, limit = 10): VecResult[] {
    if (!this.vecLoaded) return [];
    try {
      const rows = this.db.prepare(`
        SELECT entry_id AS id, distance
        FROM entry_vectors
        WHERE embedding MATCH ?
          AND k = ?
      `).all(vector, limit) as { id: string; distance: number }[];
      return rows;
    } catch (err) {
      console.warn(`[mc-kb] Vec search error: ${err}`);
      return [];
    }
  }

  isVecLoaded(): boolean {
    return this.vecLoaded;
  }

  stats(): Record<string, number> {
    const rows = this.db.prepare(`SELECT type, COUNT(*) AS count FROM entries GROUP BY type`).all() as { type: string; count: number }[];
    const total = this.db.prepare(`SELECT COUNT(*) AS count FROM entries`).get() as { count: number };
    const result: Record<string, number> = { total: total.count };
    for (const row of rows) result[row.type] = row.count;
    return result;
  }

  private upsertVector(id: string, vector: Float32Array): void {
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO entry_vectors (entry_id, embedding) VALUES (?, ?)
      `).run(id, vector);
    } catch (err) {
      console.warn(`[mc-kb] Vec upsert error for ${id}: ${err}`);
    }
  }

  private rowToEntry(row: Record<string, unknown>): KBEntry {
    return {
      id: row.id as string,
      type: row.type as KBEntry["type"],
      title: row.title as string,
      content: row.content as string,
      summary: (row.summary as string | null) ?? undefined,
      tags: JSON.parse((row.tags as string) || "[]") as string[],
      source: (row.source as string | null) ?? undefined,
      severity: (row.severity as KBEntry["severity"] | null) ?? undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  private writeMarkdown(entry: KBEntry): void {
    const mdPath = path.join(this.entriesDir, `${entry.id}.md`);
    fs.writeFileSync(mdPath, entryToMarkdown(entry), "utf-8");
  }

  close(): void {
    this.db.close();
  }
}
