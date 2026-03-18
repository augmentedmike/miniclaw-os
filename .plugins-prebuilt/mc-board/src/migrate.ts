/**
 * migrate.ts — one-shot migration from markdown/JSON files to SQLite.
 *
 * Called by openDb on first use (empty cards table).
 * Reads existing .md card files + .json project files + active-work.json
 * and imports everything into the SQLite DB.
 *
 * Safe to call multiple times — re-entry is guarded by row count check.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Database } from "./db.js";
import { parseCard } from "./card.js";
import type { Project } from "./project.js";

export function migrateIfNeeded(db: Database, stateDir: string): void {
  const row = db.prepare("SELECT COUNT(*) AS c FROM cards").get() as { c: number };
  if (row.c > 0) return;

  const cardsDir = path.join(stateDir, "cards");
  const projectsDir = path.join(stateDir, "projects");
  const activeWorkFile = path.join(stateDir, "active-work.json");

  let migratedCards = 0;
  let migratedProjects = 0;

  // ---- Migrate projects first (cards may reference them) ----
  if (fs.existsSync(projectsDir)) {
    const insertProject = db.prepare(
      `INSERT OR IGNORE INTO projects (id, name, slug, description, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const f of fs.readdirSync(projectsDir).filter(f => f.endsWith(".json"))) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(projectsDir, f), "utf-8")) as Project;
        insertProject.run(
          raw.id,
          raw.name,
          raw.slug ?? raw.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40),
          raw.description ?? "",
          raw.status ?? "active",
          raw.created_at ?? new Date().toISOString(),
          raw.updated_at ?? new Date().toISOString(),
        );
        migratedProjects++;
      } catch { /* skip unparseable */ }
    }
  }

  // ---- Migrate cards from .md files ----
  if (fs.existsSync(cardsDir)) {
    const insertCard = db.prepare(
      `INSERT OR IGNORE INTO cards
         (id, title, col, priority, tags, project_id, work_type, linked_card_id,
          created_at, updated_at,
          problem_description, implementation_plan, acceptance_criteria, notes, review_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertHistory = db.prepare(
      `INSERT INTO card_history (card_id, col, moved_at) VALUES (?, ?, ?)`,
    );

    const seenIds = new Set<string>();
    for (const f of fs.readdirSync(cardsDir).filter(f => f.endsWith(".md")).sort()) {
      try {
        const content = fs.readFileSync(path.join(cardsDir, f), "utf-8");
        const card = parseCard(content);
        if (!card.id || seenIds.has(card.id)) continue;
        seenIds.add(card.id);

        insertCard.run(
          card.id,
          card.title,
          card.column,
          card.priority,
          JSON.stringify(card.tags),
          card.project_id ?? null,
          card.work_type ?? null,
          card.linked_card_id ?? null,
          card.created_at,
          card.updated_at,
          card.problem_description,
          card.implementation_plan,
          card.acceptance_criteria,
          card.notes,
          card.review_notes,
        );

        for (const h of card.history) {
          insertHistory.run(card.id, h.column, h.moved_at);
        }

        migratedCards++;
      } catch { /* skip unparseable */ }
    }
  }

  // ---- Migrate active-work.json ----
  if (fs.existsSync(activeWorkFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(activeWorkFile, "utf-8")) as {
        active: Array<{ cardId: string; projectId?: string; title: string; worker: string; column: string; pickedUpAt: string }>;
        log: Array<{ cardId: string; projectId?: string; title?: string; worker: string; column?: string; action: string; at: string }>;
      };

      const insertActive = db.prepare(
        `INSERT OR IGNORE INTO active_work (card_id, project_id, title, worker, col, picked_up_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      const insertLog = db.prepare(
        `INSERT INTO pickup_log (card_id, project_id, title, worker, col, action, at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );

      for (const e of raw.active ?? []) {
        insertActive.run(e.cardId, e.projectId ?? null, e.title, e.worker, e.column, e.pickedUpAt);
      }
      for (const e of raw.log ?? []) {
        insertLog.run(e.cardId, e.projectId ?? null, e.title ?? "", e.worker, e.column ?? "", e.action, e.at);
      }
    } catch { /* skip if malformed */ }
  }

  if (migratedCards > 0 || migratedProjects > 0) {
    console.error(`[mc-board] migrated ${migratedCards} cards, ${migratedProjects} projects → SQLite`);
  }
}
