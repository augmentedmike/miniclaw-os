import type { Card, Column } from "./card.js";
import type { Project } from "./project.js";
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

// ---- Project-scoped board rendering ----

export function renderProjectBoard(project: Project, cards: Card[]): string {
  const lines: string[] = [
    `# Project: ${project.name}`,
    project.description ? `*${project.description}*` : "",
    `**Status:** ${project.status}  |  **ID:** ${project.id}`,
    "",
  ].filter(l => l !== "");
  lines.push("");

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
        if (card.column === "in-progress" || card.column === "in-review") {
          const total = (card.acceptance_criteria.match(/^- \[[ x]\]/gm) ?? []).length;
          const checked = (card.acceptance_criteria.match(/^- \[x\]/gm) ?? []).length;
          if (total > 0) lines.push(`         criteria: ${checked}/${total} done`);
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function renderCompactBoardWithProjects(cards: Card[], projects: Project[]): string {
  if (cards.length === 0) return "(no cards on board)";

  const projectMap = new Map(projects.map(p => [p.id, p.name]));
  const lines: string[] = ["## Brain Board", ""];

  // Group by project, then unlinked
  const grouped = new Map<string, Card[]>();
  const unlinked: Card[] = [];

  for (const card of cards) {
    if (card.project_id && projectMap.has(card.project_id)) {
      const grp = grouped.get(card.project_id) ?? [];
      grp.push(card);
      grouped.set(card.project_id, grp);
    } else {
      unlinked.push(card);
    }
  }

  for (const [projectId, projectCards] of grouped) {
    const projectName = projectMap.get(projectId) ?? projectId;
    lines.push(`### ${projectName}`);
    for (const col of COLUMNS) {
      const colCards = projectCards.filter(c => c.column === col);
      if (colCards.length === 0) continue;
      lines.push(`**${col}** (${colCards.length})`);
      for (const card of colCards) {
        const priorityStr = card.priority !== "medium" ? ` [${card.priority}]` : "";
        lines.push(`- ${card.id}: ${card.title}${priorityStr}`);
      }
    }
    lines.push("");
  }

  if (unlinked.length > 0) {
    if (grouped.size > 0) lines.push("### (unlinked)");
    for (const col of COLUMNS) {
      const colCards = unlinked.filter(c => c.column === col);
      if (colCards.length === 0) continue;
      lines.push(`**${col}** (${colCards.length})`);
      for (const card of colCards) {
        const priorityStr = card.priority !== "medium" ? ` [${card.priority}]` : "";
        lines.push(`- ${card.id}: ${card.title}${priorityStr}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function renderProjectList(projects: Project[], cardCounts: Map<string, number>): string {
  if (projects.length === 0) return "No active projects.";

  const lines: string[] = ["# Projects", ""];
  for (const p of projects) {
    const count = cardCounts.get(p.id) ?? 0;
    const desc = p.description ? `  — ${p.description}` : "";
    lines.push(`${p.id}  ${p.name}  (${count} cards)${desc}`);
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
