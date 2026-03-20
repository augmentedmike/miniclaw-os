/**
 * radius.ts — proportional border-radius utility
 *
 * Rule: radius ≈ height × 0.18, clamped to [2, 12].
 * Usage:
 *   import { r } from "@/lib/radius";
 *   style={{ borderRadius: r(28) }}  // → 5
 *   style={{ borderRadius: r(18) }}  // → 3
 *   style={{ borderRadius: r(44) }}  // → 8
 */

export function r(heightPx: number): number {
  return Math.max(2, Math.min(12, Math.round(heightPx * 0.18)));
}

/** Named sizes for common element heights */
export const R = {
  badge:   r(18),  // 3  — tiny badges, tags
  btn:     r(24),  // 4  — small buttons (col header controls)
  input:   r(28),  // 5  — inputs, medium buttons
  card:    r(40),  // 7  — card items
  panel:   r(56),  // 10 — panels, modals
  modal:   r(64),  // 12 — large modals
} as const;
