import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";

const _STATE = process.env.OPENCLAW_STATE_DIR ?? path.join(require("node:os").homedir(), ".openclaw");

function _getKbDb(): string {
  return process.env.BOARD_KB_DB ?? path.join(_STATE, "USER", "kb", "kb.db");
}
function _getQmdDir(): string {
  return process.env.BOARD_QMD_DIR ?? path.join(_STATE, "USER", "memory");
}

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
  if (!fs.existsSync(_getKbDb())) return [];
  try {
    const db = new Database(_getKbDb(), { readonly: true });
    const rows = db.prepare("SELECT id, title, content, summary, created_at, updated_at FROM entries ORDER BY updated_at DESC LIMIT ?").all(limit) as Record<string, unknown>[];
    db.close();
    return rows.map(mapRow);
  } catch { return []; }
}

export function searchKbEntries(query: string, limit = 20): KbEntry[] {
  if (!fs.existsSync(_getKbDb())) return [];
  try {
    const db = new Database(_getKbDb(), { readonly: true });
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

function walkMd(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) results.push(...walkMd(full));
    else if (f.endsWith(".md")) results.push(full);
  }
  return results;
}

// Minimum content length to be considered a real entry
const KB_MIN_CONTENT = 80;

export function pruneKbEntries(dryRun = true): { id: string; title: string; content: string }[] {
  if (!fs.existsSync(_getKbDb())) return [];
  try {
    const db = new Database(_getKbDb());
    const dead = db.prepare(
      "SELECT id, title, content FROM entries WHERE length(trim(content)) < ?"
    ).all(KB_MIN_CONTENT) as { id: string; title: string; content: string }[];
    if (!dryRun && dead.length > 0) {
      const del = db.prepare("DELETE FROM entries WHERE id = ?");
      for (const row of dead) del.run(row.id);
    }
    db.close();
    return dead;
  } catch { return []; }
}

export const KB_TEMPLATE = `# Title of the entry

## What
One-sentence summary of the fact, lesson, or insight.

## Context
Why this matters. What situation it came from. What problem it solves.

## Details
The actual content — commands, links, observations, examples.

## Tags
comma, separated, tags
`;

export function listQmdRecent(limit = 20): QmdEntry[] {
  if (!fs.existsSync(_getQmdDir())) return [];
  try {
    const files = walkMd(_getQmdDir())
      .map(full => {
        const stat = fs.statSync(full);
        const content = fs.readFileSync(full, "utf-8");
        const lines = content.split("\n");
        const title = lines[0]?.replace(/^#+\s*/, "") || path.basename(full, ".md");
        const preview = lines.slice(1, 4).join(" ").slice(0, 120);
        const filename = path.relative(_getQmdDir(), full);
        return { filename, title, path: full, modified: stat.mtime.toISOString(), preview };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));
    return files.slice(0, limit);
  } catch { return []; }
}
