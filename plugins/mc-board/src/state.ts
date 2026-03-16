import type { Card, Column } from "./card.js";

// ---- State machine definition ----
//
//   backlog ──pickup──► in-progress ──submit──► in-review ──approve──► shipped
//                                                    │
//                                              verify failed
//                                            (system only, auto)
//                                                    │
//                                                    ▼
//                                              in-progress

export interface GateFailure {
  field: string;
  reason: string;
}

export type GateResult =
  | { ok: true }
  | { ok: false; failures: GateFailure[] };

type GateFn = (card: Card) => GateFailure[];

export type TransitionTrigger = "manual" | "system";

export interface Transition {
  from: Column;
  to: Column;
  label: string;
  trigger: TransitionTrigger;
  gate: GateFn;
}

// ---- Gate functions (one per transition) ----

function gatePickup(card: Card): GateFailure[] {
  const f: GateFailure[] = [];
  if (!card.title.trim())
    f.push({ field: "title", reason: "required before starting work" });
  if (!card.problem_description.trim())
    f.push({ field: "problem_description", reason: "required before starting work" });
  if (!card.implementation_plan.trim())
    f.push({ field: "implementation_plan", reason: "required before starting work" });
  if (!card.acceptance_criteria.trim())
    f.push({ field: "acceptance_criteria", reason: "required before starting work" });
  return f;
}

function gateSubmit(card: Card): GateFailure[] {
  const unchecked = (card.acceptance_criteria.match(/^- \[ \]/gm) ?? []).length;
  if (unchecked > 0)
    return [{ field: "acceptance_criteria", reason: `${unchecked} checkbox(es) not yet checked off` }];
  return [];
}

function gateApprove(card: Card): GateFailure[] {
  if (!card.review_notes.trim())
    return [{ field: "review_notes", reason: "empty — complete the audit/critic pass first" }];
  return [];
}

function gateNone(_card: Card): GateFailure[] { return []; }

// ---- Transition table ----

export const TRANSITIONS: Transition[] = [
  { from: "backlog",      to: "in-progress", label: "pickup",         trigger: "manual", gate: gatePickup  },
  { from: "in-progress",  to: "in-review",   label: "submit",         trigger: "manual", gate: gateSubmit  },
  { from: "in-review",    to: "shipped",      label: "approve",        trigger: "manual", gate: gateApprove },
  { from: "in-review",    to: "in-progress",  label: "verify failed",  trigger: "system", gate: gateNone    },
];

export const COLUMNS: Column[] = ["backlog", "in-progress", "in-review", "shipped"];

// ---- Lookup helpers ----

export function getTransition(from: Column, to: Column): Transition | undefined {
  return TRANSITIONS.find(t => t.from === from && t.to === to);
}

/** Returns true if this is a valid manual transition. */
export function canTransition(from: Column, to: Column): boolean {
  const t = getTransition(from, to);
  return t !== undefined && t.trigger === "manual";
}

/** Returns true if this is a valid system-triggered transition. */
export function canTransitionSystem(from: Column, to: Column): boolean {
  const t = getTransition(from, to);
  return t !== undefined && t.trigger === "system";
}

export function checkGate(card: Card, target: Column): GateResult {
  const t = getTransition(card.column, target);
  if (!t) return { ok: false, failures: [{ field: "column", reason: `no transition defined from "${card.column}" to "${target}"` }] };
  const failures = t.gate(card);
  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}

// ---- WIP limit check ----

export interface WipLimitResult {
  ok: boolean;
  current: number;
  max: number;
}

/**
 * Check if a column is at or over its WIP limit.
 * Returns { ok: true } if there's room, { ok: false, current, max } if at capacity.
 */
export function checkWipLimit(currentCount: number, maxConcurrent: number): WipLimitResult {
  if (currentCount >= maxConcurrent) {
    return { ok: false, current: currentCount, max: maxConcurrent };
  }
  return { ok: true, current: currentCount, max: maxConcurrent };
}

// ---- Error formatting ----

export function formatGateError(from: Column, to: Column, failures: GateFailure[]): string {
  const lines: string[] = [
    `GATE VIOLATION: ${from} → ${to}`,
    "",
    "Unmet conditions:",
  ];

  for (const f of failures) {
    lines.push(`  ✗ ${f.field}  ${f.reason}`);
  }

  lines.push("");
  lines.push("Fix with:");

  if (from === "backlog" && to === "in-progress") {
    const fieldArgs = failures
      .map(f => {
        switch (f.field) {
          case "problem_description": return `    --problem "..."`;
          case "implementation_plan": return `    --plan "..."`;
          case "acceptance_criteria": return `    --criteria "- [ ] ..."`;
          case "title":               return `    --title "..."`;
          default: return `    --${f.field.replace(/_/g, "-")} "..."`;
        }
      })
      .join(" \\\n");
    lines.push(`  miniclaw brain update CARD_ID \\\n${fieldArgs}`);
    lines.push(`  miniclaw brain move CARD_ID ${to}`);
  } else if (to === "in-review") {
    lines.push(`  miniclaw brain update CARD_ID --criteria "- [x] thing one\\n- [x] thing two"`);
    lines.push(`  miniclaw brain move CARD_ID ${to}`);
  } else if (to === "shipped") {
    lines.push(`  miniclaw brain update CARD_ID --review "Audit passed. Logic correct, no edge cases missed."`);
    lines.push(`  miniclaw brain move CARD_ID ${to}`);
  }

  return lines.join("\n");
}
