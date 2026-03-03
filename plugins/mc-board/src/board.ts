import type { Card, Column } from "./card.js";
import { COLUMNS } from "./state.js";

export function renderCompactBoard(cards: Card[]): string {
  if (cards.length === 0) return "(no cards on board)";

  const lines: string[] = ["## Brain Board", ""];

  for (const col of COLUMNS) {
    const colCards = cards.filter(c => c.column === col);
    if (colCards.length === 0) continue;

    lines.push(`**${col}** (${colCards.length})`);
    for (const card of colCards) {
      const priorityStr = card.priority !== "medium" ? ` [${card.priority}]` : "";
      lines.push(`- ${card.id}: ${card.title}${priorityStr}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function renderFullBoard(cards: Card[]): string {
  if (cards.length === 0) return "No cards on the board.";

  const lines: string[] = ["# Brain Board", ""];

  for (const col of COLUMNS) {
    const colCards = cards.filter(c => c.column === col);
    const colLabel = col.toUpperCase().replace("-", " ");
    lines.push(`## ${colLabel} (${colCards.length})`);

    if (colCards.length === 0) {
      lines.push("  (empty)");
    } else {
      for (const card of colCards) {
        const tagsStr = card.tags.length > 0 ? `  tags: [${card.tags.join(", ")}]` : "";
        lines.push(`  [${card.priority.toUpperCase()}] ${card.id}: ${card.title}`);
        if (tagsStr) lines.push(`         ${tagsStr}`);

        // Show criteria progress for active cards
        if (card.column === "in-progress" || card.column === "in-review") {
          const total = (card.acceptance_criteria.match(/^- \[[ x]\]/gm) ?? []).length;
          const checked = (card.acceptance_criteria.match(/^- \[x\]/gm) ?? []).length;
          if (total > 0) {
            lines.push(`         criteria: ${checked}/${total} done`);
          }
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function renderCardDetail(card: Card): string {
  const lines: string[] = [
    `# ${card.id}: ${card.title}`,
    ``,
    `**Column:** ${card.column}`,
    `**Priority:** ${card.priority}`,
    `**Tags:** ${card.tags.length > 0 ? card.tags.join(", ") : "(none)"}`,
    `**Created:** ${card.created_at}`,
    `**Updated:** ${card.updated_at}`,
    ``,
    `## Problem Description`,
    card.problem_description || "(empty)",
    ``,
    `## Implementation Plan`,
    card.implementation_plan || "(empty)",
    ``,
    `## Acceptance Criteria`,
    card.acceptance_criteria || "(empty)",
    ``,
    `## Notes / Outcome`,
    card.notes || "(empty)",
    ``,
    `## Review Notes`,
    card.review_notes || "(empty)",
    ``,
    `## History`,
  ];

  for (const h of card.history) {
    lines.push(`- ${h.column} at ${h.moved_at}`);
  }

  return lines.join("\n");
}

export function suggestNext(cards: Card[]): Card | null {
  const priorityScore: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const columnScore: Record<Column, number> = {
    "in-progress": 3,
    "in-review": 2,
    "backlog": 1,
    "shipped": 0,
  };

  const active = cards.filter(c => c.column !== "shipped");
  if (active.length === 0) return null;

  return active.sort((a, b) => {
    const colDiff = columnScore[b.column] - columnScore[a.column];
    if (colDiff !== 0) return colDiff;
    return (priorityScore[b.priority] ?? 0) - (priorityScore[a.priority] ?? 0);
  })[0] ?? null;
}
