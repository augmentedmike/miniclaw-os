/**
 * mc-memory — Smart routing engine
 *
 * Determines where a memory_write should go:
 *   - memo: session-specific, card-scoped notes (failed approaches, env quirks)
 *   - kb: generalizable knowledge (errors+fixes, workflows, facts, how-tos)
 *   - episodic: daily observations without clear structure
 *
 * Uses keyword scoring + optional vector novelty detection.
 */

import type { KBStore } from "./types.js";
import type { Embedder } from "./types.js";

export type MemoryTarget = "memo" | "kb" | "episodic";

export interface RouteContext {
  cardId?: string;
  source?: string;
}

export interface RouteResult {
  target: MemoryTarget;
  confidence: number; // 0..1
  reason: string;
  kbType?: string; // suggested KB entry type if target is "kb"
}

// Keyword signal groups
const MEMO_SIGNALS = [
  "tried", "failed", "don't retry", "do not retry", "doesn't work",
  "broke", "reverted", "rolled back", "env conflict", "timeout",
  "step completed", "already done", "migrated", "do not re-run",
  "workaround", "session", "this card", "this run",
];

const KB_SIGNALS = [
  "solution", "fix", "resolved", "answer", "because",
  "always", "never", "rule", "pattern", "workflow",
  "how to", "howto", "guide", "tutorial", "procedure",
  "fact", "definition", "note that", "remember",
  "error", "exception", "stack trace", "caused by",
  "lesson", "learned", "takeaway", "insight",
  "postmortem", "root cause", "prevention",
];

const KB_TYPE_SIGNALS: Record<string, string[]> = {
  error: ["error", "exception", "stack trace", "caused by", "fix", "solution", "resolved"],
  workflow: ["workflow", "process", "pipeline", "procedure", "steps to", "automation"],
  howto: ["how to", "howto", "guide", "tutorial", "to do this"],
  fact: ["fact", "definition", "note that", "remember", "always", "never", "rule"],
  lesson: ["lesson", "learned", "takeaway", "insight", "next time"],
  postmortem: ["postmortem", "root cause", "prevention", "incident", "outage"],
};

function countSignals(text: string, signals: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const signal of signals) {
    if (lower.includes(signal)) count++;
  }
  return count;
}

function detectKbType(text: string): string {
  const lower = text.toLowerCase();
  let bestType = "fact";
  let bestScore = 0;

  for (const [type, signals] of Object.entries(KB_TYPE_SIGNALS)) {
    const score = countSignals(lower, signals);
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  return bestType;
}

export function route(content: string, context?: RouteContext): RouteResult {
  const memoScore = countSignals(content, MEMO_SIGNALS);
  const kbScore = countSignals(content, KB_SIGNALS);

  // Strong signal: if cardId is set AND content has memo signals, prefer memo
  const hasCardContext = !!context?.cardId;

  // Scoring with context bias
  const adjustedMemo = memoScore + (hasCardContext ? 2 : 0);
  const adjustedKb = kbScore;

  // Decision
  if (adjustedMemo > adjustedKb && adjustedMemo >= 1) {
    return {
      target: "memo",
      confidence: Math.min(adjustedMemo / 5, 1),
      reason: `Card-scoped note (memo signals: ${memoScore}, card context: ${hasCardContext})`,
    };
  }

  if (adjustedKb >= 2) {
    const kbType = detectKbType(content);
    return {
      target: "kb",
      confidence: Math.min(adjustedKb / 5, 1),
      reason: `Generalizable knowledge (kb signals: ${kbScore}, detected type: ${kbType})`,
      kbType,
    };
  }

  // Fallback: if card context, go to memo; otherwise episodic
  if (hasCardContext) {
    return {
      target: "memo",
      confidence: 0.3,
      reason: "Default to memo (card context present, no strong signals)",
    };
  }

  return {
    target: "episodic",
    confidence: 0.3,
    reason: "Default to episodic (no card context, no strong signals)",
  };
}
