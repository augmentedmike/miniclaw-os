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
  const result = spawnSync("openclaw", ["mc-board", ...args], {
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
        project_id: optStr("Link to a project by ID (prj_<hex>) — optional"),
      },
      ["title"],
    ) as never,
    execute: async (_id, params: Record<string, string | undefined>) => {
      const args = ["create", "--title", params.title!];
      if (params.priority) args.push("--priority", params.priority);
      if (params.tags) args.push("--tags", params.tags);
      if (params.project_id) args.push("--project", params.project_id);
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
      project_id: optStr("Link to a project (prj_<hex>), or 'none' to unlink from current project"),
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
      if (params.project_id) args.push("--project", params.project_id);
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
      "Focus-tagged cards always come first. Then prefers in-progress > in-review > backlog, " +
      "then critical > high > medium > low priority.",
    parameters: schema({}) as never,
    execute: async () => {
      const { stdout, stderr, exitCode } = runBrain(["next"]);
      if (exitCode !== 0) return err(stderr || "brain next failed");
      return ok(stdout);
    },
  },

  // ---- Triage / queue dispatch tools ----

  {
    name: "brain_column_context",
    label: "Brain Column Context",
    description:
      "Get full LLM-ready context for all cards in a column, grouped by project " +
      "and ordered by priority desc then oldest-first. Use this at the START of every " +
      "board worker turn to survey the column and decide what to pick up. " +
      "Pass skip_hold='true' to exclude cards tagged 'on-hold' (being worked outside the queue).",
    parameters: schema(
      {
        column: strEnum(
          ["backlog", "in-progress", "in-review", "shipped"],
          "Column to inspect",
        ),
        skip_hold: optStr("Set to 'true' to exclude cards tagged 'on-hold'"),
      },
      ["column"],
    ) as never,
    execute: async (_id, params: Record<string, string | undefined>) => {
      const args = ["context", "--column", params.column!];
      if (params.skip_hold === "true") args.push("--skip-hold");
      const { stdout, stderr, exitCode } = runBrain(args);
      if (exitCode !== 0) return err(stderr || "brain context failed");
      return ok(stdout);
    },
  },

  {
    name: "brain_pickup",
    label: "Brain Pickup",
    description:
      "Register that this agent loop has picked up a card to work on. " +
      "ALWAYS call this BEFORE doing any work on a card. " +
      "This records the live agent→card mapping so the dashboard shows which " +
      "process has which ticket. Call brain_release when done or handing off.",
    parameters: schema(
      {
        card_id: str("Card ID (crd_<hex>)"),
        worker: str(
          "Worker name identifying this loop — e.g. 'board-worker-backlog', " +
          "'board-worker-in-progress', 'board-worker-in-review'",
        ),
        column: optStr("Column being worked in (defaults to card's current column)"),
      },
      ["card_id", "worker"],
    ) as never,
    execute: async (_id, params: Record<string, string | undefined>) => {
      const args = ["pickup", params.card_id!, "--worker", params.worker!];
      if (params.column) args.push("--column", params.column);
      const { stdout, stderr, exitCode } = runBrain(args);
      if (exitCode !== 0) return err(stderr || "brain pickup failed");
      return ok(stdout);
    },
  },

  {
    name: "brain_release",
    label: "Brain Release",
    description:
      "Signal that this agent loop has finished with a card — work done, " +
      "card moved, or turn ending. ALWAYS call this after completing or handing " +
      "off a card. Removes the card from the live active-work view.",
    parameters: schema(
      {
        card_id: str("Card ID (crd_<hex>)"),
        worker: str("Worker name — must match what was passed to brain_pickup"),
      },
      ["card_id", "worker"],
    ) as never,
    execute: async (_id, params: Record<string, string>) => {
      const { stdout, stderr, exitCode } = runBrain([
        "release", params.card_id, "--worker", params.worker,
      ]);
      if (exitCode !== 0) return err(stderr || "brain release failed");
      return ok(stdout);
    },
  },

  {
    name: "brain_active",
    label: "Brain Active Loops",
    description:
      "Show all cards currently being worked by agent loops. " +
      "Check this before picking up a card to avoid duplicate work — if a card " +
      "is already active, skip it and pick a different one.",
    parameters: schema({}) as never,
    execute: async () => {
      const { stdout, stderr, exitCode } = runBrain(["active"]);
      if (exitCode !== 0) return err(stderr || "brain active failed");
      return ok(stdout || "No active agent loops.");
    },
  },

  {
    name: "brain_pickup_log",
    label: "Brain Pickup Log",
    description:
      "Show recent pickup/release history across all board workers. " +
      "Useful for auditing what each agent loop processed and when.",
    parameters: schema({
      limit: optStr("Number of entries to show (default: 20)"),
    }) as never,
    execute: async (_id, params: Record<string, string | undefined>) => {
      const args = ["pickup-log"];
      if (params.limit) args.push("--limit", params.limit);
      const { stdout, stderr, exitCode } = runBrain(args);
      if (exitCode !== 0) return err(stderr || "brain pickup-log failed");
      return ok(stdout || "No pickup history yet.");
    },
  },

  {
    name: "brain_search",
    label: "Brain Search",
    description:
      "Search cards by title, tags, problem description, or implementation plan. " +
      "Case-insensitive substring match across all active cards.",
    parameters: schema(
      {
        query: str("Search query — matched against title, tags, problem, and plan"),
        column: strEnum(["backlog", "in-progress", "in-review", "shipped"], "Limit to a specific column (optional)"),
        project_id: optStr("Limit to a specific project ID (optional)"),
      },
      ["query"],
    ) as never,
    execute: async (_id, params: Record<string, string | undefined>) => {
      const args = ["search", params.query!];
      if (params.column) args.push("--column", params.column);
      if (params.project_id) args.push("--project", params.project_id);
      const { stdout, stderr, exitCode } = runBrain(args);
      if (exitCode !== 0) return err(stderr || "brain search failed");
      return ok(stdout || `No cards matching: ${params.query}`);
    },
  },

  // ---- Project tools ----

  {
    name: "brain_project_create",
    label: "Brain Project Create",
    description:
      "Create a new project to organize related cards into an initiative. " +
      "Returns the project ID (prj_<hex>) which can be used to link cards.",
    parameters: schema(
      {
        name: str("Project name — short descriptive title for the initiative"),
        description: optStr("Optional description of the project's goal or scope"),
      },
      ["name"],
    ) as never,
    execute: async (_id, params: Record<string, string | undefined>) => {
      const args = ["project", "create", "--name", params.name!];
      if (params.description) args.push("--description", params.description);
      const { stdout, stderr, exitCode } = runBrain(args);
      if (exitCode !== 0) return err(stderr || "project create failed");
      return ok(stdout);
    },
  },

  {
    name: "brain_project_list",
    label: "Brain Project List",
    description:
      "List all active projects with card counts. Use this to see what initiatives " +
      "are in flight and find project IDs for linking cards.",
    parameters: schema({ include_archived: optStr("Set to 'true' to include archived projects") }) as never,
    execute: async (_id, params: Record<string, string | undefined>) => {
      const args = ["project", "list"];
      if (params.include_archived === "true") args.push("--all");
      const { stdout, stderr, exitCode } = runBrain(args);
      if (exitCode !== 0) return err(stderr || "project list failed");
      return ok(stdout);
    },
  },

  {
    name: "brain_project_show",
    label: "Brain Project Show",
    description:
      "Show a project's full kanban board — all cards linked to this project, " +
      "organized by column with priority and progress indicators.",
    parameters: schema({ id: str("Project ID (prj_<hex>)") }, ["id"]) as never,
    execute: async (_id, params: Record<string, string>) => {
      const { stdout, stderr, exitCode } = runBrain(["project", "show", params.id]);
      if (exitCode !== 0) return err(stderr || "project show failed");
      return ok(stdout);
    },
  },
];
