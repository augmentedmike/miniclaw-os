import type { Card, Column } from "./card.js";
import type { Project } from "./project.js";
import { COLUMNS } from "./state.js";

// ---- Tag Taxonomy ----
// Sourced from ref/BOARD_TAGS.md

export const VALID_TAGS = {
  // Team/Role
  "team-ai": "Work owned by AM (digital agents, automation)",
  "team-human": "Work requiring Michael or human judgment",
  "team-product": "Product direction, strategy, positioning",
  "team-design": "Visual/UX work, design systems",

  // Lifecycle
  "wip": "Work-in-progress",
  "blocked": "Depends on external input or unblocked cards",
  "waiting-feedback": "Awaiting review, approval, or human response",
  "on-hold": "Intentionally paused; not actively worked",
  "shipped": "Released, deployed, or complete",

  // Work Type
  "feature": "New functionality or capability",
  "bug": "Defect, regression, or incorrect behavior",
  "refactor": "Improve or restructure without behavior change",
  "doc": "Documentation, guides, or process docs",
  "test": "Testing infrastructure or test coverage",
  "deploy": "Deployment, CI/CD, release engineering",
  "ops": "Operational work: infrastructure, monitoring",

  // Domain
  "board": "Brain Board itself",
  "kb": "Knowledge Base",
  "designer": "mc-designer plugin",
  "queue": "mc-queue plugin",
  "miniclaw-os": "MiniClaw platform core",
  "am-blog": "AM Comic Blog",
  "substack": "Substack publishing",
  "product": "Product initiatives",
  "infra": "Infrastructure, CI, monitoring",

  // Status Flags
  "focus": "Current priority; pick first",
  "urgent": "Time-sensitive; immediate attention",
  "critical": "High impact; failure blocks other work",
  "breaking-change": "Requires coordination or migration",
  "security": "Security fix or hardening",
  "performance": "Performance optimization",
} as const;

export function validateTag(tag: string): { valid: boolean; message?: string } {
  if (tag in VALID_TAGS) return { valid: true };
  return {
    valid: false,
    message: `Unknown tag: "${tag}". See ref/BOARD_TAGS.md for valid tags.`,
  };
}

export function validateCardTags(tags: string[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const tag of tags) {
    const result = validateTag(tag);
    if (!result.valid && result.message) {
      errors.push(result.message);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function filterCardsByTags(cards: Card[], filterTags: string[]): Card[] {
  if (filterTags.length === 0) return cards;
  return cards.filter(card => filterTags.some(tag => card.tags.includes(tag)));
}

function cardRef(card: Card, boardWebUrl?: string): string {
  if (boardWebUrl) {
    const url = `${boardWebUrl.replace(/\/$/, "")}/board/c/${card.id}`;
    return `[${card.id}](${url})`;
  }
  return card.id;
}

export function renderCompactBoard(cards: Card[], boardWebUrl?: string): string {
  if (cards.length === 0) return "(no cards on board)";

  const lines: string[] = ["## Brain Board", ""];

  for (const col of COLUMNS) {
    const colCards = cards.filter(c => c.column === col);
    if (colCards.length === 0) continue;

    lines.push(`**${col}** (${colCards.length})`);
    for (const card of colCards) {
      const priorityStr = card.priority !== "medium" ? ` [${card.priority}]` : "";
      lines.push(`- ${cardRef(card, boardWebUrl)}: ${card.title}${priorityStr}`);
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
    `project_id: ${card.project_id ?? ""}`,
    `**Pickup count:** ${card.pickup_count ?? 0}`,
    `**Correction count:** ${card.correction_count ?? 0}`,
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
    project.work_dir ? `**Work dir:** ${project.work_dir}` : "",
    project.github_repo ? `**GitHub:** ${project.github_repo}` : "",
    project.build_command ? `**Build command:** \`${project.build_command}\`` : "",
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

export function renderCompactBoardWithProjects(cards: Card[], projects: Project[], boardWebUrl?: string): string {
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
        lines.push(`- ${cardRef(card, boardWebUrl)}: ${card.title}${priorityStr}`);
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
        lines.push(`- ${cardRef(card, boardWebUrl)}: ${card.title}${priorityStr}`);
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
  const priorityScore: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const columnScore: Record<Column, number> = {
    "in-progress": 3,
    "in-review": 2,
    "backlog": 1,
    "shipped": 0,
  };

  const active = cards.filter(c => c.column !== "shipped");
  if (active.length === 0) return null;

  return active.sort((a, b) => {
    // Focus-tagged cards always come first
    const aF = a.tags.includes("focus") ? 1 : 0;
    const bF = b.tags.includes("focus") ? 1 : 0;
    if (aF !== bF) return bF - aF;

    const colDiff = columnScore[b.column] - columnScore[a.column];
    if (colDiff !== 0) return colDiff;
    return (priorityScore[b.priority] ?? 0) - (priorityScore[a.priority] ?? 0);
  })[0] ?? null;
}

/**
 * Render all cards in a column as a rich LLM-ready context block.
 * Grouped by project, ordered by priority desc → created_at asc.
 * Used by the triage worker cron to let Haiku evaluate and select candidates.
 * @param col - Column to render
 * @param cards - All cards
 * @param projects - All projects
 * @param filterTags - Optional tags to filter by (returns only cards with ANY of these tags)
 */
export function renderColumnContext(col: Column, cards: Card[], projects: Project[], filterTags?: string[]): string {
  let colCards = cards.filter(c => c.column === col);
  if (filterTags && filterTags.length > 0) {
    colCards = filterCardsByTags(colCards, filterTags);
  }
  if (colCards.length === 0) return `No cards in ${col}${filterTags ? ` with tags: ${filterTags.join(", ")}` : ""}.`;

  const priorityScore: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const sortCards = (list: Card[]) =>
    [...list].sort((a, b) => {
      // Focus-tagged cards always come first
      const aF = a.tags.includes("focus") ? 1 : 0;
      const bF = b.tags.includes("focus") ? 1 : 0;
      if (aF !== bF) return bF - aF;

      const pd = (priorityScore[b.priority] ?? 0) - (priorityScore[a.priority] ?? 0);
      if (pd !== 0) return pd;
      return a.created_at.localeCompare(b.created_at);
    });

  const projectMap = new Map(projects.map(p => [p.id, p.name]));
  const grouped = new Map<string, Card[]>();
  const unlinked: Card[] = [];

  for (const card of colCards) {
    if (card.project_id) {
      const grp = grouped.get(card.project_id) ?? [];
      grp.push(card);
      grouped.set(card.project_id, grp);
    } else {
      unlinked.push(card);
    }
  }

  const lines: string[] = [
    `# ${col.toUpperCase().replace("-", " ")} COLUMN — ${colCards.length} card(s)`,
    `(ordered by priority desc, then oldest first within each project)`,
    "",
  ];

  const renderCard = (card: Card, idx: number) => {
    const tagsStr = card.tags.length > 0 ? card.tags.join(", ") : "(none)";
    lines.push(`## [${idx + 1}] ${card.id} — ${card.title}`);
    lines.push(`Priority: ${card.priority}  |  Tags: ${tagsStr}  |  Created: ${card.created_at}`);
    lines.push(`Problem: ${card.problem_description || "(empty)"}`);
    lines.push(`Plan: ${card.implementation_plan || "(empty)"}`);
    lines.push(`Criteria: ${card.acceptance_criteria || "(empty)"}`);
    lines.push("");
  };

  let idx = 0;
  for (const [projectId, projectCards] of grouped) {
    const name = projectMap.get(projectId) ?? projectId;
    lines.push(`### Project: ${name} (${projectId})`);
    for (const card of sortCards(projectCards)) renderCard(card, idx++);
  }

  if (unlinked.length > 0) {
    lines.push(`### (No project)`);
    for (const card of sortCards(unlinked)) renderCard(card, idx++);
  }

  return lines.join("\n").trimEnd();
}
