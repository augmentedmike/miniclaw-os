import * as path from "node:path";
import type { Command } from "commander";
import type { CardStore } from "../src/store.js";
import { ArchiveStore } from "../src/archive.js";
import { COLUMNS, canTransition, checkGate, formatGateError } from "../src/state.js";
import { renderCardDetail, renderFullBoard, suggestNext } from "../src/board.js";
import type { Column, Priority } from "../src/card.js";
import { cardFilename } from "../src/card.js";

export interface CliContext {
  program: Command;
  stateDir: string;
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

export function registerBrainCommands(ctx: CliContext, store: CardStore): void {
  const archive = new ArchiveStore(ctx.stateDir);
  const { program } = ctx;

  const brain = program
    .command("mc-board")
    .description("Miniclaw brain kanban board — the agent's prefrontal cortex")
    .addHelpText("after", `
Column flow (sequential, no skipping):
  backlog → in-progress → in-review → shipped

Gate rules:
  backlog → in-progress   requires: title, problem, plan, criteria
  in-progress → in-review requires: all criteria checkboxes checked (- [x])
  in-review → shipped     requires: review notes (critic/audit pass)

Examples:
  miniclaw brain create --title "Fix login bug" --priority high
  miniclaw brain list
  miniclaw brain move crd_abc123 in-progress
  miniclaw brain board
  miniclaw brain archive crd_abc123`);

  // ---- brain create ----
  brain
    .command("create")
    .description("Create a new card in the backlog")
    .requiredOption("--title <title>", "Card title (required)")
    .option("--priority <p>", "Priority level: high, medium, low", "medium")
    .option("--tags <tags>", "Comma-separated tags, e.g. miniclaw,build")
    .addHelpText("after", `
New cards always start in backlog. Fill in problem, plan, and criteria
before moving to in-progress.

Examples:
  miniclaw brain create --title "Fix login bug"
  miniclaw brain create --title "Add dark mode" --priority high --tags ui,miniclaw`)
    .action((opts: { title: string; priority: string; tags?: string }) => {
      const priority = normalizePriority(opts.priority);
      if (!priority) {
        console.error(`Invalid priority: ${opts.priority}. Use: high, medium, low`);
        process.exit(1);
      }
      const tags = opts.tags
        ? opts.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
        : [];
      const card = store.create({ title: opts.title, priority, tags });
      console.log(`Created ${card.id}: ${card.title}`);
    });

  // ---- brain list ----
  brain
    .command("list")
    .description("List cards, optionally filtered by column")
    .option("--column <col>", "Filter by column: backlog, in-progress, in-review, shipped")
    .addHelpText("after", `
Without --column, lists all cards across all columns.

Examples:
  miniclaw brain list
  miniclaw brain list --column backlog
  miniclaw brain list --column shipped`)
    .action((opts: { column?: string }) => {
      if (opts.column && !COLUMNS.includes(opts.column as Column)) {
        console.error(`Invalid column: ${opts.column}. Valid: ${COLUMNS.join(", ")}`);
        process.exit(1);
      }
      const cards = store.list(opts.column as Column | undefined);
      if (cards.length === 0) {
        console.log("No cards.");
        return;
      }
      for (const card of cards) {
        const tagsStr = card.tags.length > 0 ? `  [${card.tags.join(", ")}]` : "";
        console.log(`${card.id}  [${card.column}]  [${card.priority}]  ${card.title}${tagsStr}`);
      }
    });

  // ---- brain show ----
  brain
    .command("show <id>")
    .description("Show full card detail — all fields, history, and criteria")
    .addHelpText("after", `
Prints all sections: problem description, implementation plan, acceptance
criteria, notes, review notes, and full column history with timestamps.

  miniclaw brain show crd_abc123`)
    .action((id: string) => {
      try {
        const card = store.findById(id);
        console.log(renderCardDetail(card));
      } catch (err) {
        console.error(String(err));
        process.exit(1);
      }
    });

  // ---- brain update ----
  brain
    .command("update <id>")
    .description("Update one or more fields on a card")
    .option("--title <title>", "Card title")
    .option("--priority <priority>", "Priority: high, medium, low")
    .option("--tags <tags>", "Comma-separated tags, e.g. miniclaw,build")
    .option("--problem <text>", "Problem description — why this work is needed")
    .option("--plan <text>", "Implementation plan — how to solve it")
    .option("--criteria <text>", "Acceptance criteria as markdown checklist (- [ ] / - [x])")
    .option("--notes <text>", "Notes / outcome — observations, decisions, results")
    .option("--review <text>", "Review notes — filled after critic/audit pass, required to ship")
    .addHelpText("after", `
At least one option required. Pass any combination.

Criteria format:
  "- [ ] thing one\\n- [ ] thing two"   (unchecked)
  "- [x] thing one\\n- [x] thing two"   (checked — required to move to in-review)

Examples:
  miniclaw brain update crd_abc123 --problem "Users can't log in via OAuth"
  miniclaw brain update crd_abc123 --plan "Patch token refresh handler" --criteria "- [ ] test passing"
  miniclaw brain update crd_abc123 --review "Audited. Edge cases covered. Good to ship."`)
    .action((id: string, opts: Record<string, string | undefined>) => {
      try {
        const updates: Record<string, unknown> = {};
        if (opts.title !== undefined) updates.title = opts.title;
        if (opts.priority !== undefined) {
          const p = normalizePriority(opts.priority);
          if (!p) {
            console.error(`Invalid priority: ${opts.priority}`);
            process.exit(1);
          }
          updates.priority = p;
        }
        if (opts.tags !== undefined)
          updates.tags = opts.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
        if (opts.problem !== undefined) updates.problem_description = opts.problem;
        if (opts.plan !== undefined) updates.implementation_plan = opts.plan;
        if (opts.criteria !== undefined) updates.acceptance_criteria = opts.criteria;
        if (opts.notes !== undefined) updates.notes = opts.notes;
        if (opts.review !== undefined) updates.review_notes = opts.review;

        if (Object.keys(updates).length === 0) {
          console.error("No fields to update. Provide at least one option.");
          process.exit(1);
        }

        const card = store.update(id, updates as Parameters<typeof store.update>[1]);
        console.log(`Updated ${card.id}: ${card.title}`);
      } catch (err) {
        console.error(String(err));
        process.exit(1);
      }
    });

  // ---- brain move ----
  brain
    .command("move <id> <column>")
    .description("Advance a card to the next column (gates enforced, no skipping)")
    .option("--force", "Bypass gate checks — recovery only, use with care")
    .addHelpText("after", `
Columns must advance in order. No skipping, no going back:
  backlog → in-progress → in-review → shipped

Gate requirements:
  → in-progress   title, problem description, implementation plan, acceptance criteria
  → in-review     all criteria checkboxes must be checked (- [x])
  → shipped       review notes must be filled

If a gate fails, the command prints exactly what's missing and how to fix it.
Use --force only for recovery from bad state — it skips all gate checks.

Examples:
  miniclaw brain move crd_abc123 in-progress
  miniclaw brain move crd_abc123 in-review
  miniclaw brain move crd_abc123 shipped
  miniclaw brain move crd_abc123 in-progress --force`)
    .action((id: string, column: string, opts: { force?: boolean }) => {
      if (!COLUMNS.includes(column as Column)) {
        console.error(`Invalid column: ${column}. Valid: ${COLUMNS.join(", ")}`);
        process.exit(1);
      }
      const target = column as Column;

      try {
        const card = store.findById(id);

        if (!opts.force) {
          if (!canTransition(card.column, target)) {
            console.error(
              `Cannot move ${card.id} from "${card.column}" to "${target}". Columns must advance sequentially: ${COLUMNS.join(" → ")}`,
            );
            process.exit(1);
          }

          const gate = checkGate(card, target);
          if (!gate.ok) {
            process.stderr.write(formatGateError(card.column, target, gate.failures) + "\n");
            process.exit(1);
          }
        }

        store.move(card, target);
        console.log(`Moved ${card.id} → ${target}`);
      } catch (err) {
        console.error(String(err));
        process.exit(1);
      }
    });

  // ---- brain board ----
  brain
    .command("board")
    .description("Show the full board — all cards grouped by column with priority and progress")
    .addHelpText("after", `
Displays all columns with card count, priority, tags, and criteria progress
for in-progress and in-review cards.

  miniclaw brain board`)
    .action(() => {
      const cards = store.list();
      console.log(renderFullBoard(cards));
    });

  // ---- brain next ----
  brain
    .command("next")
    .description("Suggest the highest-priority actionable card to work on next")
    .addHelpText("after", `
Scoring: in-progress > in-review > backlog, then high > medium > low.
Shipped cards are excluded — they're done.

  miniclaw brain next`)
    .action(() => {
      const cards = store.list();
      const next = suggestNext(cards);
      if (!next) {
        console.log("No actionable cards. Board is clear or all cards are shipped.");
        return;
      }
      console.log(`Next: ${next.id} [${next.column}] [${next.priority}] ${next.title}`);
      if (next.problem_description) {
        const preview = next.problem_description.split("\n")[0]?.slice(0, 80);
        if (preview) console.log(`  → ${preview}`);
      }
    });

  // ---- brain archive <id> ----
  brain
    .command("archive <id>")
    .description("Archive a shipped card — removes from board, compresses into rotating archive")
    .addHelpText("after", `
Only cards in the shipped column can be archived. The card is removed from
the active board and written into a gzip-compressed JSONL archive. Nothing
is deleted — all archived cards remain searchable.

Archives rotate at 5MB: brain-archive-001.jsonl.gz, 002, etc.
Location: ~/.openclaw/user/augmentedmike_bot/brain/archive/

Examples:
  miniclaw brain archive crd_abc123`)
    .action((id: string) => {
      try {
        const card = store.findById(id);
        if (card.column !== "shipped") {
          console.error(`Card ${card.id} is in "${card.column}" — only shipped cards can be archived.`);
          process.exit(1);
        }
        const sourceFile = path.join(store.cardsDir, cardFilename(card));
        archive.archiveCard(card, sourceFile);
        console.log(`Archived ${card.id}: ${card.title}`);
      } catch (err) {
        console.error(String(err));
        process.exit(1);
      }
    });

  // ---- brain archive-list ----
  brain
    .command("archive-list")
    .description("List all archive files with filename, card count, and size")
    .addHelpText("after", `
Shows each .jsonl.gz archive file in the archive directory.

  miniclaw brain archive-list`)
    .action(() => {
      const archives = archive.listArchives();
      if (archives.length === 0) {
        console.log("No archives yet.");
        return;
      }
      for (const a of archives) {
        const kb = (a.sizeBytes / 1024).toFixed(1);
        console.log(`${a.name}  ${a.cardCount} cards  ${kb}KB`);
      }
    });

  // ---- brain archive-search ----
  brain
    .command("archive-search <query>")
    .description("Search archived cards by title or id (case-insensitive substring match)")
    .addHelpText("after", `
Searches across all archive files. Matches on card id or title.

Examples:
  miniclaw brain archive-search "login"
  miniclaw brain archive-search crd_abc123`)
    .action((query: string) => {
      const results = archive.search(query);
      if (results.length === 0) {
        console.log(`No archived cards matching: ${query}`);
        return;
      }
      for (const card of results) {
        console.log(`${card.id}  ${card.title}  [shipped ${card.updated_at.slice(0, 10)}]`);
      }
    });

  // ---- brain archive-show ----
  brain
    .command("archive-show <id>")
    .description("Show full detail of an archived card — same output as 'show' but from archive")
    .addHelpText("after", `
Reads across all archive files. Prefix match on card id.

  miniclaw brain archive-show crd_abc123`)
    .action((id: string) => {
      const all = archive.readAll();
      const card = all.find(c => c.id.startsWith(id));
      if (!card) {
        console.error(`Archived card not found: ${id}`);
        process.exit(1);
      }
      console.log(renderCardDetail(card));
    });
}

function normalizePriority(p: string): Priority | null {
  const map: Record<string, Priority> = {
    high: "high", h: "high",
    medium: "medium", med: "medium", m: "medium",
    low: "low", l: "low",
  };
  return map[p.toLowerCase()] ?? null;
}
