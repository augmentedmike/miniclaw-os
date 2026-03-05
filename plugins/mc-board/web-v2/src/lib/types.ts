export type Column = "backlog" | "in-progress" | "in-review" | "shipped";
export type Priority = "low" | "medium" | "high";

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
  project_id?: string;
  work_type?: "work" | "verify";
  linked_card_id?: string;
  created_at: string;
  updated_at: string;
  history: HistoryEntry[];
  problem_description: string;
  implementation_plan: string;
  acceptance_criteria: string;
  notes: string;
  review_notes: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
}

export interface ActiveEntry {
  cardId: string;
  projectId?: string;
  title?: string;
  worker?: string;
  column?: string;
  pickedUpAt?: string;
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

export interface BoardData {
  cards: Card[];
  projects: Project[];
  activeIds: string[];
  activeWorkers: Record<string, string>;
  log: LogEntry[];
  counts: {
    backlog: number;
    inProgress: number;
    inReview: number;
    shipped: number;
  };
}
