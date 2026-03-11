export type Column = "backlog" | "in-progress" | "in-review" | "on-hold" | "shipped";
export type Priority = "low" | "medium" | "high" | "critical";

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
  research: string;
  verify_url: string;
  work_log: WorkLogEntry[];
  depends_on: string[];
  attachments: Attachment[];
}

export interface Attachment {
  path: string;
  label?: string;
  mime?: string;
  created_at: string;
}

export interface WorkLogEntry {
  at: string;
  worker: string;
  note: string;
  links?: string[];
}

export interface PickupLogEntry {
  cardId: string;
  worker: string;
  col: string;
  action: "pickup" | "release";
  at: string;
}

export interface AgentRun {
  id: string;
  cardId: string;
  title?: string;
  column: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  exitCode: number | null;
  peakTokens: number | null;
  toolCallCount: number;
  toolCalls: Array<{ name: string; detail: string }>;
  logFile: string;
  debugLogFile: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd: number;
}

export type TimelineEvent =
  | { kind: "column"; column: Column; at: string }
  | { kind: "pickup"; worker: string; action: "pickup" | "release"; col: string; at: string }
  | { kind: "worklog"; worker: string; note: string; at: string; links?: string[] }
  | { kind: "agentrun"; runId: string; column: string; durationMs: number; exitCode: number | null; peakTokens: number | null; toolCallCount: number; totalTokens: number; costUsd: number; at: string };

export interface CardTimeline {
  events: TimelineEvent[];
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  work_dir?: string;
  github_repo?: string;
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

// Slim card used in the board listing — only fields needed to render cards in columns.
// Heavy fields (problem, plan, notes, research, work_log, attachments, history) are
// deferred to the individual GET /api/card/[id] fetch that fires when a card is opened.
export interface BoardCard {
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
  depends_on: string[];
  criteria_checked: number;
  criteria_total: number;
}

export interface WorkLogEntry2 {
  cardId: string;
  title: string;
  column: string;
  at: string;
  worker: string;
  note: string;
}

export interface BoardData {
  cards: BoardCard[];
  projects: Project[];
  activeIds: string[];
  activeWorkers: Record<string, string>;
  log: LogEntry[];
  agentRuns: AgentRun[];
  workLog: WorkLogEntry2[];
  runningByCol: Record<string, string[]>;
  counts: {
    backlog: number;
    inProgress: number;
    inReview: number;
    shipped: number;
  };
  globalShippedIds: string[];
}
