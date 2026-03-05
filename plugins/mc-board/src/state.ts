import type { Card, Column } from "./card.js";

export const COLUMNS: Column[] = ["backlog", "in-progress", "in-review", "shipped"];

export interface GateFailure {
  field: string;
  reason: string;
}

export type GateResult =
  | { ok: true }
  | { ok: false; failures: GateFailure[] };

export function canTransition(from: Column, to: Column): boolean {
  const fromIdx = COLUMNS.indexOf(from);
  const toIdx = COLUMNS.indexOf(to);
  return toIdx === fromIdx + 1;
}

export function checkGate(card: Card, target: Column): GateResult {
  const failures: GateFailure[] = [];

  if (target === "in-progress") {
    if (!card.title.trim())
      failures.push({ field: "title", reason: "required before starting work" });
    if (!card.problem_description.trim())
      failures.push({ field: "problem_description", reason: "required before starting work" });
    if (!card.implementation_plan.trim())
      failures.push({ field: "implementation_plan", reason: "required before starting work" });
    if (!card.acceptance_criteria.trim())
      failures.push({ field: "acceptance_criteria", reason: "required before starting work" });
    // CRITICAL cards have the same gate requirements as regular cards
    // (title, problem, plan, criteria all required)
    if (card.priority === "critical" && !card.acceptance_criteria.trim())
      failures.push({ field: "acceptance_criteria", reason: "CRITICAL priority requires explicit criteria — must be specific and measurable" });
  }

  if (target === "in-review") {
    // ALL acceptance criteria checkboxes must be checked
    const unchecked = (card.acceptance_criteria.match(/^- \[ \]/gm) ?? []).length;
    if (unchecked > 0)
      failures.push({
        field: "acceptance_criteria",
        reason: `${unchecked} checkbox(es) not yet checked off`,
      });
  }

  if (target === "shipped") {
    if (!card.review_notes.trim())
      failures.push({
        field: "review_notes",
        reason: "empty — complete the audit/critic pass first",
      });
  }

  if (failures.length === 0) return { ok: true };
  return { ok: false, failures };
}

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
          case "title": return `    --title "..."`;
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
