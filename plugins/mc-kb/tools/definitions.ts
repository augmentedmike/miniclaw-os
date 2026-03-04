/**
 * mc-kb — Agent tool definitions
 *
 * Tools use spawnSync("openclaw", ["mc-kb", ...]) same pattern as mc-board.
 * 4 tools: kb_search, kb_add, kb_update, kb_get
 */

import { spawnSync } from "node:child_process";
import type { AnyAgentTool } from "openclaw/plugin-sdk";

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

function optStr(description: string): unknown {
  return { type: "string", description };
}

function optNum(description: string): unknown {
  return { type: "number", description };
}

// ---- Tool runner ----

function runKb(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync("openclaw", ["mc-kb", ...args], {
    encoding: "utf-8",
    timeout: 30000,
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

export const kbTools: AnyAgentTool[] = [
  {
    name: "kb_search",
    label: "KB Search",
    description:
      "Hybrid vector+keyword search the knowledge base. Returns title, type, summary, id for relevant entries. " +
      "Use this to recall facts, errors, workflows, and guides.",
    parameters: schema(
      {
        query: str("Search query — describe what you're looking for"),
        type: optStr("Filter by entry type: fact, workflow, guide, howto, error, postmortem"),
        tag: optStr("Filter by tag"),
        n: optNum("Max results (default 5)"),
      },
      ["query"],
    ) as never,
    execute: async (input: { query: string; type?: string; tag?: string; n?: number }) => {
      const args = ["search", input.query];
      if (input.type) args.push("--type", input.type);
      if (input.tag) args.push("--tag", input.tag);
      if (input.n) args.push("-n", String(input.n));

      const r = runKb(args);
      const out = r.stdout || r.stderr;
      if (r.exitCode !== 0) return err(`kb_search failed:\n${out}`);
      return ok(out || "No results found.");
    },
  },

  {
    name: "kb_add",
    label: "KB Add",
    description:
      "Add a new entry to the knowledge base. Use for: errors encountered and solutions, " +
      "workflows, how-to guides, facts about the system, project postmortems.",
    parameters: schema(
      {
        type: str("Entry type: fact, workflow, guide, howto, error, postmortem"),
        title: str("Concise descriptive title"),
        content: str("Full markdown content — the actual knowledge"),
        summary: optStr("1-2 sentence summary"),
        tags: optStr("Comma-separated tags"),
        source: optStr("Source: 'conversation', 'cli', url, or file path"),
        severity: optStr("Severity (error/postmortem only): low, medium, high"),
      },
      ["type", "title", "content"],
    ) as never,
    execute: async (input: {
      type: string; title: string; content: string;
      summary?: string; tags?: string; source?: string; severity?: string;
    }) => {
      const args = [
        "add",
        "--type", input.type,
        "--title", input.title,
        "--content", input.content,
      ];
      if (input.summary) args.push("--summary", input.summary);
      if (input.tags) args.push("--tags", input.tags);
      if (input.source) args.push("--source", input.source);
      if (input.severity) args.push("--severity", input.severity);

      const r = runKb(args);
      const out = r.stdout || r.stderr;
      if (r.exitCode !== 0) return err(`kb_add failed:\n${out}`);
      return ok(out || "Entry added.");
    },
  },

  {
    name: "kb_update",
    label: "KB Update",
    description: "Update an existing knowledge base entry by ID. Provide only the fields to change.",
    parameters: schema(
      {
        id: str("Entry ID (kb_<hex>)"),
        type: optStr("New type"),
        title: optStr("New title"),
        content: optStr("New content"),
        summary: optStr("New summary"),
        tags: optStr("New tags (comma-separated, replaces existing)"),
        severity: optStr("New severity"),
      },
      ["id"],
    ) as never,
    execute: async (input: {
      id: string; type?: string; title?: string; content?: string;
      summary?: string; tags?: string; severity?: string;
    }) => {
      const args = ["update", input.id];
      if (input.type) args.push("--type", input.type);
      if (input.title) args.push("--title", input.title);
      if (input.content) args.push("--content", input.content);
      if (input.summary) args.push("--summary", input.summary);
      if (input.tags) args.push("--tags", input.tags);
      if (input.severity) args.push("--severity", input.severity);

      const r = runKb(args);
      const out = r.stdout || r.stderr;
      if (r.exitCode !== 0) return err(`kb_update failed:\n${out}`);
      return ok(out || "Entry updated.");
    },
  },

  {
    name: "kb_get",
    label: "KB Get",
    description: "Get full content of a knowledge base entry by ID.",
    parameters: schema(
      { id: str("Entry ID (kb_<hex>)") },
      ["id"],
    ) as never,
    execute: async (input: { id: string }) => {
      const r = runKb(["get", input.id]);
      const out = r.stdout || r.stderr;
      if (r.exitCode !== 0) return err(`kb_get failed:\n${out}`);
      return ok(out);
    },
  },
];
