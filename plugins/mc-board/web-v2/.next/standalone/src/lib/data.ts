import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "js-yaml";
import type { Card, Column, Priority, Project, ActiveEntry, HistoryEntry } from "./types";

function resolvePath(p: string): string {
  return p.startsWith("~") ? p.replace("~", process.env.HOME ?? "") : p;
}

const CARDS_DIR = resolvePath(process.env.BOARD_CARDS_DIR ?? "");
const PROJECTS_DIR = resolvePath(process.env.BOARD_PROJECTS_DIR ?? "");
const ACTIVE_WORK = resolvePath(process.env.BOARD_ACTIVE_WORK ?? "");

function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  try {
    const meta = yaml.load(match[1]) as Record<string, unknown>;
    return { meta: meta ?? {}, body: match[2] };
  } catch {
    return { meta: {}, body: raw };
  }
}

function parseBody(body: string): Record<string, string> {
  const sections: Record<string, string> = {
    problem_description: "",
    implementation_plan: "",
    acceptance_criteria: "",
    notes: "",
    review_notes: "",
  };
  let current = "";
  const SECTION_MAP: Record<string, string> = {
    "problem description": "problem_description",
    "implementation plan": "implementation_plan",
    "acceptance criteria": "acceptance_criteria",
    "notes / outcome": "notes",
    "notes": "notes",
    "review notes": "review_notes",
  };
  for (const line of body.split("\n")) {
    const hm = line.match(/^##\s+(.+)$/);
    if (hm) {
      current = SECTION_MAP[hm[1].toLowerCase()] ?? "";
      continue;
    }
    if (current) sections[current] = (sections[current] + "\n" + line).trimStart();
  }
  for (const k of Object.keys(sections)) sections[k] = sections[k].trim();
  return sections;
}

export function parseCard(content: string): Card {
  const { meta, body } = parseFrontmatter(content);
  const sections = parseBody(body);
  const historyRaw = (meta.history as Array<{ column: string; moved_at: string }>) ?? [];
  return {
    id: String(meta.id ?? ""),
    title: String(meta.title ?? ""),
    column: (meta.column as Column) ?? "backlog",
    priority: (meta.priority as Priority) ?? "medium",
    tags: (meta.tags as string[]) ?? [],
    project_id: meta.project_id ? String(meta.project_id) : undefined,
    work_type: meta.work_type ? (String(meta.work_type) as "work" | "verify") : undefined,
    linked_card_id: meta.linked_card_id ? String(meta.linked_card_id) : undefined,
    created_at: String(meta.created_at ?? ""),
    updated_at: String(meta.updated_at ?? ""),
    history: historyRaw.map(h => ({ column: h.column as Column, moved_at: h.moved_at })) as HistoryEntry[],
    problem_description: sections.problem_description ?? "",
    implementation_plan: sections.implementation_plan ?? "",
    acceptance_criteria: sections.acceptance_criteria ?? "",
    notes: sections.notes ?? "",
    review_notes: sections.review_notes ?? "",
  };
}

export function listCards(projectId?: string): Card[] {
  if (!CARDS_DIR || !fs.existsSync(CARDS_DIR)) return [];
  const files = fs.readdirSync(CARDS_DIR).filter(f => f.endsWith(".md"));
  const byId = new Map<string, Card>();
  for (const f of files) {
    try {
      const content = fs.readFileSync(path.join(CARDS_DIR, f), "utf-8");
      const card = parseCard(content);
      const existing = byId.get(card.id);
      if (!existing || card.updated_at > existing.updated_at) byId.set(card.id, card);
    } catch { /* skip */ }
  }
  const cards = [...byId.values()];
  return projectId ? cards.filter(c => c.project_id === projectId) : cards;
}

export function getCard(id: string): Card | null {
  if (!CARDS_DIR || !fs.existsSync(CARDS_DIR)) return null;
  const files = fs.readdirSync(CARDS_DIR).filter(f => f.startsWith(id) && f.endsWith(".md"));
  if (!files[0]) return null;
  try {
    const content = fs.readFileSync(path.join(CARDS_DIR, files[0]), "utf-8");
    return parseCard(content);
  } catch { return null; }
}

export function listProjects(): Project[] {
  if (!PROJECTS_DIR || !fs.existsSync(PROJECTS_DIR)) return [];
  const files = fs.readdirSync(PROJECTS_DIR).filter(f => f.endsWith(".json"));
  return files.flatMap(f => {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(PROJECTS_DIR, f), "utf-8"));
      return [{ id: raw.id, name: raw.name ?? f.replace(".json", ""), description: raw.description }];
    } catch { return []; }
  });
}

export function getActiveIds(): string[] {
  if (!ACTIVE_WORK || !fs.existsSync(ACTIVE_WORK)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(ACTIVE_WORK, "utf-8"));
    return (data.active as ActiveEntry[] ?? []).map(e => e.cardId);
  } catch { return []; }
}

export function getActiveWorkers(): Record<string, string> {
  if (!ACTIVE_WORK || !fs.existsSync(ACTIVE_WORK)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(ACTIVE_WORK, "utf-8"));
    const result: Record<string, string> = {};
    for (const e of (data.active as ActiveEntry[] ?? [])) {
      if (e.worker) result[e.cardId] = e.worker.replace("board-worker-", "");
    }
    return result;
  } catch { return {}; }
}

export interface LogEntry {
  cardId: string;
  worker?: string;
  title?: string;
  column?: string;
  action: string;
  at: string;
  projectId?: string;
}

export function getActiveWork(): { active: ActiveEntry[]; log: LogEntry[] } {
  if (!ACTIVE_WORK || !fs.existsSync(ACTIVE_WORK)) return { active: [], log: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(ACTIVE_WORK, "utf-8"));
    return {
      active: raw.active ?? [],
      log: raw.log ?? [],
    };
  } catch { return { active: [], log: [] }; }
}
