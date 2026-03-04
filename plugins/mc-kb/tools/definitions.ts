/**
 * mc-kb — Agent tool definitions
 *
 * Tools operate directly on the in-process KBStore + Embedder instances.
 * No subprocess spawning — avoids cold embedder reload, GPU contention,
 * and 30s timeout risk that caused silent failures in cron sessions.
 */

import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { KBStore } from "../src/store.js";
import type { Embedder } from "../src/embedder.js";
import type { Logger } from "pino";
import { hybridSearch } from "../src/search.js";
import { formatEntryLine } from "../src/entry.js";

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

// ---- Tool factory (uses in-process store + embedder) ----

export function createKbTools(
  store: KBStore,
  embedder: Embedder,
  logger: Logger,
): AnyAgentTool[] {
  return [
    {
      name: "kb_search",
      label: "KB Search",
      description:
        "Hybrid vector+keyword search the knowledge base. Returns title, type, summary, id for relevant entries. " +
        "Use this to recall facts, errors, workflows, and guides.",
      parameters: schema(
        {
          query: str("Search query — describe what you're looking for"),
          type: optStr("Filter by entry type: fact, workflow, guide, howto, error, postmortem, concept"),
          tag: optStr("Filter by tag"),
          n: optNum("Max results (default 5)"),
        },
        ["query"],
      ) as never,
      execute: async (input: { query: string; type?: string; tag?: string; n?: number }) => {
        const start = Date.now();
        logger.debug(`mc-kb/tool kb_search: query="${input.query}" type=${input.type ?? "any"}`);
        try {
          const results = await hybridSearch(store, embedder, input.query, {
            n: input.n ?? 5,
            vecThreshold: 0.75,
            type: input.type,
            tag: input.tag,
          });
          const ms = Date.now() - start;
          logger.debug(`mc-kb/tool kb_search: ${results.length} results in ${ms}ms`);
          if (results.length === 0) return ok("No results found.");
          const lines = results.map((r) => formatEntryLine(r.entry));
          return ok(lines.join("\n\n"));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-kb/tool kb_search error: ${msg}`);
          return toolErr(`kb_search failed: ${msg}`);
        }
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
          type: str("Entry type: fact, workflow, guide, howto, error, postmortem, concept"),
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
        const start = Date.now();
        logger.debug(`mc-kb/tool kb_add: type=${input.type} title="${input.title}"`);
        try {
          const tags = input.tags
            ? input.tags.split(",").map((t) => t.trim()).filter(Boolean)
            : [];

          // Generate embedding if embedder is ready (null = not ready, falls back to FTS-only)
          let vector: Float32Array | undefined;
          try {
            const v = await embedder.embed(`${input.title}\n${input.summary ?? ""}\n${input.content.slice(0, 512)}`);
            vector = v ?? undefined;
          } catch (e) {
            logger.warn(`mc-kb/tool kb_add: embedding failed (FTS-only fallback): ${e}`);
          }

          const entry = store.add({
            type: input.type as Parameters<typeof store.add>[0]["type"],
            title: input.title,
            content: input.content,
            summary: input.summary,
            tags,
            source: input.source ?? "agent",
            severity: input.severity as Parameters<typeof store.add>[0]["severity"],
          }, vector);

          const ms = Date.now() - start;
          logger.info(`mc-kb/tool kb_add: added ${entry.id} "${entry.title}" in ${ms}ms`);
          return ok(`Added ${entry.id}: ${entry.title}`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-kb/tool kb_add error: ${msg}`);
          return toolErr(`kb_add failed: ${msg}`);
        }
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
        const start = Date.now();
        logger.debug(`mc-kb/tool kb_update: id=${input.id}`);
        try {
          const patch: Record<string, unknown> = {};
          if (input.type) patch.type = input.type;
          if (input.title) patch.title = input.title;
          if (input.content) patch.content = input.content;
          if (input.summary !== undefined) patch.summary = input.summary;
          if (input.tags !== undefined) {
            patch.tags = input.tags.split(",").map((t) => t.trim()).filter(Boolean);
          }
          if (input.severity) patch.severity = input.severity;

          // Re-embed if content or title changed
          let vector: Float32Array | undefined;
          if (input.content || input.title) {
            const existing = store.get(input.id);
            if (existing) {
              const title = input.title ?? existing.title;
              const content = input.content ?? existing.content;
              const summary = input.summary ?? existing.summary ?? "";
              try {
                const v = await embedder.embed(`${title}\n${summary}\n${content.slice(0, 512)}`);
                vector = v ?? undefined;
              } catch (e) {
                logger.warn(`mc-kb/tool kb_update: embedding failed: ${e}`);
              }
            }
          }

          const updated = store.update(input.id, patch as Parameters<typeof store.update>[1], vector);
          const ms = Date.now() - start;
          logger.info(`mc-kb/tool kb_update: updated ${updated.id} in ${ms}ms`);
          return ok(`Updated ${updated.id}: ${updated.title}`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-kb/tool kb_update error: ${msg}`);
          return toolErr(`kb_update failed: ${msg}`);
        }
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
        logger.debug(`mc-kb/tool kb_get: id=${input.id}`);
        try {
          const entry = store.get(input.id);
          if (!entry) return toolErr(`Entry not found: ${input.id}`);
          const lines = [
            `# ${entry.title}`,
            `**id:** ${entry.id}  **type:** ${entry.type}  **updated:** ${entry.updated_at}`,
            entry.summary ? `**summary:** ${entry.summary}` : "",
            entry.tags?.length ? `**tags:** ${entry.tags.join(", ")}` : "",
            "",
            entry.content,
          ].filter((l) => l !== "");
          return ok(lines.join("\n"));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-kb/tool kb_get error: ${msg}`);
          return toolErr(`kb_get failed: ${msg}`);
        }
      },
    },
  ];
}
