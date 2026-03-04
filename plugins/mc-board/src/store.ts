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
    const cards = files.map(f => this._read(f));
    if (column) return cards.filter(c => c.column === column);
    // Sort: newest updated_at first within column order
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
