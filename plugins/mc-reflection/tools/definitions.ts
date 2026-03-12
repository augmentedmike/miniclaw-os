/**
 * mc-reflection — Agent tool definitions
 *
 * Tools for nightly self-reflection:
 * - reflection_gather: Collect the day's context (memory, board, KB, transcripts)
 * - reflection_save: Save a reflection entry after analysis
 * - reflection_list: List past reflections
 * - reflection_show: Show a specific reflection
 */

import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { Logger } from "pino";
import { gather, formatContext, type GatherConfig } from "../src/gather.js";
import { ReflectionStore } from "../src/store.js";
import type { ReflectionCreate } from "../src/types.js";

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

function arrStr(description: string): unknown {
  return { type: "array", items: { type: "string" }, description };
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text: text.trim() }], details: {} };
}

function toolErr(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    isError: true,
    details: {},
  };
}

export interface ReflectionToolsConfig {
  reflectionDir: string;
  gatherConfig: GatherConfig;
}

export function createReflectionTools(
  cfg: ReflectionToolsConfig,
  logger: Logger,
): AnyAgentTool[] {
  return [
    // ---- reflection_gather ----
    {
      name: "reflection_gather",
      label: "Reflection Gather",
      description:
        "Gather the day's complete context for self-reflection. " +
        "Reads: episodic memory (today + yesterday), board state (all columns + shipped today), " +
        "KB entries created/updated today, and session transcript summaries. " +
        "Returns formatted markdown ready for analysis. " +
        "Call this first, then reason about the day, then use reflection_save to record your findings.",
      parameters: schema(
        {
          date: str("Date to reflect on (YYYY-MM-DD). Defaults to today."),
        },
      ) as never,
      execute: async (input: { date?: string }) => {
        logger.info(`reflection_gather: date=${input.date ?? "today"}`);
        try {
          const ctx = gather(cfg.gatherConfig, input.date);
          const formatted = formatContext(ctx);
          return ok(formatted);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`reflection_gather error: ${msg}`);
          return toolErr(`reflection_gather failed: ${msg}`);
        }
      },
    },

    // ---- reflection_save ----
    {
      name: "reflection_save",
      label: "Reflection Save",
      description:
        "Save a completed reflection entry. Call this after gathering context and analyzing the day. " +
        "Include: summary (3-5 sentences), what went well, what went wrong, lessons learned, " +
        "action items, and IDs of any KB entries or board cards you created during reflection.",
      parameters: schema(
        {
          date: str("Date reflected on (YYYY-MM-DD)"),
          summary: str("3-5 sentence reflection summary"),
          went_well: arrStr("List of things that went well"),
          went_wrong: arrStr("List of things that went wrong"),
          lessons: arrStr("Key lessons/takeaways"),
          action_items: arrStr("Action items (card IDs or descriptions)"),
          kb_entries_created: arrStr("KB entry IDs created during this reflection"),
          cards_created: arrStr("Board card IDs created during this reflection"),
        },
        ["date", "summary"],
      ) as never,
      execute: async (input: ReflectionCreate) => {
        logger.info(`reflection_save: date=${input.date}`);
        try {
          const store = new ReflectionStore(cfg.reflectionDir);
          try {
            const entry = store.save(input);
            const lines = [
              `Reflection saved: ${entry.id}`,
              `Date: ${entry.date}`,
              `Summary: ${entry.summary}`,
            ];
            if (entry.went_well.length > 0) lines.push(`Went well: ${entry.went_well.length} items`);
            if (entry.went_wrong.length > 0) lines.push(`Went wrong: ${entry.went_wrong.length} items`);
            if (entry.lessons.length > 0) lines.push(`Lessons: ${entry.lessons.length}`);
            if (entry.action_items.length > 0) lines.push(`Action items: ${entry.action_items.length}`);
            return ok(lines.join("\n"));
          } finally {
            store.close();
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`reflection_save error: ${msg}`);
          return toolErr(`reflection_save failed: ${msg}`);
        }
      },
    },

    // ---- reflection_list ----
    {
      name: "reflection_list",
      label: "Reflection List",
      description: "List past reflection entries. Returns date, summary, and counts for each.",
      parameters: schema(
        {
          limit: { type: "number", description: "Max entries to return (default: 14)" },
        },
      ) as never,
      execute: async (input: { limit?: number }) => {
        logger.debug(`reflection_list: limit=${input.limit ?? 14}`);
        try {
          const store = new ReflectionStore(cfg.reflectionDir);
          try {
            const entries = store.list(input.limit ?? 14);
            if (entries.length === 0) return ok("No reflections yet.");

            const lines = entries.map(e => {
              const counts = [
                e.went_well.length > 0 ? `${e.went_well.length} wins` : "",
                e.went_wrong.length > 0 ? `${e.went_wrong.length} issues` : "",
                e.lessons.length > 0 ? `${e.lessons.length} lessons` : "",
              ].filter(Boolean).join(", ");
              return `**${e.date}** (${e.id}) — ${e.summary.slice(0, 100)}${counts ? ` [${counts}]` : ""}`;
            });
            return ok(lines.join("\n"));
          } finally {
            store.close();
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`reflection_list error: ${msg}`);
          return toolErr(`reflection_list failed: ${msg}`);
        }
      },
    },

    // ---- reflection_show ----
    {
      name: "reflection_show",
      label: "Reflection Show",
      description: "Show a specific reflection entry by ID or date.",
      parameters: schema(
        {
          id: str("Reflection ID (refl_*) or date (YYYY-MM-DD)"),
        },
        ["id"],
      ) as never,
      execute: async (input: { id: string }) => {
        logger.debug(`reflection_show: id=${input.id}`);
        try {
          const store = new ReflectionStore(cfg.reflectionDir);
          try {
            // Try by ID first, then by date
            let entry = store.get(input.id);
            if (!entry && /^\d{4}-\d{2}-\d{2}$/.test(input.id)) {
              entry = store.getByDate(input.id);
            }
            if (!entry) return toolErr(`Reflection not found: ${input.id}`);

            const lines = [
              `# Reflection — ${entry.date} (${entry.id})`,
              `Created: ${entry.created_at}`,
              ``,
              `## Summary`,
              entry.summary,
            ];

            if (entry.went_well.length > 0) {
              lines.push(``, `## What Went Well`);
              for (const item of entry.went_well) lines.push(`- ${item}`);
            }
            if (entry.went_wrong.length > 0) {
              lines.push(``, `## What Went Wrong`);
              for (const item of entry.went_wrong) lines.push(`- ${item}`);
            }
            if (entry.lessons.length > 0) {
              lines.push(``, `## Lessons`);
              for (const item of entry.lessons) lines.push(`- ${item}`);
            }
            if (entry.action_items.length > 0) {
              lines.push(``, `## Action Items`);
              for (const item of entry.action_items) lines.push(`- ${item}`);
            }
            if (entry.kb_entries_created.length > 0) {
              lines.push(``, `## KB Entries Created`);
              for (const item of entry.kb_entries_created) lines.push(`- ${item}`);
            }
            if (entry.cards_created.length > 0) {
              lines.push(``, `## Board Cards Created`);
              for (const item of entry.cards_created) lines.push(`- ${item}`);
            }

            return ok(lines.join("\n"));
          } finally {
            store.close();
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`reflection_show error: ${msg}`);
          return toolErr(`reflection_show failed: ${msg}`);
        }
      },
    },
  ];
}
