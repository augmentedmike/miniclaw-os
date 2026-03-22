/**
 * mc-memory — Agent tool definitions
 *
 * Three tools:
 *   memory_write  — Smart-routed write (replaces memo_write + kb_add for most cases)
 *   memory_recall — Unified search across KB + memos + episodic memory
 *   memory_promote — Graduate a memo/episodic snippet to a KB entry
 */

import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { Logger } from "pino";
import type { KBStore, Embedder } from "../src/types.js";
import { write } from "../src/writer.js";
import { recall } from "../src/recall.js";
import { promote, annotateMemo } from "../src/promote.js";

type HybridSearchFn = (
  store: KBStore,
  embedder: Embedder,
  query: string,
  opts: { n?: number; type?: string; tag?: string; vecThreshold?: number },
) => Promise<{ entry: { id: string; type: string; title: string; content: string; summary?: string; tags: string[] }; score: number; vecDistance?: number; ftsRank?: number }[]>;

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

export function createMemoryTools(
  store: KBStore,
  embedder: Embedder,
  hybridSearch: HybridSearchFn,
  memoDir: string,
  episodicDir: string,
  logger: Logger,
): AnyAgentTool[] {
  return [
    // ---- memory_write ----
    {
      name: "memory_write",
      label: "Memory Write",
      description:
        "Write to memory with automatic routing. Routes to the right store based on content: " +
        "card-scoped session notes → memo, generalizable knowledge → KB, daily observations → episodic. " +
        "Use this instead of memo_write or kb_add — it handles routing automatically. " +
        "Optionally provide cardId for card-scoped context or forceTarget to override routing.",
      parameters: schema(
        {
          content: str("The memory content to store — be specific and detailed"),
          cardId: optStr("Card ID for card-scoped context (e.g. crd_d1908fb6). If provided, card-specific notes route to memo."),
          forceTarget: optStr("Force storage target: 'memo', 'kb', or 'episodic'. Overrides auto-routing."),
          source: optStr("Source identifier (e.g. 'conversation', 'cli', 'reflection')"),
        },
        ["content"],
      ) as never,
      execute: async (_toolCallId: string, input: {
        content: string; cardId?: string; forceTarget?: string; source?: string;
      }) => {
        logger.debug(`mc-memory/tool memory_write: ${input.content.slice(0, 50)}...`);
        try {
          const result = await write(
            store,
            embedder,
            memoDir,
            episodicDir,
            input.content,
            {
              cardId: input.cardId,
              source: input.source,
              forceTarget: input.forceTarget as "memo" | "kb" | "episodic" | undefined,
            },
          );

          if (result.stored_in === "rejected") {
            logger.warn(`mc-memory/tool memory_write: rejected — ${result.reason}`);
            return toolErr(`Write rejected: ${result.reason}`);
          }

          const details: string[] = [`Stored in: ${result.stored_in}`];
          if (result.id) details.push(`KB ID: ${result.id}`);
          if (result.cardId) details.push(`Card: ${result.cardId}`);
          if (result.date) details.push(`Date: ${result.date}`);
          if (result.path) details.push(`Path: ${result.path}`);

          logger.info(`mc-memory/tool memory_write: ${details.join(", ")}`);
          return ok(details.join("\n"));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-memory/tool memory_write error: ${msg}`);
          return toolErr(`memory_write failed: ${msg}`);
        }
      },
    },

    // ---- memory_recall ----
    {
      name: "memory_recall",
      label: "Memory Recall",
      description:
        "Search all memory stores at once: knowledge base (KB), card memos, and episodic daily notes. " +
        "Returns unified results with source attribution. Use this instead of kb_search for broader recall. " +
        "Searches KB via hybrid vector+keyword, memos via keyword scan, and episodic files via keyword scan.",
      parameters: schema(
        {
          query: str("What are you trying to remember? Describe what you're looking for."),
          cardId: optStr("Scope memo search to this card ID (e.g. crd_d1908fb6)"),
          type: optStr("Filter KB results by type: fact, workflow, guide, howto, error, postmortem, lesson"),
          tag: optStr("Filter KB results by tag"),
          n: optNum("Max results (default 10)"),
          daysBack: optNum("How many days of episodic memory to scan (default 7)"),
        },
        ["query"],
      ) as never,
      execute: async (_toolCallId: string, input: {
        query: string; cardId?: string; type?: string; tag?: string;
        n?: number; daysBack?: number;
      }) => {
        const start = Date.now();
        logger.debug(`mc-memory/tool memory_recall: query="${input.query}"`);
        try {
          const results = await recall(
            store,
            embedder,
            hybridSearch,
            memoDir,
            episodicDir,
            input.query,
            {
              cardId: input.cardId,
              n: input.n ?? 10,
              daysBack: input.daysBack ?? 7,
              type: input.type,
              tag: input.tag,
            },
          );

          const ms = Date.now() - start;
          logger.debug(`mc-memory/tool memory_recall: ${results.length} results in ${ms}ms`);

          if (results.length === 0) return ok("No memories found matching your query.");

          const lines = results.map((r) => {
            switch (r.source) {
              case "kb":
                return `[KB/${r.entry!.type}] ${r.entry!.title} (${r.entry!.id})\n> ${r.entry!.summary ?? r.entry!.content.slice(0, 120).replace(/\n/g, " ")}`;
              case "memo":
                return `[Memo/${r.cardId}] ${r.timestamp ?? ""}\n> ${r.line}`;
              case "episodic":
                return `[Episodic/${r.date}]\n> ${r.content ?? r.snippet}`;
              default:
                return `[${r.source}] (unknown format)`;
            }
          });

          return ok(lines.join("\n\n"));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-memory/tool memory_recall error: ${msg}`);
          return toolErr(`memory_recall failed: ${msg}`);
        }
      },
    },

    // ---- memory_promote ----
    {
      name: "memory_promote",
      label: "Memory Promote",
      description:
        "Promote a memo note or episodic snippet to a permanent KB entry. " +
        "Use this to graduate important lessons, solutions, or patterns from short-term to long-term memory. " +
        "Auto-detects entry type and generates title if not provided. " +
        "Adds 'promoted' and 'from-memo'/'from-episodic' tags automatically.",
      parameters: schema(
        {
          content: str("The content to promote to KB — the full text of the lesson/solution/pattern"),
          source_type: str("Source: 'memo' or 'episodic'"),
          source_ref: str("Source reference: card ID (for memo) or date YYYY-MM-DD (for episodic)"),
          title: optStr("Override auto-generated title"),
          type: optStr("Override auto-detected KB type: fact, workflow, guide, howto, error, postmortem, lesson"),
          tags: optStr("Additional tags (comma-separated)"),
        },
        ["content", "source_type", "source_ref"],
      ) as never,
      execute: async (_toolCallId: string, input: {
        content: string; source_type: string; source_ref: string;
        title?: string; type?: string; tags?: string;
      }) => {
        logger.debug(`mc-memory/tool memory_promote: from ${input.source_type}:${input.source_ref}`);
        try {
          const tags = input.tags
            ? input.tags.split(",").map((t) => t.trim()).filter(Boolean)
            : [];

          const result = await promote(store, embedder, {
            content: input.content,
            title: input.title,
            type: input.type,
            tags,
            source_type: input.source_type as "memo" | "episodic",
            source_ref: input.source_ref,
          });

          // Annotate source memo if applicable
          if (input.source_type === "memo") {
            annotateMemo(memoDir, input.source_ref, input.content.split("\n")[0], result.kb_id);
          }

          logger.info(`mc-memory/tool memory_promote: ${result.kb_id} "${result.title}" (${result.type})`);
          return ok(
            `Promoted to KB:\n` +
            `  ID: ${result.kb_id}\n` +
            `  Title: ${result.title}\n` +
            `  Type: ${result.type}\n` +
            `  From: ${result.source_type}:${result.source_ref}`,
          );
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-memory/tool memory_promote error: ${msg}`);
          return toolErr(`memory_promote failed: ${msg}`);
        }
      },
    },
  ];
}
