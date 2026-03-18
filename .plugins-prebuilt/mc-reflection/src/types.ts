import { randomBytes } from "node:crypto";

export interface ReflectionEntry {
  id: string;
  date: string;               // YYYY-MM-DD
  created_at: string;         // ISO-8601
  summary: string;            // 3-5 sentence overview
  went_well: string[];        // what worked
  went_wrong: string[];       // what didn't
  lessons: string[];          // key takeaways
  action_items: string[];     // todos created (card IDs or descriptions)
  kb_entries_created: string[];  // KB entry IDs logged
  cards_created: string[];    // board card IDs created
  raw_context: string;        // full gathered context used for reflection
}

export interface ReflectionCreate {
  date: string;
  summary: string;
  went_well?: string[];
  went_wrong?: string[];
  lessons?: string[];
  action_items?: string[];
  kb_entries_created?: string[];
  cards_created?: string[];
  raw_context?: string;
}

export interface GatheredContext {
  date: string;
  episodic_memory: string;      // today's memory file
  yesterday_memory: string;     // yesterday's memory file
  board_snapshot: BoardSnapshot;
  recent_kb_entries: KBSummary[];
  transcript_summary: string;   // summary of session transcripts
}

export interface BoardSnapshot {
  backlog: CardSummary[];
  in_progress: CardSummary[];
  in_review: CardSummary[];
  shipped_today: CardSummary[];
}

export interface CardSummary {
  id: string;
  title: string;
  priority: string;
  tags: string[];
  project_id?: string;
  updated_at: string;
  notes: string;
  work_log_summary: string;
}

export interface KBSummary {
  id: string;
  type: string;
  title: string;
  tags: string[];
  created_at: string;
  summary: string;
}

export function generateReflectionId(): string {
  return `refl_${randomBytes(4).toString("hex")}`;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
