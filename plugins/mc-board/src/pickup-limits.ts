/**
 * pickup-limits.ts — max pickup limits, auto-correction, and human alerts.
 *
 * Problem: Cards get picked up and dropped repeatedly without progressing.
 * Fix:
 *   - Track pickup_count per card (incremented in ActiveWorkStore.pickup())
 *   - Enforce per-column max limits
 *   - Auto-correct stuck cards by moving them forward
 *   - Alert human via TG when global correction threshold is hit
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { Card, Column } from "./card.js";
import type { CardStore } from "./store.js";

// ---- Max pickup limits per column ----

export const MAX_PICKUPS: Record<Column, number> = {
  backlog: 3,
  "in-progress": 10,
  "in-review": 2,
  shipped: Infinity, // shipped cards are never picked up again
};

// Correction threshold — alert human when this many corrections happen
const CORRECTION_ALERT_THRESHOLD = 3;

// ---- State file for global correction counter ----

const DEFAULT_STATE_DIR =
  (process.env.OPENCLAW_STATE_DIR ?? "").trim() ||
  path.join(os.homedir(), ".openclaw");

interface CorrectionState {
  count: number;
  lastResetAt: string;
  lastAlertAt?: string;
}

function getCorrectionStatePath(stateDir: string): string {
  return path.join(stateDir, "USER", "brain", "correction-state.json");
}

export function readCorrectionState(stateDir = DEFAULT_STATE_DIR): CorrectionState {
  const p = getCorrectionStatePath(stateDir);
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as CorrectionState;
  } catch {
    return { count: 0, lastResetAt: new Date().toISOString() };
  }
}

export function writeCorrectionState(state: CorrectionState, stateDir = DEFAULT_STATE_DIR): void {
  const p = getCorrectionStatePath(stateDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2), "utf8");
}

export function incrementGlobalCorrections(stateDir = DEFAULT_STATE_DIR): CorrectionState {
  const state = readCorrectionState(stateDir);

  // Auto-reset daily
  const lastReset = new Date(state.lastResetAt);
  const now = new Date();
  if (
    now.getFullYear() !== lastReset.getFullYear() ||
    now.getMonth() !== lastReset.getMonth() ||
    now.getDate() !== lastReset.getDate()
  ) {
    const fresh: CorrectionState = { count: 1, lastResetAt: now.toISOString() };
    writeCorrectionState(fresh, stateDir);
    return fresh;
  }

  const updated: CorrectionState = { ...state, count: state.count + 1 };
  writeCorrectionState(updated, stateDir);
  return updated;
}

export function resetCorrectionState(stateDir = DEFAULT_STATE_DIR): void {
  writeCorrectionState(
    { count: 0, lastResetAt: new Date().toISOString() },
    stateDir,
  );
}

// ---- Limit checks ----

/** Returns true if the card has exceeded the max pickup limit for its column. */
export function isOverLimit(card: Card, column: Column): boolean {
  const max = MAX_PICKUPS[column];
  if (!isFinite(max)) return false;
  return (card.pickup_count ?? 0) >= max;
}

// ---- Auto-correction ----

/** Correction transitions: where does a stuck card in each column go? */
const CORRECTION_MOVES: Partial<Record<Column, { target: Column; addHoldTag?: boolean }>> = {
  backlog: { target: "in-progress" },
  "in-progress": { target: "in-review" },
  "in-review": { target: "backlog", addHoldTag: true },
};

export interface AutoCorrectionResult {
  cardId: string;
  title: string;
  fromColumn: Column;
  toColumn: Column;
  holdTagAdded: boolean;
  note: string;
}

/**
 * Auto-correct a stuck card by moving it forward (or back to backlog+hold
 * if it's stuck in in-review). Also increments correction_count.
 * Returns the correction result or null if no correction path exists.
 */
export function autoCorrect(
  card: Card,
  column: Column,
  store: CardStore,
): AutoCorrectionResult | null {
  const move = CORRECTION_MOVES[column];
  if (!move) return null;

  const { target, addHoldTag } = move;
  const now = new Date().toISOString();

  // Move card to target column
  store.move(card, target);

  // Add hold tag if needed (stuck in-review → backlog + hold)
  const tags = [...(card.tags ?? [])];
  if (addHoldTag && !tags.includes("hold")) {
    tags.push("hold");
    store.update(card.id, { tags });
  }

  // Increment correction_count
  store.incrementCorrectionCount(card.id);

  // Append correction note to card notes
  const correctionNote =
    `[AUTO-CORRECTED ${now}] Card stuck in ${column} after ${card.pickup_count} pickups. ` +
    `Moved to ${target}${addHoldTag ? " + hold tag added" : ""}.`;
  const existingNotes = card.notes?.trim() ?? "";
  store.update(card.id, {
    notes: existingNotes ? `${existingNotes}\n\n${correctionNote}` : correctionNote,
  });

  return {
    cardId: card.id,
    title: card.title,
    fromColumn: column,
    toColumn: target,
    holdTagAdded: addHoldTag ?? false,
    note: correctionNote,
  };
}

// ---- TG alert ----

/**
 * Send a TG alert when the correction threshold is hit.
 * Uses the Telegram bot token from env.
 */
export async function maybeSendCorrectionAlert(
  correctionState: CorrectionState,
  botToken: string,
  chatId: string,
  stateDir = DEFAULT_STATE_DIR,
): Promise<boolean> {
  if (!botToken || !chatId) return false;
  if (correctionState.count < CORRECTION_ALERT_THRESHOLD) return false;

  // Throttle: don't alert more than once per hour
  if (correctionState.lastAlertAt) {
    const lastAlert = new Date(correctionState.lastAlertAt).getTime();
    if (Date.now() - lastAlert < 60 * 60 * 1000) return false;
  }

  const text =
    `⚠️ <b>Board auto-correction threshold hit</b>\n` +
    `${correctionState.count} corrections today. Cards may be stuck.\n` +
    `Please review the board and check stuck cards.`;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      },
    );
    if (res.ok) {
      // Record that we sent an alert
      writeCorrectionState(
        { ...correctionState, lastAlertAt: new Date().toISOString() },
        stateDir,
      );
      return true;
    }
  } catch {
    // Non-fatal — alert failed but correction still happened
  }
  return false;
}
