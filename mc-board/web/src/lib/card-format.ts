/**
 * card-format.ts — SQL ↔ Markdown adapter
 *
 * cardToMarkdown(card) → structured .md string (for AI prompts, QMD indexing, card detail view)
 * parseApplyBlock(text) → array of { id, priority?, tags?, research? } (from Claude's ---APPLY--- block)
 */

import type { Card, Priority, WorkLogEntry } from "./types";

// ---- SQL → Markdown ----

// Unescape literal \n stored by CLI (shell escaping artefact)
function unescape(s: string): string { return s.replace(/\\n/g, "\n"); }

export function cardToMarkdown(card: Card): string {
  const lines: string[] = [];

  lines.push(`# [${card.id}] ${card.title}`);
  lines.push("");
  lines.push(`**priority:** ${card.priority}`);
  if (card.tags.length > 0) lines.push(`**tags:** ${card.tags.join(", ")}`);
  if (card.work_type) lines.push(`**type:** ${card.work_type}`);
  if (card.project_id) lines.push(`**project:** ${card.project_id}`);
  if (card.linked_card_id) lines.push(`**linked:** ${card.linked_card_id}`);

  if (card.problem_description) {
    lines.push("");
    lines.push("## Problem");
    lines.push(unescape(card.problem_description));
  }

  if (card.research) {
    lines.push("");
    lines.push("## Research");
    lines.push(unescape(card.research));
  } else {
    lines.push("");
    lines.push("## Research");
    lines.push("*(needs research — queued for agent pass)*");
  }

  if (card.implementation_plan) {
    lines.push("");
    lines.push("## Implementation Plan");
    lines.push(unescape(card.implementation_plan));
  }

  if (card.acceptance_criteria) {
    lines.push("");
    lines.push("## Acceptance Criteria");
    lines.push(unescape(card.acceptance_criteria));
  }

  if (card.notes) {
    lines.push("");
    lines.push("## Notes");
    lines.push(unescape(card.notes));
  }

  if (card.review_notes) {
    lines.push("");
    lines.push("## Review Notes");
    lines.push(unescape(card.review_notes));
  }

  lines.push("");
  lines.push("## Work Log");
  if (card.work_log && card.work_log.length > 0) {
    for (const entry of card.work_log) {
      lines.push(`### ${entry.at.slice(0, 16).replace("T", " ")} · ${entry.worker}`);
      if (entry.note) lines.push(entry.note);
      if (entry.links?.length) {
        for (const link of entry.links) lines.push(`- ${link}`);
      }
      lines.push("");
    }
  } else {
    lines.push("*(no work logged yet)*");
  }

  return lines.join("\n");
}

// ---- Compact summary for AI prompts (triage pass) ----

export function cardToTriageSummary(card: Card): string {
  const lines: string[] = [];
  lines.push(`[${card.id}] ${card.title}`);
  lines.push(`  priority: ${card.priority}`);
  lines.push(`  tags: ${card.tags.join(", ") || "none"}`);
  if (card.problem_description) lines.push(`  problem: ${card.problem_description.slice(0, 300)}`);
  if (card.implementation_plan) lines.push(`  plan: ${card.implementation_plan.slice(0, 300)}`);
  if (card.acceptance_criteria) lines.push(`  criteria: ${card.acceptance_criteria.slice(0, 300)}`);
  if (card.verify_url) lines.push(`  verify_url: ${card.verify_url}`);
  const hasResearch = card.research && card.research.trim() && !card.research.includes("needs research");
  lines.push(`  research: ${hasResearch ? card.research.slice(0, 200) : "(empty)"}`);
  const logCount = card.work_log?.length ?? 0;
  if (logCount > 0) {
    const last = card.work_log[logCount - 1];
    lines.push(`  work_log: ${logCount} entries — last by ${last.worker} at ${last.at.slice(0, 16).replace("T", " ")}`);
    if (last.note) lines.push(`    last note: ${last.note.slice(0, 150)}`);
  }
  return lines.join("\n");
}

// ---- Markdown → SQL updates (parse Claude's ---APPLY--- block) ----

export interface CardUpdate {
  id: string;
  priority?: Priority;
  tags?: string[];
  research?: string;
  move_to?: string;
}

const VALID_PRIORITIES = new Set(["low", "medium", "high", "critical"]);

export function parseApplyBlock(text: string): CardUpdate[] {
  const match = text.match(/---APPLY---\s*([\s\S]*?)---END---/);
  if (!match) return [];

  try {
    const raw = JSON.parse(match[1].trim()) as Array<Record<string, unknown>>;
    if (!Array.isArray(raw)) return [];

    return raw.flatMap(item => {
      const id = String(item.id ?? "");
      if (!id || !id.startsWith("crd_")) return [];

      const update: CardUpdate = { id };

      if (typeof item.priority === "string" && VALID_PRIORITIES.has(item.priority)) {
        update.priority = item.priority as Priority;
      }

      if (Array.isArray(item.tags)) {
        update.tags = item.tags.map(String).filter(Boolean);
      }

      if (typeof item.research === "string" && item.research.trim()) {
        update.research = item.research.trim();
      }

      if (typeof item.move_to === "string" && item.move_to.trim()) {
        update.move_to = item.move_to.trim();
      }

      return [update];
    });
  } catch {
    return [];
  }
}
