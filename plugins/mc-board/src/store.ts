import type { Database } from "./db.js";
import type { Card, Column, Priority } from "./card.js";
import { generateId } from "./card.js";
import { type TitleConflict, findTitleConflict } from "./dedup.js";

type WorkType = "work" | "verify";

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
}

interface HistoryRow {
  card_id: string;
  col: string;
  moved_at: string;
}

function rowToCard(row: CardRow, history: HistoryRow[]): Card {
  return {
    id: row.id,
    title: row.title,
    column: row.col as Column,
    priority: row.priority as Priority,
    tags: JSON.parse(row.tags) as string[],
    ...(row.project_id ? { project_id: row.project_id } : {}),
    ...(row.work_type ? { work_type: row.work_type as WorkType } : {}),
    ...(row.linked_card_id ? { linked_card_id: row.linked_card_id } : {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
    history: history.map(h => ({ column: h.col as Column, moved_at: h.moved_at })),
    problem_description: row.problem_description,
    implementation_plan: row.implementation_plan,
    acceptance_criteria: row.acceptance_criteria,
    notes: row.notes,
    review_notes: row.review_notes,
    research: row.research,
  };
}

export class CardStore {
  private readonly db: Database;

  // Compat shim — kept so any remaining archive CLI code that reads
  // store.cardsDir doesn't blow up before fully migrated away.
  readonly cardsDir: string = "";

  constructor(db: Database) {
    this.db = db;
  }

  create(opts: {
    title: string;
    priority?: Priority;
    tags?: string[];
    project_id?: string;
    work_type?: WorkType;
    linked_card_id?: string;
  }): Card {
    const now = new Date().toISOString();
    const id = generateId();
    this.db.prepare(
      `INSERT INTO cards
         (id, title, col, priority, tags, project_id, work_type, linked_card_id,
          created_at, updated_at,
          problem_description, implementation_plan, acceptance_criteria, notes, review_notes, research)
       VALUES (?, ?, 'backlog', ?, ?, ?, ?, ?, ?, ?, '', '', '', '', '', '')`,
    ).run(
      id,
      opts.title,
      opts.priority ?? "medium",
      JSON.stringify(opts.tags ?? []),
      opts.project_id ?? null,
      opts.work_type ?? null,
      opts.linked_card_id ?? null,
      now,
      now,
    );
    this.db.prepare(
      `INSERT INTO card_history (card_id, col, moved_at) VALUES (?, 'backlog', ?)`,
    ).run(id, now);
    return this.findById(id);
  }

  findById(id: string): Card {
    const row = this.db.prepare(`SELECT * FROM cards WHERE id = ?`).get(id) as CardRow | undefined;
    if (!row) throw new Error(`Card not found: ${id}`);
    return this._withHistory(row);
  }

  list(column?: Column): Card[] {
    const rows = column
      ? (this.db.prepare(`SELECT * FROM cards WHERE col = ?`).all(column) as CardRow[])
      : (this.db.prepare(`SELECT * FROM cards`).all() as CardRow[]);
    return rows.map(r => this._withHistory(r));
  }

  listByProject(projectId: string): Card[] {
    const rows = this.db.prepare(`SELECT * FROM cards WHERE project_id = ?`).all(projectId) as CardRow[];
    return rows.map(r => this._withHistory(r));
  }

  update(
    id: string,
    updates: Partial<Pick<Card,
      | "title" | "priority" | "tags" | "project_id" | "work_type" | "linked_card_id"
      | "problem_description" | "implementation_plan" | "acceptance_criteria"
      | "notes" | "review_notes" | "research"
    >>,
  ): Card {
    const card = this.findById(id);
    const now = new Date().toISOString();
    const m = { ...card, ...updates };
    this.db.prepare(
      `UPDATE cards
       SET title=?, priority=?, tags=?, project_id=?, work_type=?, linked_card_id=?,
           problem_description=?, implementation_plan=?, acceptance_criteria=?,
           notes=?, review_notes=?, research=?, updated_at=?
       WHERE id=?,
    ).run(
      m.title,
      m.priority,
      JSON.stringify(m.tags),
      m.project_id ?? null,
      m.work_type ?? null,
      m.linked_card_id ?? null,
      m.problem_description,
      m.implementation_plan,
      m.acceptance_criteria,
      m.notes,
      m.review_notes,
      m.research,
      now,
      id,
    );
    return this.findById(id);
  }

  move(card: Card, target: Column): Card {
    const now = new Date().toISOString();
    this.db.prepare(`UPDATE cards SET col=?, updated_at=? WHERE id=?`).run(target, now, card.id);
    this.db.prepare(
      `INSERT INTO card_history (card_id, col, moved_at) VALUES (?, ?, ?)`,
    ).run(card.id, target, now);
    return this.findById(card.id);
  }

  delete(id: string): void {
    const exists = this.db.prepare(`SELECT id FROM cards WHERE id = ?`).get(id);
    if (!exists) throw new Error(`Card not found: ${id}`);
    this.db.prepare(`DELETE FROM cards WHERE id = ?`).run(id);
  }

  checkTitleConflict(title: string, opts?: { projectId?: string; excludeId?: string }): TitleConflict | null {
    let candidates = this.list().filter(c => c.column !== "shipped");
    if (opts?.projectId) candidates = candidates.filter(c => c.project_id === opts.projectId);
    return findTitleConflict(title, candidates, opts?.excludeId);
  }

  // SQLite PRIMARY KEY guarantees no duplicates — always returns empty map.
  detectDuplicates(): Map<string, string[]> {
    return new Map();
  }

  private _withHistory(row: CardRow): Card {
    const history = this.db.prepare(
      `SELECT card_id, col, moved_at FROM card_history WHERE card_id = ? ORDER BY id ASC`,
    ).all(row.id) as HistoryRow[];
    return rowToCard(row, history);
  }
}
