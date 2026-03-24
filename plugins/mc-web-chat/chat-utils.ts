/**
 * Pure, testable utility functions extracted from server.ts.
 * These are used by server.ts internals and imported by tests.
 */
import { log } from "./logger.js";

// ---- Context management config ----
export const MAX_HISTORY = 30;
export const MAX_IMAGES_IN_HISTORY = 2;
export const IMAGE_PLACEHOLDER = "[image was shared earlier in conversation]";
export const CONTEXT_PRESSURE_PCT = 80;
export const TOKEN_BUDGET = 800_000;
export const MIN_TURNS_BEFORE_RESTART = 4;

export interface HistoryMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  hasImage?: boolean;
  timestamp: number;
  replyTo?: string;
}

export interface TrimTarget {
  messages: HistoryMessage[];
}

export interface ContextCheckTarget {
  proc: unknown;
  lastReportedContextUsed: number;
  turnCount: number;
  contextWindow: number;
}

// ---- Token estimator (~4 chars per token, images ~1000 tokens) ----
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function trimHistory(target: TrimTarget): void {
  if (target.messages.length > MAX_HISTORY) {
    const dropped = target.messages.length - MAX_HISTORY;
    target.messages = target.messages.slice(-MAX_HISTORY);
    log.debug(`trimmed ${dropped} old messages, keeping ${MAX_HISTORY}`);
  }
}

export function pruneImageFlags(messages: HistoryMessage[]): void {
  let imagesKept = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].hasImage) {
      if (imagesKept >= MAX_IMAGES_IN_HISTORY) {
        messages[i].hasImage = false;
      } else {
        imagesKept++;
      }
    }
  }
}

export function buildHistoryReplay(messages: HistoryMessage[]): string {
  if (messages.length === 0) return "";

  let totalTokens = 0;
  for (const m of messages) {
    totalTokens += estimateTokens(m.content) + 10;
  }

  const MAX_REPLAY_TOKENS = 40_000;
  let replayMessages = messages;

  if (totalTokens > MAX_REPLAY_TOKENS) {
    const first = messages.slice(0, 2);
    const firstTokens = first.reduce((sum, m) => sum + estimateTokens(m.content) + 10, 0);
    const budget = MAX_REPLAY_TOKENS - firstTokens - 200;

    const recent: HistoryMessage[] = [];
    let used = 0;
    for (let i = messages.length - 1; i >= 2; i--) {
      const cost = estimateTokens(messages[i].content) + 10;
      if (used + cost > budget) break;
      recent.unshift(messages[i]);
      used += cost;
    }

    const dropped = messages.length - first.length - recent.length;
    replayMessages = [
      ...first,
      { role: "assistant" as const, content: `[...${dropped} earlier messages omitted...]`, timestamp: 0 },
      ...recent,
    ];
  }

  const lines = replayMessages.map((m) => {
    let line = `[${m.role}]: ${m.content}`;
    if (m.hasImage) line += ` ${IMAGE_PLACEHOLDER}`;
    if (m.replyTo) {
      const target = messages.find(t => t.id === m.replyTo);
      if (target) {
        const snippet = target.content.slice(0, 60) + (target.content.length > 60 ? "..." : "");
        line = `[${m.role} replying to ${target.role}: "${snippet}"]: ${m.content}`;
      } else {
        line = `[${m.role} replying to a pruned message]: ${m.content}`;
      }
    }
    return line;
  });

  return `<conversation-history>\n${lines.join("\n\n")}\n</conversation-history>`;
}

export function shouldRestartForContext(target: ContextCheckTarget): boolean {
  if (!target.proc || target.lastReportedContextUsed === 0) return false;
  if (target.turnCount <= MIN_TURNS_BEFORE_RESTART) return false;
  const pct = (target.lastReportedContextUsed / target.contextWindow) * 100;
  if (pct >= CONTEXT_PRESSURE_PCT) {
    log.warn(`context pressure ${pct.toFixed(0)}% >= ${CONTEXT_PRESSURE_PCT}% — scheduling restart (turn ${target.turnCount})`);
    return true;
  }
  return false;
}
