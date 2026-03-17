/**
 * pickup-limits.ts — max pickup limits, auto-correction, and human alerts.
 * Web app (Next.js) variant — uses direct SQLite via getDb().
 *
 * Problem: Cards get picked up and dropped repeatedly without progressing.
 * Fix:
 *   - Check pickup_count per card before firing
 *   - Auto-correct stuck cards by moving them forward
 *   - Alert human via TG when global correction threshold is hit
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { getDb } from "@/lib/data";
import type { Card, Column } from "@/lib/types";

// ---- Max pickup limits per column ----

export const MAX_PICKUPS: Record<string, number> = {
  backlog: 3,
  "in-progress": 10,
  "in-review": 2,
};

// Correction threshold — alert human when this many corrections happen
const CORRECTION_ALERT_THRESHOLD = 3;

const STATE_DIR =
  (process.env.OPENCLAW_STATE_DIR ?? "").trim() ||
  path.join(os.homedir(), ".openclaw");

// ---- Limit check ----

/** Returns true if the card has exceeded the max pickup limit for its column. */
export function isOverLimit(card: Card, column: string): boolean {
  const max = MAX_PICKUPS[column];
  if (max === undefined) return false;
  return (card.pickup_count ?? 0) >= max;
}

// ---- Auto-correction (direct SQL, no CardStore dependency) ----

/** Correction transitions per column. */
const CORRECTION_MOVES: Record<string, { target: Column; addHoldTag?: boolean }> = {
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
 * Auto-correct a stuck card. Moves it forward in the column flow.
 * in-review → backlog+hold (last resort, needs human review).
 */
export function autoCorrectCard(card: Card, column: string): AutoCorrectionResult | null {
  const move = CORRECTION_MOVES[column];
  if (!move) return null;

  const db = getDb();
  if (!db) return null;

  const { target, addHoldTag } = move;
  const now = new Date().toISOString();

  // Move card to target column
  db.prepare("UPDATE cards SET col = ?, updated_at = ? WHERE id = ?").run(target, now, card.id);
  db.prepare("INSERT INTO card_history (card_id, col, moved_at) VALUES (?, ?, ?)").run(card.id, target, now);

  // Add hold tag if needed
  let holdTagAdded = false;
  if (addHoldTag) {
    const row = db.prepare("SELECT tags FROM cards WHERE id = ?").get(card.id) as { tags: string } | undefined;
    let tags: string[] = [];
    try { tags = JSON.parse(row?.tags ?? "[]"); } catch { /* empty */ }
    if (!tags.includes("hold")) {
      tags.push("hold");
      db.prepare("UPDATE cards SET tags = ? WHERE id = ?").run(JSON.stringify(tags), card.id);
      holdTagAdded = true;
    }
  }

  // Increment correction_count
  db.prepare("UPDATE cards SET correction_count = correction_count + 1 WHERE id = ?").run(card.id);

  // Append correction note
  const correctionNote =
    `[AUTO-CORRECTED ${now}] Stuck in ${column} after ${card.pickup_count} pickups. ` +
    `Moved to ${target}${holdTagAdded ? " + hold tag added" : ""}.`;
  const existingNotes = (card.notes ?? "").trim();
  const newNotes = existingNotes ? `${existingNotes}\n\n${correctionNote}` : correctionNote;
  db.prepare("UPDATE cards SET notes = ? WHERE id = ?").run(newNotes, card.id);

  return {
    cardId: card.id,
    title: card.title,
    fromColumn: column as Column,
    toColumn: target,
    holdTagAdded,
    note: correctionNote,
  };
}

// ---- Global correction counter ----

interface CorrectionState {
  count: number;
  lastResetAt: string;
  lastAlertAt?: string;
}

function getCorrectionStatePath(): string {
  return path.join(STATE_DIR, "USER", "brain", "correction-state.json");
}

export function readCorrectionState(): CorrectionState {
  const p = getCorrectionStatePath();
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as CorrectionState;
  } catch {
    return { count: 0, lastResetAt: new Date().toISOString() };
  }
}

function writeCorrectionState(state: CorrectionState): void {
  const p = getCorrectionStatePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2), "utf8");
}

export function incrementGlobalCorrections(): CorrectionState {
  const state = readCorrectionState();

  // Auto-reset daily
  const lastReset = new Date(state.lastResetAt);
  const now = new Date();
  if (
    now.getFullYear() !== lastReset.getFullYear() ||
    now.getMonth() !== lastReset.getMonth() ||
    now.getDate() !== lastReset.getDate()
  ) {
    const fresh: CorrectionState = { count: 1, lastResetAt: now.toISOString() };
    writeCorrectionState(fresh);
    return fresh;
  }

  const updated: CorrectionState = { ...state, count: state.count + 1 };
  writeCorrectionState(updated);
  return updated;
}

export function resetCorrectionState(): void {
  writeCorrectionState({ count: 0, lastResetAt: new Date().toISOString() });
}

// ---- TG alert ----

/** Send a TG alert when correction threshold is hit. */
export async function maybeSendCorrectionAlert(
  correctionState: CorrectionState,
  botToken: string,
  chatId: string,
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
      writeCorrectionState({ ...correctionState, lastAlertAt: new Date().toISOString() });
      return true;
    }
  } catch {
    // Non-fatal
  }
  return false;
}
