/**
 * Canonical card sort order — mirrors plugins/mc-board/src/card.ts sortCards().
 * Data layer applies this; components just render in received order.
 *
 * 1. focused (has "focus" tag)
 * 2. active (currently being worked on)
 * 3. priority (critical → high → medium → low)
 * 4. age (oldest first)
 */
import type { Priority } from "./types";

const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

type Sortable = { id: string; tags: string[]; priority: Priority; created_at: string };

export function sortCards<T extends Sortable>(cards: T[], activeIds?: Set<string>): T[] {
  return [...cards].sort((a, b) => {
    const aF = a.tags.includes("focus") ? 0 : 1;
    const bF = b.tags.includes("focus") ? 0 : 1;
    if (aF !== bF) return aF - bF;

    if (activeIds) {
      const aA = activeIds.has(a.id) ? 0 : 1;
      const bA = activeIds.has(b.id) ? 0 : 1;
      if (aA !== bA) return aA - bA;
    }

    const pd = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pd !== 0) return pd;

    return a.created_at < b.created_at ? -1 : 1;
  });
}
