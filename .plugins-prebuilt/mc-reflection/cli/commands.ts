/**
 * mc-reflection — CLI commands
 *
 * openclaw mc-reflection gather [--date YYYY-MM-DD]   Gather and print the day's context
 * openclaw mc-reflection list [--limit N]             List past reflections
 * openclaw mc-reflection show <id|date>               Show a specific reflection
 */

import type { Command } from "commander";
import { gather, formatContext, type GatherConfig } from "../src/gather.js";
import { ReflectionStore } from "../src/store.js";

export interface CliContext {
  program: Command;
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

export function registerReflectionCommands(
  ctx: CliContext,
  reflectionDir: string,
  gatherConfig: GatherConfig,
): void {
  const { program } = ctx;

  const reflection = program
    .command("mc-reflection")
    .description("Nightly self-reflection — review the day, extract lessons, create action items")
    .addHelpText("after", `
Examples:
  openclaw mc-reflection gather
  openclaw mc-reflection gather --date 2026-03-10
  openclaw mc-reflection list
  openclaw mc-reflection show refl_a1b2c3d4
  openclaw mc-reflection show 2026-03-10`);

  // ---- gather ----
  reflection
    .command("gather")
    .description("Gather and print the day's context for reflection")
    .option("--date <date>", "Date to reflect on (YYYY-MM-DD, default: today)")
    .action(async (opts: { date?: string }) => {
      try {
        const ctx = gather(gatherConfig, opts.date);
        console.log(formatContext(ctx));
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  // ---- list ----
  reflection
    .command("list")
    .description("List past reflection entries")
    .option("--limit <n>", "Max entries (default: 14)", "14")
    .action(async (opts: { limit: string }) => {
      try {
        const store = new ReflectionStore(reflectionDir);
        try {
          const entries = store.list(parseInt(opts.limit, 10));
          if (entries.length === 0) {
            console.log("No reflections yet.");
            return;
          }
          for (const e of entries) {
            const counts = [
              e.went_well.length > 0 ? `${e.went_well.length} wins` : "",
              e.went_wrong.length > 0 ? `${e.went_wrong.length} issues` : "",
              e.lessons.length > 0 ? `${e.lessons.length} lessons` : "",
            ].filter(Boolean).join(", ");
            console.log(`${e.date}  ${e.id}  ${e.summary.slice(0, 80)}${counts ? `  [${counts}]` : ""}`);
          }
        } finally {
          store.close();
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  // ---- show ----
  reflection
    .command("show <id>")
    .description("Show a specific reflection by ID or date")
    .action(async (id: string) => {
      try {
        const store = new ReflectionStore(reflectionDir);
        try {
          let entry = store.get(id);
          if (!entry && /^\d{4}-\d{2}-\d{2}$/.test(id)) {
            entry = store.getByDate(id);
          }
          if (!entry) {
            console.error(`Reflection not found: ${id}`);
            process.exit(1);
          }

          console.log(`# Reflection — ${entry.date} (${entry.id})`);
          console.log(`Created: ${entry.created_at}\n`);
          console.log(`## Summary\n${entry.summary}\n`);

          if (entry.went_well.length > 0) {
            console.log(`## What Went Well`);
            for (const item of entry.went_well) console.log(`- ${item}`);
            console.log();
          }
          if (entry.went_wrong.length > 0) {
            console.log(`## What Went Wrong`);
            for (const item of entry.went_wrong) console.log(`- ${item}`);
            console.log();
          }
          if (entry.lessons.length > 0) {
            console.log(`## Lessons`);
            for (const item of entry.lessons) console.log(`- ${item}`);
            console.log();
          }
          if (entry.action_items.length > 0) {
            console.log(`## Action Items`);
            for (const item of entry.action_items) console.log(`- ${item}`);
            console.log();
          }
        } finally {
          store.close();
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });
}
