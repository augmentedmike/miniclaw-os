/**
 * mc-memory — CLI commands
 *
 * Subcommands:
 *   openclaw mc-memory write <content> [--card <cardId>] [--force <target>]
 *   openclaw mc-memory recall <query> [--card <cardId>] [-n <count>] [--days <daysBack>] [--type <type>]
 *   openclaw mc-memory promote --content <text> --from <memo|episodic> --ref <cardId|date> [--title <t>] [--type <t>]
 */

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
) => Promise<{ entry: { id: string; type: string; title: string; content: string; summary?: string; tags: string[] }; score: number }[]>;

interface CliContext {
  program: {
    command(name: string): {
      description(desc: string): any;
      argument(name: string, desc: string): any;
      option(flags: string, desc: string, defaultValue?: any): any;
      action(fn: (...args: any[]) => Promise<void> | void): any;
    };
  };
  logger: Logger;
}

export function registerMemoryCommands(
  ctx: CliContext,
  store: KBStore,
  embedder: Embedder,
  hybridSearch: HybridSearchFn,
  memoDir: string,
  episodicDir: string,
): void {
  // ---- write ----
  ctx.program
    .command("write")
    .description("Write to memory with auto-routing (memo, kb, or episodic)")
    .argument("<content>", "Content to store")
    .option("--card <cardId>", "Card ID for card-scoped context")
    .option("--force <target>", "Force target: memo, kb, or episodic")
    .option("--source <source>", "Source identifier")
    .action(async (content: string, opts: { card?: string; force?: string; source?: string }) => {
      try {
        const result = await write(store, embedder, memoDir, episodicDir, content, {
          cardId: opts.card,
          forceTarget: opts.force as any,
          source: opts.source,
        });

        console.log(`Stored in: ${result.stored_in}`);
        if (result.id) console.log(`KB ID: ${result.id}`);
        if (result.cardId) console.log(`Card: ${result.cardId}`);
        if (result.date) console.log(`Date: ${result.date}`);
        if (result.path) console.log(`Path: ${result.path}`);
      } catch (e) {
        console.error(`Error: ${e instanceof Error ? e.message : e}`);
        process.exit(1);
      }
    });

  // ---- recall ----
  ctx.program
    .command("recall")
    .description("Search all memory stores (KB + memos + episodic)")
    .argument("<query>", "Search query")
    .option("--card <cardId>", "Scope memo search to this card")
    .option("-n <count>", "Max results", "10")
    .option("--days <daysBack>", "Days of episodic memory to scan", "7")
    .option("--type <type>", "Filter KB by type")
    .option("--tag <tag>", "Filter KB by tag")
    .option("--json", "Output as JSON")
    .action(async (query: string, opts: {
      card?: string; n: string; days: string; type?: string; tag?: string; json?: boolean;
    }) => {
      try {
        const results = await recall(
          store, embedder, hybridSearch, memoDir, episodicDir, query,
          {
            cardId: opts.card,
            n: parseInt(opts.n, 10),
            daysBack: parseInt(opts.days, 10),
            type: opts.type,
            tag: opts.tag,
          },
        );

        if (opts.json) {
          console.log(JSON.stringify(results, null, 2));
          return;
        }

        if (results.length === 0) {
          console.log("No memories found.");
          return;
        }

        for (const r of results) {
          switch (r.source) {
            case "kb":
              console.log(`[KB/${r.entry!.type}] ${r.entry!.title} (${r.entry!.id})`);
              console.log(`  ${r.entry!.summary ?? r.entry!.content.slice(0, 120).replace(/\n/g, " ")}`);
              break;
            case "memo":
              console.log(`[Memo/${r.cardId}] ${r.timestamp ?? ""}`);
              console.log(`  ${r.line}`);
              break;
            case "episodic":
              console.log(`[Episodic/${r.date}]`);
              console.log(`  ${r.snippet?.slice(0, 120)}`);
              break;
          }
          console.log();
        }
      } catch (e) {
        console.error(`Error: ${e instanceof Error ? e.message : e}`);
        process.exit(1);
      }
    });

  // ---- promote ----
  ctx.program
    .command("promote")
    .description("Promote a memo or episodic snippet to a KB entry")
    .option("--content <text>", "Content to promote (required)")
    .option("--from <source>", "Source type: memo or episodic (required)")
    .option("--ref <ref>", "Source ref: card ID or date YYYY-MM-DD (required)")
    .option("--title <title>", "Override auto-generated title")
    .option("--type <type>", "Override auto-detected KB type")
    .option("--tags <tags>", "Additional comma-separated tags")
    .action(async (opts: {
      content?: string; from?: string; ref?: string;
      title?: string; type?: string; tags?: string;
    }) => {
      if (!opts.content || !opts.from || !opts.ref) {
        console.error("Error: --content, --from, and --ref are required");
        process.exit(1);
      }

      try {
        const tags = opts.tags
          ? opts.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : [];

        const result = await promote(store, embedder, {
          content: opts.content,
          title: opts.title,
          type: opts.type,
          tags,
          source_type: opts.from as "memo" | "episodic",
          source_ref: opts.ref,
        });

        // Annotate source
        if (opts.from === "memo") {
          annotateMemo(memoDir, opts.ref, opts.content.split("\n")[0], result.kb_id);
        }

        console.log(`Promoted to KB:`);
        console.log(`  ID: ${result.kb_id}`);
        console.log(`  Title: ${result.title}`);
        console.log(`  Type: ${result.type}`);
        console.log(`  From: ${result.source_type}:${result.source_ref}`);
      } catch (e) {
        console.error(`Error: ${e instanceof Error ? e.message : e}`);
        process.exit(1);
      }
    });
}
