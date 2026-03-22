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
  const f: GateFailure[] = [];
  if (!card.review_notes.trim())
    f.push({ field: "review_notes", reason: "empty — complete the audit/critic pass first" });

  // Require commit hash evidence in review_notes (short or full SHA)
  const shaPattern = /\b[0-9a-f]{7,40}\b/i;
  if (card.review_notes.trim() && !shaPattern.test(card.review_notes))
    f.push({ field: "review_notes", reason: "no commit hash found — include the SHA from `git log` to prove code landed on main" });

  // Require PR merged evidence or explicit "no-pr" marker
  const prPattern = /PR\s*#\d+\s*(merged|MERGED)|merged.*PR|no-pr/i;
  if (card.review_notes.trim() && !prPattern.test(card.review_notes))
    f.push({ field: "review_notes", reason: "no PR merge evidence — include 'PR #N merged' or 'no-pr' if direct push" });

  // Require verify_url evidence if the card has a verify_url set
  if (card.verify_url && card.verify_url.trim()) {
    const verifyPattern = /verify.*(pass|ok|2\d\d|live|confirmed)|HTTP\/[\d.]+ 2\d\d|curl.*2\d\d|status[:\s]+2\d\d|verified live/i;
    if (card.review_notes.trim() && !verifyPattern.test(card.review_notes))
      f.push({ field: "verify_url", reason: `card has verify_url (${card.verify_url}) but review_notes contain no verification evidence — include HTTP status or 'verified live'` });
  }

  return f;
}

function gateNone(_card: Card): GateFailure[] { return []; }

// ---- Transition table ----

export const TRANSITIONS: Transition[] = [
  { from: "backlog",      to: "in-progress", label: "pickup",         trigger: "manual", gate: gatePickup  },
  { from: "in-progress",  to: "in-review",   label: "submit",         trigger: "manual", gate: gateSubmit  },
  { from: "in-review",    to: "shipped",      label: "approve",        trigger: "manual", gate: gateApprove },
  { from: "in-review",    to: "in-progress",  label: "verify failed",  trigger: "system", gate: gateNone    },
  { from: "in-review",    to: "in-progress",  label: "reject",         trigger: "manual", gate: gateNone    },
  { from: "shipped",      to: "backlog",      label: "fail back",      trigger: "manual", gate: gateNone    },
  { from: "shipped",      to: "in-progress",  label: "reopen",         trigger: "manual", gate: gateNone    },
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

// ---- capacity limit check ----

export interface WipLimitResult {
  ok: boolean;
  current: number;
  max: number;
}

/**
 * Check if a column is at or over its capacity limit.
 * Returns { ok: true } if there's room, { ok: false, current, max } if at capacity.
 */
export function checkCapacity(currentCount: number, maxConcurrent: number): WipLimitResult {
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
    lines.push(`  miniclaw brain update CARD_ID --review "Audit passed. Commit abc1234 on main. PR #N merged. verified live — HTTP 200."`);
    lines.push(`  miniclaw brain move CARD_ID ${to}`);
    lines.push(`\nRequired evidence in review_notes:`);
    lines.push(`  • Commit SHA (7+ hex chars)`);
    lines.push(`  • PR evidence: 'PR #N merged' or 'no-pr'`);
    lines.push(`  • If verify_url set: verification result (HTTP status or 'verified live')`);
  }

  return lines.join("\n");
}
