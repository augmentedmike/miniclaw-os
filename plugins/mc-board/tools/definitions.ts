import { spawnSync } from "node:child_process";
import type { AnyAgentTool } from "openclaw/plugin-sdk";

// Raw JSON schema for tool parameters — avoids TypeBox dependency
// while remaining compatible with openclaw's tool pipeline.

function schema(props: Record<string, unknown>, required?: string[]): unknown {
  return {
    type: "object",
    properties: props,
    required: required ?? [],
    additionalProperties: false,
  };
}

function str(description: string): unknown {
  return { type: "string", description };
}

function strEnum(values: string[], description: string): unknown {
  return { type: "string", enum: values, description };
}

function optStr(description: string): unknown {
  return { type: "string", description };
}

// ---- Tool runner ----

function runBrain(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("openclaw", ["brain", ...args], {
    encoding: "utf-8",
    timeout: 15000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  };
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text: text.trim() }], details: {} };
}

function err(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    isError: true,
    details: {},
  };
}

// ---- Tool definitions ----

export const brainTools: AnyAgentTool[] = [
  {
    name: "brain_board",
    label: "Brain Board",
    description:
      "Show the full Brain Board with all cards organized by column. " +
      "Use this to see what's in progress, what's next, and overall state.",
    parameters: schema({}) as never,
    execute: async () => {
      const { stdout, stderr, exitCode } = runBrain(["board"]);
      if (exitCode !== 0) return err(stderr || "brain board failed");
      return ok(stdout);
    },
  },

  {
    name: "brain_create_card",
    label: "Brain Create Card",
    description:
      "Create a new card in the backlog. Cards start in backlog and must have all required " +
      "fields filled (problem, plan, criteria) before they can move to in-progress.",
    parameters: schema(
      {
        title: str("Card title — short, imperative description of the task"),
        priority: strEnum(["high", "medium", "low"], "Priority level (default: medium)"),
        tags: optStr("Comma-separated tags (e.g. miniclaw,build)"),
      },
      ["title"],
    ) as never,
    execute: async (_id, params: Record<string, string | undefined>) => {
      const args = ["create", "--title", params.title!];
      if (params.priority) args.push("--priority", params.priority);
      if (params.tags) args.push("--tags", params.tags);
      const { stdout, stderr, exitCode } = runBrain(args);
      if (exitCode !== 0) return err(stderr || "brain create failed");
      return ok(stdout);
    },
  },

  {
    name: "brain_update_card",
    label: "Brain Update Card",
    description:
      "Update fields on an existing card. Use this to fill in problem description, " +
      "implementation plan, acceptance criteria, notes, or review notes. " +
      "Gate errors will tell you exactly which fields to fill before advancing.",
    parameters: schema({
      id: str("Card ID (e.g. crd_a3f2b1c0)"),
      title: optStr("New card title"),
      priority: strEnum(["high", "medium", "low"], "New priority level"),
      problem: optStr("Problem description — why this work is needed"),
      plan: optStr("Implementation plan — how to solve it"),
      criteria: optStr(
        "Acceptance criteria as markdown checklist. Use - [ ] for unchecked, - [x] for done. " +
        "Example: '- [ ] Thing one\\n- [ ] Thing two'",
      ),
      notes: optStr("Notes / outcome — observations, decisions, results"),
      review: optStr(
        "Review notes — filled after critic/audit pass, required to ship. " +
        "Document what was audited and any findings.",
      ),
      tags: optStr("Comma-separated tags"),
    }, ["id"]) as never,
    execute: async (_id, params: Record<string, string | undefined>) => {
      const args = ["update", params.id!];
      if (params.title) args.push("--title", params.title);
      if (params.priority) args.push("--priority", params.priority);
      if (params.problem) args.push("--problem", params.problem);
      if (params.plan) args.push("--plan", params.plan);
      if (params.criteria) args.push("--criteria", params.criteria);
      if (params.notes) args.push("--notes", params.notes);
      if (params.review) args.push("--review", params.review);
      if (params.tags) args.push("--tags", params.tags);
      const { stdout, stderr, exitCode } = runBrain(args);
      if (exitCode !== 0) return err(stderr || "brain update failed");
      return ok(stdout);
    },
  },

  {
    name: "brain_move_card",
    label: "Brain Move Card",
    description:
      "Advance a card to the next column. Gate rules are enforced — if a gate fails, " +
      "you'll get a structured error explaining exactly what fields to fill before retrying. " +
      "Columns: backlog → in-progress → in-review → shipped. No skipping. No going back.",
    parameters: schema(
      {
        id: str("Card ID"),
        column: strEnum(
          ["in-progress", "in-review", "shipped"],
          "Target column (must be next in sequence)",
        ),
      },
      ["id", "column"],
    ) as never,
    execute: async (_id, params: Record<string, string>) => {
      const { stdout, stderr, exitCode } = runBrain(["move", params.id, params.column]);
      if (exitCode !== 0) return err(stderr || stdout || "brain move failed");
      return ok(stdout);
    },
  },

  {
    name: "brain_show_card",
    label: "Brain Show Card",
    description: "Show full detail of a specific card including all sections and history.",
    parameters: schema({ id: str("Card ID") }, ["id"]) as never,
    execute: async (_id, params: Record<string, string>) => {
      const { stdout, stderr, exitCode } = runBrain(["show", params.id]);
      if (exitCode !== 0) return err(stderr || "brain show failed");
      return ok(stdout);
    },
  },

  {
    name: "brain_next_task",
    label: "Brain Next Task",
    description:
      "Get the highest-priority actionable card to work on next. " +
      "Prefers in-progress > in-review > backlog, then high > medium > low priority.",
    parameters: schema({}) as never,
    execute: async () => {
      const { stdout, stderr, exitCode } = runBrain(["next"]);
      if (exitCode !== 0) return err(stderr || "brain next failed");
      return ok(stdout);
    },
  },
];
