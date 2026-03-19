/**
 * data.ts — board data access layer for the web UI.
 *
 * Reads directly from the SQLite DB (better-sqlite3).
 * Mutations go through the CLI via actions.ts (to enforce gate logic).
 *
 * DB path: $BOARD_DB_PATH or $OPENCLAW_STATE_DIR/USER/brain/board.db
 */

import Database from "better-sqlite3";
import { randomBytes } from "node:crypto";
import * as path from "node:path";
import * as fs from "node:fs";
import type { Card, BoardCard, Column, Priority, Project, ActiveEntry, HistoryEntry, LogEntry, WorkLogEntry, PickupLogEntry, CardTimeline, TimelineEvent, AgentRun } from "./types";

// ---- DB path resolution ----

function resolveDbPath(): string {
  if (process.env.BOARD_DB_PATH) return process.env.BOARD_DB_PATH;
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(require("node:os").homedir(), ".openclaw");
  return path.join(stateDir, "USER", "brain", "board.db");
}

export function getDbPath(): string { return resolveDbPath(); }

// Lazy singleton connection — opened on first call, reused for the lifetime of the process.
let _db: Database.Database | null = null;

export function getDb(): Database.Database | null {
  if (_db) return _db;
  const dbPath = resolveDbPath();
  if (!fs.existsSync(dbPath)) return null;
  try {
    _db = new Database(dbPath);
    // Enable WAL auto-checkpoint so the WAL file doesn't grow unbounded and slow reads
    _db.pragma("wal_autocheckpoint = 100");
    return _db;
  } catch {
    return null;
  }
}

// ---- Row types ----

interface CardRow {
  id: string;
  title: string;
  col: string;
  priority: string;
  tags: string;
  project_id: string | null;
  work_type: string | null;
  linked_card_id: string | null;
  created_at: string;
  updated_at: string;
  problem_description: string;
  implementation_plan: string;
  acceptance_criteria: string;
  notes: string;
  review_notes: string;
  research: string;
  verify_url: string;
  work_log: string;
  depends_on: string;
  attachments: string;
}

interface HistoryRow {
  card_id: string;
  col: string;
  moved_at: string;
}

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  work_dir: string;
  github_repo: string;
}

interface ActiveRow {
  card_id: string;
  project_id: string | null;
  title: string;
  worker: string;
  col: string;
  picked_up_at: string;
}

interface LogRow {
  card_id: string;
  project_id: string | null;
  title: string;
  worker: string;
  col: string;
  action: string;
  at: string;
}

interface AgentRunRow {
  id: string;
  card_id: string;
  column: string;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  exit_code: number | null;
  peak_tokens: number | null;
  tool_call_count: number;
  tool_calls: string;
  log_file: string;
  debug_log_file: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
}

// ---- Card helpers ----

function rowToCard(row: CardRow, history: HistoryRow[]): Card {
  return {
    id: row.id,
    title: row.title,
    column: row.col as Column,
    priority: row.priority as Priority,
    tags: JSON.parse(row.tags) as string[],
    project_id: row.project_id ?? undefined,
    work_type: row.work_type ? (row.work_type as "work" | "verify") : undefined,
    linked_card_id: row.linked_card_id ?? undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
    history: history.map(h => ({ column: h.col as Column, moved_at: h.moved_at })) as HistoryEntry[],
    problem_description: row.problem_description,
    implementation_plan: row.implementation_plan,
    acceptance_criteria: row.acceptance_criteria,
    notes: row.notes,
    review_notes: row.review_notes,
    research: row.research,
    verify_url: row.verify_url ?? "",
    depends_on: (() => { try { return JSON.parse(row.depends_on || "[]") as string[]; } catch { return []; } })(),
    attachments: (() => { try { return JSON.parse(row.attachments || "[]") as import("./types").Attachment[]; } catch { return []; } })(),
    work_log: (() => {
      try {
        const raw = JSON.parse(row.work_log || "[]") as unknown[];
        return raw.map(e => {
          if (typeof e === "string") {
            // Normalize plain strings into WorkLogEntry
            return { at: new Date().toISOString(), worker: "unknown", note: e } as WorkLogEntry;
          }
          const obj = e as Record<string, unknown>;
          return {
            at: (obj.at ?? obj.ts ?? "") as string,
            worker: (obj.worker ?? "") as string,
            note: (obj.note ?? obj.entry ?? "") as string,
            ...(obj.links ? { links: obj.links as string[] } : {}),
          } as WorkLogEntry;
        });
      } catch { return []; }
    })(),
  };
}

function attachHistory(db: Database.Database, cards: Card[]): Card[] {
  if (cards.length === 0) return [];
  const ids = cards.map(c => c.id);
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(
    `SELECT card_id, col, moved_at FROM card_history WHERE card_id IN (${placeholders}) ORDER BY id ASC`,
  ).all(...ids) as HistoryRow[];
  const byCard = new Map<string, HistoryRow[]>();
  for (const r of rows) {
    const list = byCard.get(r.card_id) ?? [];
    list.push(r);
    byCard.set(r.card_id, list);
  }
  return cards.map(c => ({ ...c, history: (byCard.get(c.id) ?? []).map(h => ({ column: h.col as Column, moved_at: h.moved_at })) }));
}

// ---- Public API ----

export function listCards(projectId?: string): Card[] {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = projectId
      ? (db.prepare(`SELECT * FROM cards WHERE project_id = ?`).all(projectId) as CardRow[])
      : (db.prepare(`SELECT * FROM cards`).all() as CardRow[]);
    const cards = rows.map(r => rowToCard(r, []));
    return attachHistory(db, cards);
  } catch { return []; }
}

// ---- Slim board listing (optimized — no heavy text fields) ----

function criteriaCountsFromText(text: string): { checked: number; total: number } {
  const lines = text.replace(/\\n/g, "\n").split("\n").filter(l => /^\s*-\s*\[/.test(l));
  return { total: lines.length, checked: lines.filter(l => /^\s*-\s*\[x\]/i.test(l)).length };
}

interface SlimRow {
  id: string; title: string; col: string; priority: string; tags: string;
  project_id: string | null; work_type: string | null; linked_card_id: string | null;
  created_at: string; updated_at: string; depends_on: string; acceptance_criteria: string;
}

export function listBoardCards(projectId?: string): BoardCard[] {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = projectId
      ? db.prepare(`SELECT id, title, col, priority, tags, project_id, work_type, linked_card_id, created_at, updated_at, depends_on, acceptance_criteria FROM cards WHERE project_id = ?`).all(projectId) as SlimRow[]
      : db.prepare(`SELECT id, title, col, priority, tags, project_id, work_type, linked_card_id, created_at, updated_at, depends_on, acceptance_criteria FROM cards`).all() as SlimRow[];
    return rows.map(r => {
      const { checked, total } = criteriaCountsFromText(r.acceptance_criteria);
      return {
        id: r.id,
        title: r.title,
        column: r.col as Column,
        priority: r.priority as Priority,
        tags: (() => { try { return JSON.parse(r.tags) as string[]; } catch { return []; } })(),
        project_id: r.project_id ?? undefined,
        work_type: r.work_type ? (r.work_type as "work" | "verify") : undefined,
        linked_card_id: r.linked_card_id ?? undefined,
        created_at: r.created_at,
        updated_at: r.updated_at,
        depends_on: (() => { try { return JSON.parse(r.depends_on || "[]") as string[]; } catch { return []; } })(),
        criteria_checked: checked,
        criteria_total: total,
      };
    });
  } catch { return []; }
}

export function getShippedIds(): string[] {
  const db = getDb();
  if (!db) return [];
  try {
    return (db.prepare(`SELECT id FROM cards WHERE col = 'shipped'`).all() as { id: string }[]).map(r => r.id);
  } catch { return []; }
}

/** Create a new card in backlog from a work description (web request). */
export function createCard(description: string): string | null {
  const db = getDb();
  if (!db) return null;
  const id = "crd_" + randomBytes(4).toString("hex");
  const now = new Date().toISOString();
  // Mirror how TG/CLI creates: title = description, everything else defaults
  const title = description.length > 120 ? description.slice(0, 117) + "..." : description;
  db.prepare(
    `INSERT INTO cards
       (id, title, col, priority, tags, project_id, work_type, linked_card_id, depends_on,
        created_at, updated_at,
        problem_description, implementation_plan, acceptance_criteria, notes, review_notes, research, verify_url, work_log)
     VALUES (?, ?, 'backlog', 'medium', '[]', NULL, NULL, NULL, '[]', ?, ?, ?, '', '', '', '', '', '', '[]')`,
  ).run(id, title, now, now, description);
  db.prepare(
    `INSERT INTO card_history (card_id, col, moved_at) VALUES (?, 'backlog', ?)`,
  ).run(id, now);
  return id;
}

export function getCard(id: string): Card | null {
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare(`SELECT * FROM cards WHERE id = ?`).get(id) as CardRow | undefined;
    if (!row) return null;
    const history = db.prepare(
      `SELECT card_id, col, moved_at FROM card_history WHERE card_id = ? ORDER BY id ASC`,
    ).all(row.id) as HistoryRow[];
    return rowToCard(row, history);
  } catch { return null; }
}

export function listProjects(): Project[] {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = db.prepare(
      `SELECT id, name, description, work_dir, github_repo FROM projects WHERE status = 'active' ORDER BY created_at ASC`,
    ).all() as ProjectRow[];
    return rows.map(r => ({ id: r.id, name: r.name, description: r.description, work_dir: r.work_dir || undefined, github_repo: r.github_repo || undefined }));
  } catch { return []; }
}

export function getProject(id: string): Project | null {
  const db = getDb();
  if (!db) return null;
  try {
    const row = db.prepare(
      `SELECT id, name, description, work_dir, github_repo FROM projects WHERE id = ?`,
    ).get(id) as ProjectRow | undefined;
    if (!row) return null;
    return { id: row.id, name: row.name, description: row.description, work_dir: row.work_dir || undefined, github_repo: row.github_repo || undefined };
  } catch { return null; }
}

export function getCardTimeline(id: string): CardTimeline {
  const db = getDb();
  if (!db) return { events: [] };
  try {
    const card = db.prepare(`SELECT * FROM cards WHERE id = ?`).get(id) as CardRow | undefined;
    if (!card) return { events: [] };

    const historyRows = db.prepare(
      `SELECT card_id, col, moved_at FROM card_history WHERE card_id = ? ORDER BY id ASC`,
    ).all(id) as HistoryRow[];

    const pickupRows = db.prepare(
      `SELECT card_id, worker, col, action, at FROM pickup_log WHERE card_id = ? AND action IN ('pickup', 'release') ORDER BY id ASC`,
    ).all(id) as { card_id: string; worker: string; col: string; action: string; at: string }[];

    const workLog: WorkLogEntry[] = (() => {
      try {
        const raw = JSON.parse(card.work_log || "[]") as Array<Record<string, unknown>>;
        return raw.map(e => ({
          at: (e.at ?? e.ts ?? "") as string,
          worker: (e.worker ?? "") as string,
          note: (e.note ?? e.entry ?? "") as string,
          ...(e.links ? { links: e.links as string[] } : {}),
        }));
      } catch { return []; }
    })();

    // Query agent_runs table (primary source for agent run events)
    let agentRunRows: AgentRunRow[] = [];
    try {
      agentRunRows = db.prepare(
        `SELECT id, card_id, column, started_at, ended_at, duration_ms, exit_code, peak_tokens,
                tool_call_count, tool_calls, log_file, debug_log_file,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, cost_usd
         FROM agent_runs WHERE card_id = ? ORDER BY started_at ASC`,
      ).all(id) as AgentRunRow[];
    } catch { /* table may not exist yet on older DBs */ }

    const events: TimelineEvent[] = [
      ...historyRows.map(h => ({ kind: "column" as const, column: h.col as Column, at: h.moved_at })),
      ...pickupRows.map(p => ({ kind: "pickup" as const, worker: p.worker, action: p.action as "pickup" | "release", col: p.col, at: p.at })),
      ...workLog.map(w => ({ kind: "worklog" as const, worker: w.worker, note: w.note, at: w.at, ...(w.links ? { links: w.links } : {}) })),
      ...agentRunRows.map(r => ({
        kind: "agentrun" as const,
        runId: r.id,
        column: r.column,
        durationMs: r.duration_ms,
        exitCode: r.exit_code,
        peakTokens: r.peak_tokens,
        toolCallCount: r.tool_call_count,
        totalTokens: r.total_tokens ?? 0,
        costUsd: r.cost_usd ?? 0,
        at: r.ended_at,
      })),
    ].sort((a, b) => a.at.localeCompare(b.at));

    return { events };
  } catch { return { events: [] }; }
}

export function getAgentRuns(cardId: string): AgentRun[] {
  const db = getDb();
  if (!db) return [];
  try {
    const rows = db.prepare(
      `SELECT id, card_id, column, started_at, ended_at, duration_ms, exit_code, peak_tokens,
              tool_call_count, tool_calls, log_file, debug_log_file,
              input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, cost_usd
       FROM agent_runs WHERE card_id = ? ORDER BY started_at DESC`,
    ).all(cardId) as AgentRunRow[];
    return rows.map(r => ({
      id: r.id,
      cardId: r.card_id,
      column: r.column,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      durationMs: r.duration_ms,
      exitCode: r.exit_code,
      peakTokens: r.peak_tokens,
      toolCallCount: r.tool_call_count,
      toolCalls: (() => { try { return JSON.parse(r.tool_calls); } catch { return []; } })(),
      logFile: r.log_file,
      debugLogFile: r.debug_log_file,
      inputTokens: r.input_tokens ?? 0,
      outputTokens: r.output_tokens ?? 0,
      cacheReadTokens: r.cache_read_tokens ?? 0,
      cacheWriteTokens: r.cache_write_tokens ?? 0,
      totalTokens: r.total_tokens ?? 0,
      costUsd: r.cost_usd ?? 0,
    }));
  } catch { return []; }
}

export function getRecentWorkLog(sinceMs = 60 * 60 * 1000): Array<{ cardId: string; title: string; column: string; at: string; worker: string; note: string }> {
  const db = getDb();
  if (!db) return [];
  try {
    const since = new Date(Date.now() - sinceMs).toISOString();
    const rows = db.prepare(
      `SELECT id, title, col, work_log FROM cards WHERE length(work_log) > 5 ORDER BY updated_at DESC`,
    ).all() as { id: string; title: string; col: string; work_log: string }[];

    const entries: Array<{ cardId: string; title: string; column: string; at: string; worker: string; note: string }> = [];
    for (const row of rows) {
      let log: Array<{ at?: string; worker?: string; note?: string; entry?: string }> = [];
      try { log = JSON.parse(row.work_log); } catch { continue; }
      for (const e of log) {
        const at = e.at ?? "";
        if (at >= since) {
          entries.push({ cardId: row.id, title: row.title, column: row.col, at, worker: e.worker ?? "", note: e.note ?? e.entry ?? "" });
        }
      }
    }
    return entries.sort((a, b) => b.at.localeCompare(a.at));
  } catch { return []; }
}

export function getRecentAgentRuns(sinceMs = 60 * 60 * 1000): AgentRun[] {
  const db = getDb();
  if (!db) return [];
  try {
    const since = new Date(Date.now() - sinceMs).toISOString();
    const rows = db.prepare(
      `SELECT r.id, r.card_id, c.title, r.column, r.started_at, r.ended_at, r.duration_ms,
              r.exit_code, r.peak_tokens, r.tool_call_count, r.tool_calls, r.log_file, r.debug_log_file,
              r.input_tokens, r.output_tokens, r.cache_read_tokens, r.cache_write_tokens, r.total_tokens, r.cost_usd
       FROM agent_runs r
       LEFT JOIN cards c ON c.id = r.card_id
       WHERE r.ended_at >= ?
       ORDER BY r.ended_at DESC
       LIMIT 200`,
    ).all(since) as (AgentRunRow & { title: string | null })[];
    return rows.map(r => ({
      id: r.id,
      cardId: r.card_id,
      title: r.title ?? undefined,
      column: r.column,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      durationMs: r.duration_ms,
      exitCode: r.exit_code,
      peakTokens: r.peak_tokens,
      toolCallCount: r.tool_call_count,
      toolCalls: (() => { try { return JSON.parse(r.tool_calls); } catch { return []; } })(),
      logFile: r.log_file,
      debugLogFile: r.debug_log_file,
      inputTokens: r.input_tokens ?? 0,
      outputTokens: r.output_tokens ?? 0,
      cacheReadTokens: r.cache_read_tokens ?? 0,
      cacheWriteTokens: r.cache_write_tokens ?? 0,
      totalTokens: r.total_tokens ?? 0,
      costUsd: r.cost_usd ?? 0,
    }));
  } catch { return []; }
}

export function getRunningByCol(): Record<string, string[]> {
  const db = getDb();
  if (!db) return {};
  try {
    const rows = db.prepare(
      `SELECT q.card_id, q.col FROM agent_queue q WHERE q.status = 'running'`,
    ).all() as { card_id: string; col: string }[];
    const result: Record<string, string[]> = {};
    for (const r of rows) {
      if (!result[r.col]) result[r.col] = [];
      result[r.col].push(r.card_id);
    }
    return result;
  } catch { return {}; }
}

export function getActiveWork(): { active: ActiveEntry[]; log: LogEntry[] } {
  const db = getDb();
  if (!db) return { active: [], log: [] };
  try {
    const activeRows = db.prepare(`SELECT * FROM active_work`).all() as ActiveRow[];
    const logRows = db.prepare(
      `SELECT card_id, project_id, title, worker, col, action, at FROM pickup_log ORDER BY id DESC LIMIT 200`,
    ).all() as LogRow[];

    const active: ActiveEntry[] = activeRows.map(r => ({
      cardId: r.card_id,
      projectId: r.project_id ?? undefined,
      title: r.title,
      worker: r.worker,
      column: r.col,
      pickedUpAt: r.picked_up_at,
    }));

    const log: LogEntry[] = logRows.map(r => ({
      cardId: r.card_id,
      projectId: r.project_id ?? undefined,
      title: r.title,
      worker: r.worker,
      column: r.col,
      action: r.action,
      at: r.at,
    }));

    return { active, log };
  } catch { return { active: [], log: [] }; }
}
