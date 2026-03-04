/**
 * mc-kb — KBEntry interface, ID generation, and helpers
 */

import { randomBytes } from "node:crypto";

export type EntryType = "fact" | "workflow" | "guide" | "howto" | "error" | "postmortem";
export type Severity = "low" | "medium" | "high";

export interface KBEntry {
  id: string;             // kb_<8hex>
  type: EntryType;
  title: string;
  content: string;        // markdown body
  summary?: string;       // 1-2 sentence overview
  tags: string[];
  source?: string;        // "conversation", "cli", url, file path
  severity?: Severity;    // for errors/postmortems
  created_at: string;     // ISO-8601
  updated_at: string;     // ISO-8601
}

export type KBEntryCreate = Omit<KBEntry, "id" | "created_at" | "updated_at"> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type KBEntryPatch = Partial<Pick<KBEntry, "type" | "title" | "content" | "summary" | "tags" | "source" | "severity">>;

export function generateKbId(): string {
  return `kb_${randomBytes(4).toString("hex")}`;
}

export function now(): string {
  return new Date().toISOString();
}

/** Render a compact single-line summary for context injection */
export function formatEntryLine(entry: KBEntry): string {
  const tagStr = entry.tags.length > 0 ? ` [${entry.tags.join(", ")}]` : "";
  const summary = entry.summary ?? entry.content.slice(0, 120).replace(/\n/g, " ");
  return `[${entry.type}] ${entry.title} (${entry.id})${tagStr}\n> ${summary}`;
}

/** Render a full entry as markdown (for qmd export) */
export function entryToMarkdown(entry: KBEntry): string {
  const lines: string[] = [
    "---",
    `id: ${entry.id}`,
    `type: ${entry.type}`,
    `title: "${entry.title.replace(/"/g, '\\"')}"`,
    `tags: [${entry.tags.map((t) => `"${t}"`).join(", ")}]`,
  ];
  if (entry.summary) lines.push(`summary: "${entry.summary.replace(/"/g, '\\"')}"`);
  if (entry.source) lines.push(`source: "${entry.source}"`);
  if (entry.severity) lines.push(`severity: ${entry.severity}`);
  lines.push(`created_at: ${entry.created_at}`);
  lines.push(`updated_at: ${entry.updated_at}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${entry.title}`);
  lines.push("");
  lines.push(entry.content);
  return lines.join("\n");
}

export const VALID_TYPES: EntryType[] = ["fact", "workflow", "guide", "howto", "error", "postmortem"];
export const VALID_SEVERITIES: Severity[] = ["low", "medium", "high"];

export function validateType(t: string): EntryType {
  if (!VALID_TYPES.includes(t as EntryType)) {
    throw new Error(`Invalid type: "${t}". Valid types: ${VALID_TYPES.join(", ")}`);
  }
  return t as EntryType;
}
