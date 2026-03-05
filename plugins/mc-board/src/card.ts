import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export type Column = "backlog" | "in-progress" | "in-review" | "shipped";
export type Priority = "critical" | "high" | "medium" | "low";

export interface HistoryEntry {
  column: Column;
  moved_at: string;
}

export interface Card {
  id: string;
  title: string;
  column: Column;
  priority: Priority;
  tags: string[];
  project_id?: string;    // optional — links card to a Project (prj_<hex>)
  work_type?: 'work' | 'verify';  // optional — designates work vs verification card
  linked_card_id?: string;        // optional — for verify cards, links to source work card
  created_at: string;
  updated_at: string;
  history: HistoryEntry[];
  // Body sections
  problem_description: string;
  implementation_plan: string;
  acceptance_criteria: string;
  notes: string;
  review_notes: string;
}

export function generateId(): string {
  return "crd_" + randomBytes(4).toString("hex");
}

export function cardFilename(card: Card): string {
  const slug = card.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${card.id}-${slug}.md`;
}

// ---- Frontmatter parser ----
// Handles the specific YAML subset we generate. No external deps.

function parseFrontmatter(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = raw.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines
    if (!line.trim()) { i++; continue; }

    // Only handle top-level keys (no leading spaces)
    if (line.startsWith(" ") || line.startsWith("\t")) { i++; continue; }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) { i++; continue; }

    const key = line.slice(0, colonIdx).trim();
    const rest = line.slice(colonIdx + 1).trim();

    if (!key) { i++; continue; }

    if (rest === "") {
      // Nested list — i is advanced inside the inner loops
      const items: Record<string, string>[] = [];
      i++;
      while (i < lines.length) {
        const subLine = lines[i];
        if (!subLine.startsWith("  ")) break;

        const trimmed = subLine.trimStart();
        if (trimmed.startsWith("- ")) {
          const item: Record<string, string> = {};
          const firstPart = trimmed.slice(2);
          if (firstPart.includes(":")) {
            const ci = firstPart.indexOf(":");
            const k = firstPart.slice(0, ci).trim();
            const v = firstPart.slice(ci + 1).trim();
            if (k) item[k] = v;
          }
          i++;
          // Collect continuation lines for this item (4-space indent)
          while (i < lines.length && lines[i].startsWith("    ")) {
            const st = lines[i].trimStart();
            if (st.includes(":")) {
              const ci = st.indexOf(":");
              const k = st.slice(0, ci).trim();
              const v = st.slice(ci + 1).trim();
              if (k) item[k] = v;
            }
            i++;
          }
          items.push(item);
        } else {
          i++;
        }
      }
      result[key] = items;
      // i already advanced — do NOT increment again below
    } else {
      // Single-line value: always advance i by 1
      if (rest.startsWith("[") && rest.endsWith("]")) {
        const inner = rest.slice(1, -1).trim();
        result[key] = inner === "" ? [] : inner.split(",").map(s => s.trim()).filter(Boolean);
      } else if (rest.startsWith('"') && rest.endsWith('"')) {
        result[key] = rest.slice(1, -1).replace(/\\"/g, '"');
      } else {
        result[key] = rest;
      }
      i++;
    }
  }

  return result;
}

// ---- Body section parser ----

interface BodySections {
  problem_description: string;
  implementation_plan: string;
  acceptance_criteria: string;
  notes: string;
  review_notes: string;
}

function parseBody(bodyText: string): BodySections {
  const sectionMap: Record<string, keyof BodySections> = {
    "problem description": "problem_description",
    "implementation plan": "implementation_plan",
    "acceptance criteria": "acceptance_criteria",
    "notes / outcome": "notes",
    "review notes": "review_notes",
  };

  const result: BodySections = {
    problem_description: "",
    implementation_plan: "",
    acceptance_criteria: "",
    notes: "",
    review_notes: "",
  };

  const parts = bodyText.split(/^## /m);
  for (const part of parts) {
    if (!part.trim()) continue;
    const newlineIdx = part.indexOf("\n");
    const header = (newlineIdx === -1 ? part : part.slice(0, newlineIdx)).trim();
    const content = newlineIdx === -1 ? "" : part.slice(newlineIdx + 1).trimEnd();

    const fieldKey = sectionMap[header.toLowerCase()];
    if (fieldKey) {
      result[fieldKey] = content.trim();
    }
  }

  return result;
}

// ---- Parse a full card file ----

export function parseCard(content: string): Card {
  if (!content.startsWith("---")) {
    throw new Error("Invalid card: missing frontmatter");
  }

  const endFm = content.indexOf("\n---", 3);
  if (endFm === -1) {
    throw new Error("Invalid card: unclosed frontmatter");
  }

  const fmRaw = content.slice(4, endFm); // skip "---\n"
  const bodyRaw = content.slice(endFm + 4); // skip "\n---"

  const fm = parseFrontmatter(fmRaw);
  const body = parseBody(bodyRaw);

  const history: HistoryEntry[] = [];
  if (Array.isArray(fm.history)) {
    for (const item of fm.history as Array<Record<string, string>>) {
      if (item.column && item.moved_at) {
        history.push({ column: item.column as Column, moved_at: item.moved_at });
      }
    }
  }

  const tags: string[] = Array.isArray(fm.tags)
    ? (fm.tags as string[])
    : [];

  const project_id = fm.project_id ? String(fm.project_id) : undefined;
  const work_type = fm.work_type && (fm.work_type === 'work' || fm.work_type === 'verify')
    ? (fm.work_type as 'work' | 'verify')
    : undefined;
  const linked_card_id = fm.linked_card_id ? String(fm.linked_card_id) : undefined;

  return {
    id: String(fm.id ?? ""),
    title: String(fm.title ?? ""),
    column: (fm.column as Column) ?? "backlog",
    priority: (fm.priority as Priority) ?? "medium",
    tags,
    ...(project_id ? { project_id } : {}),
    ...(work_type ? { work_type } : {}),
    ...(linked_card_id ? { linked_card_id } : {}),
    created_at: String(fm.created_at ?? new Date().toISOString()),
    updated_at: String(fm.updated_at ?? new Date().toISOString()),
    history,
    ...body,
  };
}

// ---- Serialize a card to markdown ----

export function serializeCard(card: Card): string {
  const tagsStr = card.tags.length > 0 ? `[${card.tags.join(", ")}]` : "[]";
  const historyLines = card.history.map(h =>
    `  - column: ${h.column}\n    moved_at: ${h.moved_at}`
  ).join("\n");

  const title = card.title.replace(/"/g, '\\"');

  const projectLine = card.project_id ? `project_id: ${card.project_id}\n` : "";
  const workTypeLine = card.work_type ? `work_type: ${card.work_type}\n` : "";
  const linkedCardLine = card.linked_card_id ? `linked_card_id: ${card.linked_card_id}\n` : "";

  const frontmatter =
    `---\n` +
    `id: ${card.id}\n` +
    `title: "${title}"\n` +
    `column: ${card.column}\n` +
    `priority: ${card.priority}\n` +
    `tags: ${tagsStr}\n` +
    projectLine +
    workTypeLine +
    linkedCardLine +
    `created_at: ${card.created_at}\n` +
    `updated_at: ${card.updated_at}\n` +
    `history:\n` +
    historyLines +
    `\n---`;

  const body =
    `\n\n## Problem Description\n${card.problem_description}\n` +
    `\n## Implementation Plan\n${card.implementation_plan}\n` +
    `\n## Acceptance Criteria\n${card.acceptance_criteria}\n` +
    `\n## Notes / Outcome\n${card.notes}\n` +
    `\n## Review Notes\n${card.review_notes}\n`;

  return frontmatter + body;
}
