/**
 * gather.ts — Collects the day's data from all sources into a single context object.
 *
 * Reads:
 * - Episodic memory files (today + yesterday)
 * - Board state (all columns, cards shipped today)
 * - KB entries created/updated today
 * - Session transcript logs (extracts user messages for context)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import Database from "better-sqlite3";
import type {
  GatheredContext,
  BoardSnapshot,
  CardSummary,
  KBSummary,
} from "./types.js";
import { today, yesterday } from "./types.js";

export interface GatherConfig {
  memoryDir: string;
  boardDbPath: string;
  kbDbPath: string;
  transcriptsDir: string;
}

export function gather(cfg: GatherConfig, date?: string): GatheredContext {
  const targetDate = date ?? today();
  const prevDate = date ? prevDay(date) : yesterday();

  return {
    date: targetDate,
    episodic_memory: readMemoryFile(cfg.memoryDir, targetDate),
    yesterday_memory: readMemoryFile(cfg.memoryDir, prevDate),
    board_snapshot: readBoardState(cfg.boardDbPath, targetDate),
    recent_kb_entries: readRecentKB(cfg.kbDbPath, targetDate),
    transcript_summary: readTranscripts(cfg.transcriptsDir, targetDate),
  };
}

function prevDay(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ---- Episodic memory ----

function readMemoryFile(memoryDir: string, date: string): string {
  const filePath = path.join(memoryDir, `${date}.md`);
  if (!fs.existsSync(filePath)) return `(no memory file for ${date})`;
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return `(error reading memory for ${date})`;
  }
}

// ---- Board state ----

interface CardRow {
  id: string;
  title: string;
  col: string;
  priority: string;
  tags: string;
  project_id: string | null;
  updated_at: string;
  notes: string;
  work_log: string;
}

function readBoardState(boardDbDir: string, date: string): BoardSnapshot {
  const dbPath = path.join(boardDbDir, "board.db");
  if (!fs.existsSync(dbPath)) {
    return { backlog: [], in_progress: [], in_review: [], shipped_today: [] };
  }

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });

    const allCards = db.prepare(`SELECT id, title, col, priority, tags, project_id, updated_at, notes, work_log FROM cards`).all() as CardRow[];

    const toSummary = (row: CardRow): CardSummary => {
      let workLogSummary = "";
      try {
        const log = JSON.parse(row.work_log || "[]") as Array<{ at: string; note: string }>;
        // Only include today's work log entries
        const todayEntries = log.filter(e => e.at?.startsWith(date));
        if (todayEntries.length > 0) {
          workLogSummary = todayEntries.map(e => `${e.at}: ${e.note}`).join("\n");
        }
      } catch { /* ignore parse errors */ }

      return {
        id: row.id,
        title: row.title,
        priority: row.priority,
        tags: JSON.parse(row.tags || "[]"),
        project_id: row.project_id ?? undefined,
        updated_at: row.updated_at,
        notes: row.notes?.slice(0, 500) ?? "",
        work_log_summary: workLogSummary,
      };
    };

    // Cards shipped today (moved to shipped column today based on updated_at)
    const shippedToday = allCards
      .filter(c => c.col === "shipped" && c.updated_at.startsWith(date))
      .map(toSummary);

    return {
      backlog: allCards.filter(c => c.col === "backlog").map(toSummary),
      in_progress: allCards.filter(c => c.col === "in-progress").map(toSummary),
      in_review: allCards.filter(c => c.col === "in-review").map(toSummary),
      shipped_today: shippedToday,
    };
  } catch (err) {
    console.error(`[mc-reflection] Error reading board.db: ${err}`);
    return { backlog: [], in_progress: [], in_review: [], shipped_today: [] };
  } finally {
    db?.close();
  }
}

// ---- KB entries ----

function readRecentKB(kbDbDir: string, date: string): KBSummary[] {
  const dbPath = path.join(kbDbDir, "kb.db");
  if (!fs.existsSync(dbPath)) return [];

  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true });

    // Entries created or updated today
    const rows = db.prepare(`
      SELECT id, type, title, tags, created_at, summary, content
      FROM entries
      WHERE created_at LIKE ? || '%' OR updated_at LIKE ? || '%'
      ORDER BY updated_at DESC
      LIMIT 50
    `).all(date, date) as Array<{
      id: string; type: string; title: string; tags: string;
      created_at: string; summary: string | null; content: string;
    }>;

    return rows.map(r => ({
      id: r.id,
      type: r.type,
      title: r.title,
      tags: JSON.parse(r.tags || "[]"),
      created_at: r.created_at,
      summary: r.summary ?? r.content.slice(0, 200).replace(/\n/g, " "),
    }));
  } catch (err) {
    console.error(`[mc-reflection] Error reading kb.db: ${err}`);
    return [];
  } finally {
    db?.close();
  }
}

// ---- Session transcripts ----

function readTranscripts(transcriptsDir: string, date: string): string {
  if (!fs.existsSync(transcriptsDir)) return "(no transcripts directory)";

  try {
    // Find all .jsonl session files modified today
    const projectDirs = fs.readdirSync(transcriptsDir, { withFileTypes: true })
      .filter(d => d.isDirectory());

    const todayLines: string[] = [];
    let sessionCount = 0;

    for (const projDir of projectDirs) {
      const projPath = path.join(transcriptsDir, projDir.name);
      const jsonlFiles = fs.readdirSync(projPath, { withFileTypes: true })
        .filter(f => f.isFile() && f.name.endsWith(".jsonl"));

      for (const jsonlFile of jsonlFiles) {
        const filePath = path.join(projPath, jsonlFile.name);
        const stat = fs.statSync(filePath);

        // Only process files modified today
        if (!stat.mtime.toISOString().startsWith(date)) continue;

        sessionCount++;
        const lines = extractUserMessages(filePath, date);
        if (lines.length > 0) {
          const projName = projDir.name.replace(/-/g, "/").slice(1); // decode path
          todayLines.push(`### Session: ${projName}\n${lines.join("\n")}`);
        }
      }
    }

    if (todayLines.length === 0) {
      return `(no session transcripts found for ${date})`;
    }

    return `${sessionCount} sessions found.\n\n${todayLines.join("\n\n")}`;
  } catch (err) {
    console.error(`[mc-reflection] Error reading transcripts: ${err}`);
    return `(error reading transcripts: ${err})`;
  }
}

function extractUserMessages(filePath: string, date: string): string[] {
  const messages: string[] = [];
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter(Boolean);

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        // Extract human/user messages from the JSONL
        if (entry.type === "human" || entry.role === "user") {
          const text = entry.message?.content ?? entry.content ?? "";
          if (typeof text === "string" && text.trim()) {
            // Truncate long messages
            const truncated = text.length > 500 ? text.slice(0, 500) + "..." : text;
            messages.push(`- ${truncated.replace(/\n/g, " ")}`);
          }
        }
      } catch { /* skip unparseable lines */ }
    }
  } catch { /* skip unreadable files */ }

  // Cap at 50 messages per session to avoid bloat
  return messages.slice(0, 50);
}

/** Format gathered context as markdown for agent consumption */
export function formatContext(ctx: GatheredContext): string {
  const sections: string[] = [];

  sections.push(`# Reflection Context — ${ctx.date}\n`);

  // Episodic memory
  sections.push(`## Today's Memory\n${ctx.episodic_memory}\n`);
  sections.push(`## Yesterday's Memory\n${ctx.yesterday_memory}\n`);

  // Board state
  const b = ctx.board_snapshot;
  sections.push(`## Board State\n`);
  sections.push(`### In Progress (${b.in_progress.length})`);
  for (const c of b.in_progress) {
    sections.push(formatCard(c));
  }
  sections.push(`\n### In Review (${b.in_review.length})`);
  for (const c of b.in_review) {
    sections.push(formatCard(c));
  }
  sections.push(`\n### Shipped Today (${b.shipped_today.length})`);
  for (const c of b.shipped_today) {
    sections.push(formatCard(c));
  }
  sections.push(`\n### Backlog (${b.backlog.length} cards)`);
  // Only show top 10 backlog items by priority
  for (const c of b.backlog.slice(0, 10)) {
    sections.push(`- **${c.id}** ${c.title} [${c.priority}]`);
  }

  // KB entries
  sections.push(`\n## KB Entries Today (${ctx.recent_kb_entries.length})`);
  for (const kb of ctx.recent_kb_entries) {
    sections.push(`- **${kb.id}** [${kb.type}] ${kb.title} — ${kb.summary}`);
  }

  // Transcripts
  sections.push(`\n## Session Activity\n${ctx.transcript_summary}\n`);

  return sections.join("\n");
}

function formatCard(c: CardSummary): string {
  let line = `- **${c.id}** ${c.title} [${c.priority}]`;
  if (c.tags.length > 0) line += ` (${c.tags.join(", ")})`;
  if (c.work_log_summary) line += `\n  Work: ${c.work_log_summary.replace(/\n/g, "; ")}`;
  if (c.notes) line += `\n  Notes: ${c.notes.slice(0, 200)}`;
  return line;
}
