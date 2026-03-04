import * as fs from "node:fs";
import * as path from "node:path";
import {
  type Card,
  type Column,
  type Priority,
  cardFilename,
  generateId,
  parseCard,
  serializeCard,
} from "./card.js";

export class CardStore {
  readonly cardsDir: string;

  constructor(cardsDir: string) {
    this.cardsDir = cardsDir;
    fs.mkdirSync(cardsDir, { recursive: true });
  }

  create(opts: {
    title: string;
    priority?: Priority;
    tags?: string[];
    project_id?: string;
  }): Card {
    const now = new Date().toISOString();
    const card: Card = {
      id: generateId(),
      title: opts.title,
      column: "backlog",
      priority: opts.priority ?? "medium",
      tags: opts.tags ?? [],
      ...(opts.project_id ? { project_id: opts.project_id } : {}),
      created_at: now,
      updated_at: now,
      history: [{ column: "backlog", moved_at: now }],
      problem_description: "",
      implementation_plan: "",
      acceptance_criteria: "",
      notes: "",
      review_notes: "",
    };
    this._write(card);
    return card;
  }

  findById(id: string): Card {
    const files = this._cardFiles();
    const file = files.find(f => f.startsWith(id));
    if (!file) throw new Error(`Card not found: ${id}`);
    return this._read(file);
  }

  list(column?: Column): Card[] {
    const files = this._cardFiles();
    // Deduplicate by ID — keep the most recently updated file per ID
    const byId = new Map<string, Card>();
    for (const f of files) {
      try {
        const card = this._read(f);
        const existing = byId.get(card.id);
        if (!existing || card.updated_at > existing.updated_at) {
          byId.set(card.id, card);
        }
      } catch {
        // skip unparseable files
      }
    }
    const cards = [...byId.values()];
    if (column) return cards.filter(c => c.column === column);
    return cards;
  }

  listByProject(projectId: string): Card[] {
    return this.list().filter(c => c.project_id === projectId);
  }

  update(
    id: string,
    updates: Partial<
      Pick<
        Card,
        | "title"
        | "priority"
        | "tags"
        | "project_id"
        | "problem_description"
        | "implementation_plan"
        | "acceptance_criteria"
        | "notes"
        | "review_notes"
      >
    >,
  ): Card {
    const card = this.findById(id);
    const oldFilename = cardFilename(card);

    Object.assign(card, updates);
    card.updated_at = new Date().toISOString();

    // If title changed, delete old file so we don't accumulate stale files
    const newFilename = cardFilename(card);
    if (oldFilename !== newFilename) {
      try {
        fs.unlinkSync(path.join(this.cardsDir, oldFilename));
      } catch {
        // Best-effort cleanup
      }
    }

    this._write(card);
    return card;
  }

  move(card: Card, target: Column): Card {
    const now = new Date().toISOString();
    card.column = target;
    card.updated_at = now;
    card.history.push({ column: target, moved_at: now });
    this._write(card);
    return card;
  }

  /**
   * Detect duplicate card IDs across files. Returns a map of id → filenames[].
   * Any entry with filenames.length > 1 is a duplicate.
   */
  detectDuplicates(): Map<string, string[]> {
    const seen = new Map<string, string[]>();
    for (const f of this._cardFiles()) {
      try {
        const card = this._read(f);
        const files = seen.get(card.id) ?? [];
        files.push(f);
        seen.set(card.id, files);
      } catch {
        // ignore unparseable files
      }
    }
    return new Map([...seen.entries()].filter(([, files]) => files.length > 1));
  }

  private _cardFiles(): string[] {
    return fs.readdirSync(this.cardsDir).filter(f => f.endsWith(".md"));
  }

  private _read(filename: string): Card {
    const content = fs.readFileSync(path.join(this.cardsDir, filename), "utf-8");
    return parseCard(content);
  }

  private _write(card: Card): void {
    const filename = cardFilename(card);
    fs.writeFileSync(path.join(this.cardsDir, filename), serializeCard(card), "utf-8");
  }
}
