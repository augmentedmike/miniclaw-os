import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";

const _STATE = process.env.OPENCLAW_STATE_DIR ?? path.join(require("node:os").homedir(), ".miniclaw");
const KB_DB = process.env.BOARD_KB_DB ?? path.join(_STATE, "user", "augmentedmike_bot", "kb", "kb.db");
const QMD_DIR = process.env.BOARD_QMD_DIR ?? path.join(_STATE, "memory");

export interface KbEntry {
  id: string;
  key: string;
  value: string;
  created_at?: string;
  updated_at?: string;
}

// Map from real schema columns to KbEntry interface (key=title, value=content)
function mapRow(row: Record<string, unknown>): KbEntry {
  return {
    id: String(row.id ?? ""),
    key: String(row.title ?? row.id ?? ""),
    value: String(row.content ?? row.summary ?? ""),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export function listKbEntries(limit = 50): KbEntry[] {
  if (!fs.existsSync(KB_DB)) return [];
  try {
    const db = new Database(KB_DB, { readonly: true });
    const rows = db.prepare("SELECT id, title, content, summary, created_at, updated_at FROM entries ORDER BY updated_at DESC LIMIT ?").all(limit) as Record<string, unknown>[];
    db.close();
    return rows.map(mapRow);
  } catch { return []; }
}

export function searchKbEntries(query: string, limit = 20): KbEntry[] {
  if (!fs.existsSync(KB_DB)) return [];
  try {
    const db = new Database(KB_DB, { readonly: true });
    const q = `%${query}%`;
    const rows = db.prepare("SELECT id, title, content, summary, created_at, updated_at FROM entries WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC LIMIT ?").all(q, q, limit) as Record<string, unknown>[];
    db.close();
    return rows.map(mapRow);
  } catch { return []; }
}

export interface QmdEntry {
  filename: string;
  title: string;
  path: string;
  modified: string;
  preview: string;
}

export function listQmdRecent(limit = 20): QmdEntry[] {
  if (!fs.existsSync(QMD_DIR)) return [];
  try {
    const files = fs.readdirSync(QMD_DIR)
      .filter(f => f.endsWith(".md"))
      .map(f => {
        const full = path.join(QMD_DIR, f);
        const stat = fs.statSync(full);
        const content = fs.readFileSync(full, "utf-8");
        const lines = content.split("\n");
        const title = lines[0]?.replace(/^#+\s*/, "") || f.replace(".md", "");
        const preview = lines.slice(1, 4).join(" ").slice(0, 120);
        return { filename: f, title, path: full, modified: stat.mtime.toISOString(), preview };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));
    return files.slice(0, limit);
  } catch { return []; }
}
