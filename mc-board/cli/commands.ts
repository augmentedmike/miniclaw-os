import type { Command } from "commander";
import type { CardStore } from "../src/store.js";
import type { ProjectStore } from "../src/project-store.js";
import { formatConflictError } from "../src/dedup.js";
import { ActiveWorkStore } from "../src/active-work.js";
import { ArchiveStore } from "../src/archive.js";
import { COLUMNS, canTransition, canTransitionSystem, checkGate, formatGateError } from "../src/state.js";
import {
  renderCardDetail,
  renderColumnContext,
  renderFullBoard,
  renderProjectBoard,
  renderProjectList,
  suggestNext,
  validateCardTags,
} from "../src/board.js";
import type { Column, Priority } from "../src/card.js";
import { formatPluginError, formatUserError, DOCTOR_SUGGESTION } from "../../shared/errors/format.js";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as readline from "node:readline";

export interface CliContext {
  program: Command;
  stateDir: string;
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

export function registerBrainCommands(ctx: CliContext, store: CardStore, projects: ProjectStore): void {
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
    .option("--priority <p>", "Priority level: critical, high, medium, low", "medium")
    .option("--tags <tags>", "Comma-separated tags, e.g. miniclaw,build")
    .option("--project <id>", "Link to a project by ID (prj_<hex>)")
    .option("--work-type <type>", "Card type: 'work' or 'verify' (optional)")
    .option("--linked-card-id <id>", "For verify cards, the source work card ID (optional)")
    .option("--problem <text>", "Problem description — why this work is needed")
    .option("--plan <text>", "Implementation plan — how to solve it")
    .option("--criteria <text>", "Acceptance criteria as markdown checklist (- [ ] ...)")
    .option("--notes <text>", "Notes / context")
    .option("--research <text>", "Research notes — pre-work context and findings")
    .option("--verify-url <url>", "URL to verify the work is live (used by review agent)")
    .option("--force", "Bypass similar-card confirmation prompt (for automation)")
    .addHelpText("after", `
New cards always start in backlog. Fill in problem, plan, and criteria
before moving to in-progress.

Examples:
  miniclaw brain create --title "Fix login bug"
  miniclaw brain create --title "Add dark mode" --priority high --tags ui,miniclaw
  miniclaw brain create --title "API redesign" --project prj_a1b2c3d4 --problem "Need API v2"
  miniclaw brain create --title "VERIFY: Fix login bug" --work-type verify --linked-card-id crd_abc123
  miniclaw brain create --title "Fix login bug" --force   # skip duplicate check`)
    .action((opts: { title: string; priority: string; tags?: string; project?: string; workType?: string; linkedCardId?: string; problem?: string; plan?: string; criteria?: string; notes?: string; research?: string; verifyUrl?: string; force?: boolean }) => {
      const priority = normalizePriority(opts.priority);
      if (!priority) {
        console.error(`Invalid priority: ${opts.priority}. Use: critical, high, medium, low`);
        process.exit(1);
      }
      const tags = opts.tags
        ? opts.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
        : [];
      // Validate tags
      const tagValidation = validateCardTags(tags);
      if (!tagValidation.valid) {
        console.warn(`⚠️  Warning: Invalid tags found:`);
        for (const err of tagValidation.errors) {
          console.warn(`  ${err}`);
        }
      }
      // Validate project if provided
      if (opts.project) {
        try { projects.findById(opts.project); } catch {
          console.error(`Project not found: ${opts.project}`);
          process.exit(1);
        }
      }
      // Validate work_type if provided
      let work_type: 'work' | 'verify' | undefined;
      if (opts.workType) {
        if (opts.workType !== 'work' && opts.workType !== 'verify') {
          console.error(`Invalid work-type: ${opts.workType}. Use: work, verify`);
          process.exit(1);
        }
        work_type = opts.workType as 'work' | 'verify';
      }
      // Validate linked_card_id if provided
      let linked_card_id: string | undefined;
      if (opts.linkedCardId) {
        try { store.findById(opts.linkedCardId); } catch {
          console.error(`Linked card not found: ${opts.linkedCardId}`);
          process.exit(1);
        }
        linked_card_id = opts.linkedCardId;
      }
      // Pre-create similar card check
      const conflict = store.checkTitleConflict(opts.title, { projectId: opts.project });
      if (conflict !== null && !opts.force) {
        console.error(formatConflictError(opts.title, conflict));
        // If stdin is a TTY, prompt for confirmation; otherwise exit
        if (process.stdin.isTTY) {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          rl.question("Create anyway? (y/N) ", (answer) => {
            rl.close();
            if (answer.trim().toLowerCase() === "y") {
              const card = store.create({
                title: opts.title, priority, tags, project_id: opts.project, work_type, linked_card_id,
                problem_description: opts.problem,
                implementation_plan: opts.plan,
                acceptance_criteria: opts.criteria,
                notes: opts.notes,
                research: opts.research,
                verify_url: opts.verifyUrl,
              });
              console.log(`Created ${card.id}: ${card.title}${opts.project ? ` [project: ${opts.project}]` : ""}${work_type ? ` [${work_type}${linked_card_id ? ` → ${linked_card_id}` : ''}]` : ""}`);
            } else {
              console.log("Aborted. No card created.");
              process.exit(0);
            }
          });
          return;
        } else {
          // Non-interactive: exit with error (use --force for automation)
          process.exit(1);
        }
      }
      const card = store.create({
        title: opts.title, priority, tags, project_id: opts.project, work_type, linked_card_id,
        problem_description: opts.problem,
        implementation_plan: opts.plan,
        acceptance_criteria: opts.criteria,
        notes: opts.notes,
        research: opts.research,
        verify_url: opts.verifyUrl,
      });
      console.log(`Created ${card.id}: ${card.title}${opts.project ? ` [project: ${opts.project}]` : ""}${work_type ? ` [${work_type}${linked_card_id ? ` → ${linked_card_id}` : ''}]` : ""}`);
    });

  // ---- brain list ----
  brain
    .command("list")
    .description("List cards, optionally filtered by column or project")
    .option("--column <col>", "Filter by column: backlog, in-progress, in-review, shipped")
    .option("--project <id>", "Filter by project ID (prj_<hex>)")
    .option("--skip-hold", "Exclude cards tagged 'on-hold'")
    .addHelpText("after", `
Without --column, lists all cards across all columns.
Use --skip-hold to exclude cards being handled outside the queue (tagged 'on-hold').

Examples:
  miniclaw brain list
  miniclaw brain list --column backlog
  miniclaw brain list --column backlog --skip-hold
  miniclaw brain list --project prj_a1b2c3d4`)
    .action((opts: { column?: string; project?: string; skipHold?: boolean }) => {
      if (opts.column && !COLUMNS.includes(opts.column as Column)) {
        console.error(`Invalid column: ${opts.column}. Valid: ${COLUMNS.join(", ")}`);
        process.exit(1);
      }
      let cards = store.list(opts.column as Column | undefined);
      if (opts.project) cards = cards.filter(c => c.project_id === opts.project);
      if (opts.skipHold) cards = cards.filter(c => !c.tags.includes("on-hold") && !c.tags.includes("blocked") && !c.tags.includes("hold"));
      if (cards.length === 0) {
        console.log("No cards.");
        return;
      }
      for (const card of cards) {
        const tagsStr = card.tags.length > 0 ? `  [${card.tags.join(", ")}]` : "";
        const projStr = card.project_id ? `  {${card.project_id}}` : "";
        console.log(`${card.id}  [${card.column}]  [${card.priority}]  ${card.title}${tagsStr}${projStr}`);
      }
    });

  // ---- brain context ----
  brain
    .command("context")
    .description("Dump all cards in a column as a rich LLM-ready context block for triage")
    .requiredOption("--column <col>", "Column to dump: backlog, in-progress, in-review, shipped")
    .option("--skip-hold", "Exclude cards tagged 'on-hold' (being handled outside the queue)")
    .option("--tags <tags>", "Filter by tags (comma-separated; returns cards with ANY of these tags)")
    .addHelpText("after", `
Outputs all cards in the column with full detail (problem, plan, criteria),
grouped by project and ordered by priority desc → oldest first.
Designed for feeding into a Haiku triage prompt to select the next candidates.

Tag a card as 'on-hold' to signal it's being worked on outside the queue:
  openclaw mc-board update <id> --tags "on-hold,<reason-tag>"
Then use --skip-hold so triage workers skip it automatically.

Use --tags to filter by tag (any tag listed returns the card):
  openclaw mc-board context --column backlog --tags blocked,urgent
  openclaw mc-board context --column in-progress --tags focus

Examples:
  openclaw mc-board context --column backlog
  openclaw mc-board context --column backlog --skip-hold
  openclaw mc-board context --column in-progress --tags focus`)
    .action((opts: { column: string; skipHold?: boolean; tags?: string }) => {
      if (!COLUMNS.includes(opts.column as Column)) {
        console.error(`Invalid column: ${opts.column}. Valid: ${COLUMNS.join(", ")}`);
        process.exit(1);
      }
      let cards = store.list(opts.column as Column);
      if (opts.skipHold) cards = cards.filter(c => !c.tags.includes("on-hold") && !c.tags.includes("blocked") && !c.tags.includes("hold"));
      const filterTags = opts.tags ? opts.tags.split(",").map(t => t.trim()).filter(Boolean) : undefined;
      const allProjects = projects.list();
      console.log(renderColumnContext(opts.column as Column, cards, allProjects, filterTags));
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
        console.error(formatPluginError("mc-board", "show", err, [
          "Run: openclaw mc-board list — to see all cards",
          "Check the ID format: cards start with crd_",
        ]));
        process.exit(1);
      }
    });

  // ---- brain update ----
  brain
    .command("update <id>")
    .description("Update one or more fields on a card")
    .option("--title <title>", "Card title")
    .option("--priority <priority>", "Priority: critical, high, medium, low")
    .option("--tags <tags>", "Comma-separated tags — REPLACES all existing tags")
    .option("--add-tags <tags>", "Comma-separated tags to ADD to existing tags")
    .option("--remove-tags <tags>", "Comma-separated tags to REMOVE from existing tags")
    .option("--problem <text>", "Problem description — why this work is needed")
    .option("--plan <text>", "Implementation plan — how to solve it")
    .option("--criteria <text>", "Acceptance criteria as markdown checklist (- [ ] / - [x])")
    .option("--notes <text>", "Notes / outcome — observations, decisions, results")
    .option("--review <text>", "Review notes — filled after critic/audit pass, required to ship")
    .option("--research <text>", "Research notes — pre-work context, findings, and links")
    .option("--verify-url <url>", "URL to check when reviewing this card (e.g. http://localhost:4220/memory)")
    .option("--log <note>", "Append a work log entry (timestamped, never overwrites)")
    .option("--link <url>", "Add a repo link (PR/commit/branch URL) to the latest log entry or create one")
    .option("--worker <id>", "Worker/agent ID for the log entry (default: $OPENCLAW_AGENT_ID or 'agent')")
    .option("--project <id>", "Link card to a project by ID (prj_<hex>), or 'none' to unlink")
    .option("--work-type <type>", "Card type: 'work' or 'verify', or 'none' to clear")
    .option("--linked-card-id <id>", "For verify cards, the source work card ID, or 'none' to clear")
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
        if (opts.tags !== undefined) {
          const tags = opts.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
          const tagValidation = validateCardTags(tags);
          if (!tagValidation.valid) {
            console.warn(`⚠️  Warning: Invalid tags found:`);
            for (const err of tagValidation.errors) console.warn(`  ${err}`);
          }
          updates.tags = tags;
        }
        if (opts.addTags !== undefined || opts.removeTags !== undefined) {
          const card = store.findById(id);
          let tags = [...card.tags];
          if (opts.addTags) {
            const toAdd = opts.addTags.split(",").map((t: string) => t.trim()).filter(Boolean);
            for (const t of toAdd) if (!tags.includes(t)) tags.push(t);
          }
          if (opts.removeTags) {
            const toRemove = new Set(opts.removeTags.split(",").map((t: string) => t.trim()).filter(Boolean));
            tags = tags.filter(t => !toRemove.has(t));
          }
          updates.tags = tags;
        }
        if (opts.problem !== undefined) updates.problem_description = opts.problem;
        if (opts.plan !== undefined) updates.implementation_plan = opts.plan;
        if (opts.criteria !== undefined) updates.acceptance_criteria = opts.criteria;
        if (opts.notes !== undefined) updates.notes = opts.notes;
        if (opts.review !== undefined) updates.review_notes = opts.review;
        if (opts.research !== undefined) updates.research = opts.research;
        if (opts.verifyUrl !== undefined) updates.verify_url = opts.verifyUrl;

        // Work log — append-only, handled separately from bulk update
        if (opts.log !== undefined || opts.link !== undefined) {
          const worker = opts.worker ?? process.env.OPENCLAW_AGENT_ID ?? "agent";
          if (opts.log !== undefined) {
            store.appendWorkLog(id, {
              worker,
              note: opts.log,
              ...(opts.link ? { links: [opts.link] } : {}),
            });
          } else if (opts.link !== undefined) {
            // Link only — attach to most recent entry or create a bare entry
            const card = store.findById(id);
            const log = card.work_log ?? [];
            if (log.length > 0) {
              const last = log[log.length - 1];
              const updated = [...log.slice(0, -1), { ...last, links: [...(last.links ?? []), opts.link] }];
              store.update(id, { work_log: updated } as Parameters<typeof store.update>[1]);
            } else {
              store.appendWorkLog(id, { worker, note: "", links: [opts.link] });
            }
          }
          if (Object.keys(updates).length === 0) {
            const card = store.findById(id);
            console.log(`Updated ${card.id}: ${card.title}`);
            process.exit(0);
          }
        }

        if (opts.project !== undefined) {
          if (opts.project === "none") {
            updates.project_id = undefined;
          } else {
            try { projects.findById(opts.project); } catch {
              console.error(`Project not found: ${opts.project}`);
              process.exit(1);
            }
            updates.project_id = opts.project;
          }
        }
        if (opts.workType !== undefined) {
          if (opts.workType === "none") {
            updates.work_type = undefined;
          } else if (opts.workType === "work" || opts.workType === "verify") {
            updates.work_type = opts.workType;
          } else {
            console.error(`Invalid work-type: ${opts.workType}. Use: work, verify, none`);
            process.exit(1);
          }
        }
        if (opts.linkedCardId !== undefined) {
          if (opts.linkedCardId === "none") {
            updates.linked_card_id = undefined;
          } else {
            try { store.findById(opts.linkedCardId); } catch {
              console.error(`Linked card not found: ${opts.linkedCardId}`);
              process.exit(1);
            }
            updates.linked_card_id = opts.linkedCardId;
          }
        }

        if (Object.keys(updates).length === 0) {
          console.error("No fields to update. Provide at least one option.");
          process.exit(1);
        }

        const card = store.update(id, updates as Parameters<typeof store.update>[1]);
        console.log(`Updated ${card.id}: ${card.title}`);
      } catch (err) {
        console.error(formatPluginError("mc-board", "update", err, [
          "Verify the card exists: openclaw mc-board show " + id,
          "Run: openclaw mc-board list — to see all cards",
          DOCTOR_SUGGESTION,
        ]));
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

          // Title conflict check when moving to in-progress — catches
          // duplicate work that slipped through at create time.
          if (target === "in-progress") {
            const conflict = store.checkTitleConflict(card.title, {
              projectId: card.project_id,
              excludeId: card.id,
            });
            if (conflict) {
              process.stderr.write(formatConflictError(card.title, conflict) + "\n");
              process.exit(1);
            }
          }

          const gate = checkGate(card, target);
          if (!gate.ok) {
            process.stderr.write(formatGateError(card.column, target, gate.failures) + "\n");
            process.exit(1);
          }

        }

        store.move(card, target);
        console.log(`Moved ${card.id} → ${target}`);

        // ---- Star CTA at peak emotional moment (task shipped) ----
        if (target === "shipped") {
          console.log(`\n  ⭐  If MiniClaw helped, star us: https://github.com/augmentedmike/miniclaw-os\n`);
        }

        // ---- Auto-archive trigger for failed verify cards ----
        if (card.work_type === 'verify' && target === 'shipped') {
          // Check if the verify card has unchecked criteria (failure indicator)
          const unchecked = (card.acceptance_criteria.match(/^- \[ \]/gm) ?? []).length;
          if (unchecked > 0 && card.linked_card_id) {
            // Failed verify: archive this card and resurface the work card
            try {
              const workCard = store.findById(card.linked_card_id);

              // Archive the failed verify card then delete from DB
              archive.archiveCard(card);
              store.delete(card.id);
              
              // Clear all criteria checkboxes on work card
              const uncheckedCriteria = (workCard.acceptance_criteria.match(/^- \[x\]/gm) ?? []).length;
              const totalCriteria = (workCard.acceptance_criteria.match(/^- \[[ x]\]/gm) ?? []).length;
              
              // Reset all criteria to unchecked
              const resetCriteria = workCard.acceptance_criteria
                .split('\n')
                .map(line => line.replace(/^- \[x\]/, '- [ ]'))
                .join('\n');
              
              // Update work card with reset criteria and resurface via system transition
              store.update(workCard.id, { acceptance_criteria: resetCriteria });
              if (!canTransitionSystem(workCard.column, 'in-progress')) {
                throw new Error(`System transition ${workCard.column} → in-progress not defined in state machine`);
              }
              store.move(workCard, 'in-progress');
              
              console.log(`Auto-archive: Failed verify ${card.id} archived.`);
              console.log(`Auto-resurfaced: ${workCard.id} moved back to in-progress (${uncheckedCriteria}/${totalCriteria} criteria failed).`);
            } catch (err) {
              // Log but don't fail the move — the verify card is already shipped
              ctx.logger.warn(`Auto-archive failed for ${card.id}: ${err}`);
            }
          }
        }
      } catch (err) {
        console.error(formatPluginError("mc-board", "move", err, [
          "Verify the card exists: openclaw mc-board show " + id,
          "Check column flow: backlog → in-progress → in-review → shipped",
          DOCTOR_SUGGESTION,
        ]));
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
Location: ~/.openclaw/USER/brain/archive/

Examples:
  miniclaw brain archive crd_abc123`)
    .action((id: string) => {
      try {
        const card = store.findById(id);
        if (card.column !== "shipped") {
          console.error(`Card ${card.id} is in "${card.column}" — only shipped cards can be archived.`);
          process.exit(1);
        }
        archive.archiveCard(card);
        store.delete(card.id);
        console.log(`Archived ${card.id}: ${card.title}`);
      } catch (err) {
        console.error(formatPluginError("mc-board", "archive", err, [
          "Verify the card exists: openclaw mc-board show " + id,
          "Only shipped cards can be archived — check: openclaw mc-board list --column shipped",
          DOCTOR_SUGGESTION,
        ]));
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

  // ---- brain delete <id> ----
  brain
    .command("delete <id>")
    .alias("remove")
    .description("Delete a card from the board (irreversible — use archive for shipped cards)")
    .option("--force", "Skip confirmation prompt")
    .action((id: string, opts: { force?: boolean }) => {
      try {
        const card = store.findById(id);
        if (!opts.force) {
          console.error(`Refusing to delete without --force. Run: openclaw mc-board delete ${id} --force`);
          console.error(`  Card: ${card.id} (${card.column}): "${card.title}"`);
          process.exit(1);
        }
        store.delete(id);
        console.log(`Deleted ${card.id}: ${card.title}`);
      } catch (err) {
        console.error(formatPluginError("mc-board", "delete", err, [
          "Verify the card exists: openclaw mc-board list",
          DOCTOR_SUGGESTION,
        ]));
        process.exit(1);
      }
    });

  // ---- brain search ----
  brain
    .command("search <query>")
    .description("Search cards by title, tags, or problem description (case-insensitive)")
    .option("--column <col>", "Filter by column")
    .option("--project <id>", "Filter by project ID")
    .addHelpText("after", `
Searches all active cards for the query string.

Examples:
  openclaw mc-board search "login"
  openclaw mc-board search "sqlite" --column backlog`)
    .action((query: string, opts: { column?: string; project?: string }) => {
      const q = query.toLowerCase();
      let cards = store.list(opts.column as Column | undefined);
      if (opts.project) cards = cards.filter(c => c.project_id === opts.project);
      const results = cards.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.tags.some(t => t.toLowerCase().includes(q)) ||
        c.problem_description.toLowerCase().includes(q) ||
        c.implementation_plan.toLowerCase().includes(q),
      );
      if (results.length === 0) {
        console.log(`No cards matching: ${query}`);
        return;
      }
      for (const card of results) {
        const tagsStr = card.tags.length > 0 ? `  [${card.tags.join(", ")}]` : "";
        const projStr = card.project_id ? `  {${card.project_id}}` : "";
        console.log(`${card.id}  [${card.column}]  [${card.priority}]  ${card.title}${tagsStr}${projStr}`);
      }
    });

  // ---- brain project ----
  const project = brain
    .command("project")
    .description("Manage projects — organize cards into named initiatives");

  // brain project create
  project
    .command("create")
    .description("Create a new project")
    .requiredOption("--name <name>", "Project name (required)")
    .option("--description <desc>", "Short description of the project")
    .option("--work-dir <path>", "Local working directory (absolute path to git repo)")
    .option("--github-repo <repo>", "GitHub/remote repo (e.g. owner/repo or full URL)")
    .option("--build-command <cmd>", "Shell command to run after shipping (e.g. 'npm run build && pm2 restart app')")
    .addHelpText("after", `
Projects are containers for cards. Create a project, then link cards to it
with 'brain create --project <id>' or 'brain update <id> --project <id>'.

Examples:
  miniclaw brain project create --name "Telegram Overhaul"
  miniclaw brain project create --name "v2 API" --description "REST redesign" --work-dir ~/projects/api --github-repo owner/api
  miniclaw brain project create --name "mc-board" --build-command 'cd ~/.openclaw/miniclaw/plugins/mc-board/web && npm run build'`)
    .action((opts: { name: string; description?: string; workDir?: string; githubRepo?: string; buildCommand?: string }) => {
      const proj = projects.create({ name: opts.name, description: opts.description, work_dir: opts.workDir, github_repo: opts.githubRepo, build_command: opts.buildCommand });
      console.log(`Created ${proj.id}: ${proj.name}`);
    });

  // brain project list
  project
    .command("list")
    .description("List all active projects with card counts")
    .option("--all", "Include archived projects")
    .addHelpText("after", `
  miniclaw brain project list
  miniclaw brain project list --all`)
    .action((opts: { all?: boolean }) => {
      const projs = projects.list(opts.all);
      const cards = store.list();
      const counts = new Map<string, number>();
      for (const card of cards) {
        if (card.project_id) counts.set(card.project_id, (counts.get(card.project_id) ?? 0) + 1);
      }
      console.log(renderProjectList(projs, counts));
    });

  // brain project show
  project
    .command("show <id>")
    .description("Show a project's full board — all cards in the project grouped by column")
    .addHelpText("after", `
  miniclaw brain project show prj_a1b2c3d4`)
    .action((id: string) => {
      try {
        const proj = projects.findById(id);
        const cards = store.listByProject(id);
        console.log(renderProjectBoard(proj, cards));
      } catch (err) {
        console.error(formatPluginError("mc-board", "project show", err, [
          "Run: openclaw mc-board project list — to see all projects",
          "Check the ID format: projects start with prj_",
        ]));
        process.exit(1);
      }
    });

  // brain project archive
  project
    .command("archive <id>")
    .description("Archive a project (hides it from the default list, cards are preserved)")
    .addHelpText("after", `
Archiving a project does not delete cards. Cards remain on the board and
can be re-linked to another project. Use --all on 'project list' to see
archived projects.

  miniclaw brain project archive prj_a1b2c3d4`)
    .action((id: string) => {
      try {
        const proj = projects.archive(id);
        console.log(`Archived project ${proj.id}: ${proj.name}`);
      } catch (err) {
        console.error(formatPluginError("mc-board", "project archive", err, [
          "Run: openclaw mc-board project list --all — to see all projects",
          DOCTOR_SUGGESTION,
        ]));
        process.exit(1);
      }
    });

  // brain project update
  project
    .command("update <id>")
    .description("Update a project's name, description, work dir, or repo")
    .option("--name <name>", "New project name")
    .option("--description <desc>", "New project description")
    .option("--work-dir <path>", "Local working directory (absolute path to git repo)")
    .option("--github-repo <repo>", "GitHub/remote repo (e.g. owner/repo or full URL)")
    .option("--build-command <cmd>", "Shell command to run after shipping (e.g. 'npm run build && pm2 restart app')")
    .addHelpText("after", `
  miniclaw brain project update prj_a1b2c3d4 --name "New Name"
  miniclaw brain project update prj_a1b2c3d4 --work-dir ~/projects/api --github-repo owner/api
  miniclaw brain project update prj_a1b2c3d4 --build-command 'cd ~/.openclaw/miniclaw/plugins/mc-board/web && npm run build'`)
    .action((id: string, opts: { name?: string; description?: string; workDir?: string; githubRepo?: string; buildCommand?: string }) => {
      if (!opts.name && opts.description === undefined && !opts.workDir && !opts.githubRepo && opts.buildCommand === undefined) {
        console.error("No fields to update. Provide --name, --description, --work-dir, --github-repo, or --build-command.");
        process.exit(1);
      }
      try {
        const proj = projects.update(id, { name: opts.name, description: opts.description, work_dir: opts.workDir, github_repo: opts.githubRepo, build_command: opts.buildCommand });
        console.log(`Updated project ${proj.id}: ${proj.name}`);
      } catch (err) {
        console.error(formatPluginError("mc-board", "project update", err, [
          "Run: openclaw mc-board project list — to see all projects",
          DOCTOR_SUGGESTION,
        ]));
        process.exit(1);
      }
    });

  const activeWork = new ActiveWorkStore(ctx.stateDir);

  // ---- brain pickup ----
  brain
    .command("pickup <id>")
    .description("Record that a worker has picked up a card to work on")
    .requiredOption("--worker <name>", "Worker name (e.g. board-worker-backlog)")
    .option("--column <col>", "Column being worked in (default: card's current column)")
    .addHelpText("after", `
Called by board worker crons to record which card they picked up.
Writes to active-work.json so the dashboard can show live agent activity.

Examples:
  openclaw mc-board pickup crd_abc123 --worker board-worker-backlog
  openclaw mc-board pickup crd_abc123 --worker board-worker-in-progress --column in-progress`)
    .action((id: string, opts: { worker: string; column?: string }) => {
      try {
        const card = store.findById(id);
        const entry = activeWork.pickup({
          cardId: card.id,
          projectId: card.project_id,
          title: card.title,
          worker: opts.worker,
          column: opts.column ?? card.column,
        });
        console.log(`Pickup recorded: ${entry.cardId} — ${entry.title} (worker: ${entry.worker})`);
      } catch (err) {
        console.error(formatPluginError("mc-board", "pickup", err, [
          "Verify the card exists: openclaw mc-board show " + id,
          DOCTOR_SUGGESTION,
        ]));
        process.exit(1);
      }
    });

  // ---- brain release ----
  brain
    .command("release <id>")
    .description("Record that a worker has finished with a card")
    .requiredOption("--worker <name>", "Worker name")
    .addHelpText("after", `
Called by board worker crons when they complete or hand off a card.
Removes it from the active-work.json live view.

  openclaw mc-board release crd_abc123 --worker board-worker-backlog`)
    .action((id: string, opts: { worker: string }) => {
      const released = activeWork.release(id, opts.worker);
      if (released) {
        console.log(`Released: ${id} (worker: ${opts.worker})`);
      } else {
        console.log(`${id} was not in active list (already released or never picked up)`);
      }
    });

  // ---- brain active ----
  brain
    .command("active")
    .description("Show all cards currently being actively worked by agent loops")
    .addHelpText("after", `
Shows real-time view of which tickets each cron worker has picked up.
Workers call 'pickup' at start and 'release' when done/moved.

  openclaw mc-board active`)
    .action(() => {
      const entries = activeWork.listActive();
      if (entries.length === 0) {
        console.log("No active agent loops.");
        return;
      }
      console.log(`Active agent loops (${entries.length}):\n`);
      for (const e of entries) {
        const age = Math.round((Date.now() - new Date(e.pickedUpAt).getTime()) / 1000);
        const ageStr = age < 60 ? `${age}s ago` : `${Math.round(age / 60)}m ago`;
        const proj = e.projectId ? ` [${e.projectId}]` : "";
        console.log(`  ${e.worker}${proj}`);
        console.log(`    card:   ${e.cardId} — ${e.title}`);
        console.log(`    column: ${e.column}`);
        console.log(`    picked: ${e.pickedUpAt} (${ageStr})`);
        console.log();
      }
    });

  // ---- brain pickup-log ----
  brain
    .command("pickup-log")
    .description("Show recent pickup/release history for all board workers")
    .option("--limit <n>", "Number of entries to show (default: 20)", "20")
    .addHelpText("after", `
Shows the last N pickup and release events across all board workers.
Useful for auditing which agent processed which ticket and when.

  openclaw mc-board pickup-log
  openclaw mc-board pickup-log --limit 50`)
    .action((opts: { limit: string }) => {
      const limit = parseInt(opts.limit, 10) || 20;
      const log = activeWork.recentLog(limit);
      if (log.length === 0) {
        console.log("No pickup history yet.");
        return;
      }
      for (const e of log) {
        const icon = e.action === "pickup" ? "▶" : "■";
        const proj = e.projectId ? ` [${e.projectId}]` : "";
        console.log(`${icon} ${e.at}  ${e.worker}${proj}  ${e.cardId}${e.title ? " — " + e.title : ""}  (${e.action})`);
      }
    });

  // ---- brain attach ----
  brain
    .command("attach <id>")
    .description("Attach a file or reference to a card")
    .requiredOption("--path <path>", "File path or URL to attach")
    .option("--label <label>", "Human-readable label for the attachment")
    .option("--mime <mime>", "MIME type (default: auto-detect or application/octet-stream)")
    .option("--type <type>", "Attachment type (e.g. research_report, web_search, file)")
    .option("--ref-id <id>", "Reference ID to source record (e.g. research.db row id)")
    .addHelpText("after", `
Attach a file, URL, or reference to a card. Other plugins (e.g. mc-research)
use this to automatically link deliverables to cards.

Examples:
  openclaw mc-board attach crd_abc123 --path ~/reports/findings.md --label "Research findings"
  openclaw mc-board attach crd_abc123 --path ~/media/mockup.png --label "UI mockup" --mime image/png
  openclaw mc-board attach crd_abc123 --path "research://42" --type research_report --ref-id 42 --label "Market analysis"`)
    .action((id: string, opts: { path: string; label?: string; mime?: string; type?: string; refId?: string }) => {
      try {
        const card = store.addAttachment(id, {
          path: opts.path,
          label: opts.label,
          mime: opts.mime,
          type: opts.type,
          ref_id: opts.refId ? parseInt(opts.refId, 10) : undefined,
        });
        const count = card.attachments?.length ?? 0;
        console.log(`Attached to ${card.id}: ${opts.path} (${count} total attachments)`);
      } catch (err) {
        console.error(formatPluginError("mc-board", "attach", err, [
          "Verify the card exists: openclaw mc-board show " + id,
          "Check the file path exists and is accessible",
          DOCTOR_SUGGESTION,
        ]));
        process.exit(1);
      }
    });

  // ---- brain attachments ----
  brain
    .command("attachments <id>")
    .description("List all attachments on a card")
    .addHelpText("after", `
Shows all files and references attached to a card.

  openclaw mc-board attachments crd_abc123`)
    .action((id: string) => {
      try {
        const card = store.findById(id);
        const attachments = card.attachments ?? [];
        if (attachments.length === 0) {
          console.log(`No attachments on ${id}.`);
          return;
        }
        console.log(`Attachments on ${id} (${attachments.length}):\n`);
        for (const a of attachments) {
          const label = a.label ? ` — ${a.label}` : "";
          const type = a.type ? ` [${a.type}]` : "";
          const mime = a.mime ? ` (${a.mime})` : "";
          console.log(`  ${a.path}${label}${type}${mime}  ${a.created_at}`);
        }
      } catch (err) {
        console.error(formatPluginError("mc-board", "attachments", err, [
          "Verify the card exists: openclaw mc-board show " + id,
          DOCTOR_SUGGESTION,
        ]));
        process.exit(1);
      }
    });

  // ---- brain check-dupes ----
  brain
    .command("check-dupes")
    .description("Data integrity check (SQLite PRIMARY KEY enforces uniqueness — always clean)")
    .option("--fix", "No-op with SQLite storage (kept for script compatibility)")
    .action(() => {
      console.log("SQLite store: duplicate IDs are structurally impossible. Board integrity OK.");
    });

  // ---- brain triage ----
  brain
    .command("triage <cardId>")
    .description("Run Haiku triage on a backlog card: enrich it and move to in-progress if ready")
    .option("--prompt <path>", "Path to triage prompt file (uses default if not found)")
    .option("--worker <name>", "Worker name for pickup/release/work_log", "board-worker-triage")
    .option("--log <path>", "Path to write log file (auto-generated if not specified)")
    .option("--no-move", "Skip auto-move even if Haiku says card is ready")
    .addHelpText("after", `
Runs Haiku in sandboxed mode to enrich the card with research and notes.
If Haiku determines the card is fully defined (problem + plan + criteria),
it sets move_to=in-progress in the APPLY block and the card is moved.
If the move fails (gate check fails), the error is written to card notes.

Used by: web UI triage button, cron job backlog checker.

  openclaw mc-board triage crd_abc123
  openclaw mc-board triage crd_abc123 --worker cron-backlog --no-move
  openclaw mc-board triage crd_abc123 --log ~/.openclaw/logs/triage.log`)
    .action((cardId: string, opts: { prompt?: string; worker: string; log?: string; move: boolean }) => {
      const card = store.findById(cardId);
      if (!card) {
        console.error(`Card not found: ${cardId}`);
        process.exit(1);
      }
      if (card.column !== "backlog") {
        console.error(`Card ${cardId} is in "${card.column}", not "backlog". Triage only applies to backlog.`);
        process.exit(1);
      }

      const project = card.project_id ? projects.findById(card.project_id) : null;

      // Resolve log path
      const logDir = path.join(ctx.stateDir, "logs", "backlog-triage");
      fs.mkdirSync(logDir, { recursive: true });
      const ts0 = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const logFile = opts.log ?? path.join(logDir, `${ts0}-${cardId}.log`);
      const logStream = fs.createWriteStream(logFile, { flags: "a" });

      const t0 = Date.now();
      const ts = () => `+${((Date.now() - t0) / 1000).toFixed(2)}s`;
      function log(msg: string) { logStream.write(msg); process.stdout.write(msg); }

      // Resolve prompt
      const BRAIN_DIR = path.join(ctx.stateDir, "USER", "brain");
      const defaultPromptPath = path.join(BRAIN_DIR, "prompts", "backlog-process.txt");
      const promptPath2 = opts.prompt ?? (fs.existsSync(defaultPromptPath) ? defaultPromptPath : null);
      const DEFAULT_PROMPT = `You are a triage processor for the Brain board. This prompt runs both on-demand (web UI) and via the periodic cron job that checks the backlog column.

You are given a single card in full detail. Your job:

1. Review the existing problem description, plan, and acceptance criteria
2. Fill in the research section with relevant technical context, known issues, related code patterns, or documentation links that would help an agent implement this card
3. Identify gaps or ambiguities in the implementation plan and note them in the notes field
4. Assess readiness: does this card have everything needed to be worked on? (clear problem, acceptance criteria, implementation plan, project context)
5. Do NOT check off acceptance criteria — that is the agent's job after doing the work
6. Append a concise work log note summarizing what you found in this triage pass

Card:
{{CARD}}
`;
      const promptTemplate = promptPath2 ? fs.readFileSync(promptPath2, "utf8") : DEFAULT_PROMPT;

      // Build card markdown
      const cardLines = [
        `# ${card.title}`,
        `ID: ${cardId}`,
        `Column: ${card.column}`,
        `Priority: ${card.priority}`,
        card.tags.length > 0 ? `Tags: ${card.tags.join(", ")}` : "",
        project ? `Project: ${project.name}` : "",
        project?.work_dir ? `Work dir: ${project.work_dir}` : "",
        project?.github_repo ? `GitHub repo: ${project.github_repo}` : "",
        project?.build_command ? `Build command: ${project.build_command}` : "",
        "",
        card.problem_description ? `## Problem\n${card.problem_description}` : "",
        card.implementation_plan ? `## Plan\n${card.implementation_plan}` : "",
        card.acceptance_criteria ? `## Criteria\n${card.acceptance_criteria}` : "",
        card.notes ? `## Notes\n${card.notes}` : "",
        card.research ? `## Research\n${card.research}` : "",
      ].filter(Boolean).join("\n");

      const APPLY_INSTRUCTION = `

After your analysis, output the result as JSON under exactly this header (no markdown fences):
---APPLY---
{"id":"${cardId}","research":"...","notes":"...","work_log":{"worker":"${opts.worker}","note":"..."},"move_to":"in-progress"}
---END---

Rules:
- "id" must be exactly "${cardId}"
- Only include fields you actually changed
- "work_log" is a single entry object: {worker, note}
- Do NOT check off acceptance criteria boxes
- "research" replaces the existing research field — be comprehensive
- "move_to": set to "in-progress" ONLY if the card has ALL of: (1) clear problem_description, (2) acceptance_criteria, (3) implementation_plan, AND the work appears well-scoped and actionable. If any are missing or vague, omit "move_to" entirely.`;

      const fullPrompt = promptTemplate.replace("{{CARD}}", cardLines) + APPLY_INSTRUCTION;

      // Setup run dir
      const runDir = path.join(ctx.stateDir, "tmp", `${ts0}-${cardId}`);
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, "CLAUDE.md"), [
        `# Triage: ${card.title}`,
        "",
        `Card: ${cardId} (backlog)`,
        "This is a sandboxed non-interactive session. Do not use tools.",
        "Respond only with your analysis and the APPLY block.",
      ].join("\n"));

      const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
      const debugFile = path.join(logDir, `${ts0}-${cardId}.debug.log`);
      fs.writeFileSync(debugFile, "");

      // Pickup
      const activeWork = new ActiveWorkStore(ctx.stateDir);
      activeWork.pickup({ cardId, worker: opts.worker, column: card.column, title: card.title, projectId: card.project_id ?? undefined });
      log(`[${ts()}] triage: ${cardId} — ${card.title}\n`);
      log(`[${ts()}] log: ${logFile}\n`);

      const { CLAUDECODE: _cc, ...env } = process.env as Record<string, string | undefined>;
      if (!env.TMPDIR) env.TMPDIR = os.tmpdir();

      const proc = spawn(CLAUDE_BIN, [
        "-p", fullPrompt,
        "--model", "claude-haiku-4-5-20251001",
        "--output-format", "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--debug-file", debugFile,
        "--mcp-config", '{"mcpServers":{}}',
        "--strict-mcp-config",
      ], { env: env as NodeJS.ProcessEnv, cwd: runDir, stdio: ["ignore", "pipe", "pipe"] });

      log(`[${ts()}] pid ${proc.pid}\n`);

      let buf = "";
      let fullOutput = "";

      const NOISE = /ENOENT|Broken symlink|detectFileEncoding|managed-settings|settings\.local|\[DEBUG\]/;
      const tail = spawn("tail", ["-f", debugFile]);
      tail.stdout.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString().split("\n").filter((l: string) => l.trim())) {
          if (NOISE.test(line)) continue;
          try {
            const entry = JSON.parse(line);
            const msg = entry.message ?? entry.msg ?? line;
            if (!NOISE.test(msg)) log(`  [dbg] ${msg}\n`);
          } catch { log(`  [dbg] ${line}\n`); }
        }
      });

      proc.stdout!.on("data", (chunk: Buffer) => {
        buf += chunk.toString();
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === "content_block_delta" && msg.delta?.type === "text_delta") {
              fullOutput += msg.delta.text;
              logStream.write(msg.delta.text);
            }
            if (msg.type === "result" && typeof msg.result === "string") {
              fullOutput += msg.result;
              logStream.write(msg.result);
            }
          } catch { logStream.write(line + "\n"); }
        }
      });

      proc.stderr!.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString().split("\n")) {
          if (line.trim() && !NOISE.test(line)) log(line + "\n");
        }
      });

      proc.on("close", (code: number | null) => {
        setTimeout(() => tail.kill(), 300);
        if (buf.trim()) { fullOutput += buf; logStream.write(buf); }
        log(`\n[${ts()}] done (exit ${code})\n`);

        const match = fullOutput.match(/---APPLY---\s*([\s\S]*?)---END---/);
        if (match) {
          try {
            const raw = JSON.parse(match[1].trim()) as Record<string, unknown>;
            const id = String(raw.id ?? "");
            if (id === cardId) {
              const updates: Parameters<typeof store.update>[1] = {};
              if (typeof raw.research === "string") updates.research = raw.research;
              if (typeof raw.notes === "string") updates.notes = raw.notes;
              if (typeof raw.priority === "string" && ["critical","high","medium","low"].includes(raw.priority)) {
                updates.priority = raw.priority as Priority;
              }
              if (Array.isArray(raw.tags)) updates.tags = raw.tags as string[];
              if (Object.keys(updates).length > 0) {
                store.update(cardId, updates);
                log(`\n[${ts()}] applied: ${Object.keys(updates).join(", ")}\n`);
              }
              if (raw.work_log && typeof raw.work_log === "object") {
                const wl = raw.work_log as { worker?: string; note?: string };
                if (wl.note) {
                  store.appendWorkLog(cardId, { worker: wl.worker ?? opts.worker, note: wl.note });
                  log(`[${ts()}] work_log appended\n`);
                }
              }
              if (opts.move !== false && raw.move_to === "in-progress") {
                log(`[${ts()}] triage: moving card to in-progress\n`);
                try {
                  const currentCard = store.findById(cardId);
                  const gate = checkGate(currentCard, "in-progress");
                  if (!gate.ok) {
                    throw new Error(formatGateError("backlog", "in-progress", gate.failures));
                  }
                  store.move(currentCard, "in-progress");
                  log(`[${ts()}] moved to in-progress\n`);
                } catch (moveErr) {
                  const errMsg = String(moveErr);
                  log(`[${ts()}] move failed: ${errMsg}\n`);
                  const currentCard = store.findById(cardId);
                  const existing = currentCard?.notes ?? "";
                  const errNote = `${existing ? existing + "\n\n" : ""}Triage move error (${new Date().toISOString().slice(0, 16)}):\n${errMsg}`;
                  store.update(cardId, { notes: errNote });
                }
              }
            } else {
              log(`\n[${ts()}] APPLY id mismatch (got ${id}, expected ${cardId})\n`);
            }
          } catch (e) { log(`\n[${ts()}] APPLY parse error: ${String(e)}\n`); }
        } else {
          log(`\n[${ts()}] no APPLY block — nothing written\n`);
        }

        activeWork.release(cardId, opts.worker);
        log(`[${ts()}] released\n`);
        logStream.end(() => process.exit(code ?? 0));
      });

      proc.on("error", (err: Error) => {
        tail.kill();
        log(`\n[${ts()}] error: ${err.message}\n`);
        activeWork.release(cardId, opts.worker);
        logStream.end(() => process.exit(1));
      });
    });

  // ---- brain plan ----
  brain
    .command("plan <file>")
    .description("Ingest a planning doc and create cards with dependencies and an epic")
    .option("--project <id>", "Link all created cards to a project by ID (prj_<hex>)")
    .option("--dry-run", "Print cards that would be created without writing them")
    .option("--model <model>", "Claude model to use for decomposition", "claude-haiku-4-5-20251001")
    .addHelpText("after", `
Reads a markdown or text planning document and uses a Claude agent to decompose
it into board cards: one epic card for the top-level initiative and sub-task
cards with dependencies between them.

Cards are created in dependency order so blocked cards are correctly linked.

Examples:
  openclaw mc-board plan ~/docs/v2-api-plan.md
  openclaw mc-board plan ~/docs/feature-plan.md --project prj_a1b2c3d4
  openclaw mc-board plan ~/docs/roadmap.md --dry-run
  openclaw mc-board plan ~/docs/sprint.md --model claude-sonnet-4-6`)
    .action((file: string, opts: { project?: string; dryRun?: boolean; model: string }) => {
      // Validate file
      if (!fs.existsSync(file)) {
        console.error(`File not found: ${file}`);
        process.exit(1);
      }
      const docContent = fs.readFileSync(file, "utf8");
      if (!docContent.trim()) {
        console.error(`File is empty: ${file}`);
        process.exit(1);
      }

      // Validate project if provided
      if (opts.project) {
        try { projects.findById(opts.project); } catch {
          console.error(`Project not found: ${opts.project}`);
          process.exit(1);
        }
      }

      const planPrompt = `You are a project planning agent. You will read a planning document and decompose it into structured board cards.

Your output will be used to automatically create cards on a kanban board. You must produce exactly one epic card for the top-level initiative and one or more sub-task cards.

RULES:
1. The epic card represents the top-level initiative. Tag it with "epic".
2. Sub-task cards should be discrete, actionable units of work.
3. For each sub-task, list which OTHER sub-tasks it depends on using their "key" field (the key you assign, e.g. "T1", "T2").
4. Keys are just labels for dependency linking — they are not card IDs.
5. Priority must be one of: critical, high, medium, low
6. Tags should be relevant short labels (e.g. "feature", "cli", "api", "bug", "docs")
7. problem_description: Explain WHY this work is needed
8. implementation_plan: HOW to implement it (numbered steps)
9. acceptance_criteria: What "done" looks like (markdown checkboxes: - [ ] ...)
10. depends_on: list of keys from other sub-tasks that must be completed first (empty array [] if none)
11. verify_url: The URL where the work can be verified live. REQUIRED for web/API/frontend/backend tasks. Use the specific page or endpoint (e.g. "http://localhost:3001/orders", not just "/"). For CLI tools use "cli:<command>" (e.g. "cli:npm run shop -- list"). Leave empty only for pure research or documentation cards.

PLANNING DOCUMENT:
${docContent}

Output the decomposition as JSON under exactly this header (no markdown fences):
---APPLY---
{
  "epic": {
    "title": "...",
    "problem_description": "...",
    "implementation_plan": "...",
    "acceptance_criteria": "- [ ] ...",
    "priority": "high",
    "tags": ["epic", "feature"]
  },
  "tasks": [
    {
      "key": "T1",
      "title": "...",
      "problem_description": "...",
      "implementation_plan": "...",
      "acceptance_criteria": "- [ ] ...",
      "priority": "medium",
      "tags": ["feature"],
      "depends_on": [],
      "verify_url": "http://localhost:3001/path"
    },
    {
      "key": "T2",
      "title": "...",
      "problem_description": "...",
      "implementation_plan": "...",
      "acceptance_criteria": "- [ ] ...",
      "priority": "medium",
      "tags": ["feature"],
      "depends_on": ["T1"],
      "verify_url": "http://localhost:3001/path"
    }
  ]
}
---END---

Be thorough. Extract all meaningful tasks from the document. If the document already has numbered steps or sections, each major section should become a task.`;

      const logDir = path.join(ctx.stateDir, "logs", "plan");
      fs.mkdirSync(logDir, { recursive: true });
      const ts0 = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const logFile = path.join(logDir, `${ts0}-plan.log`);
      const logStream = fs.createWriteStream(logFile, { flags: "a" });

      const t0 = Date.now();
      const ts = () => `+${((Date.now() - t0) / 1000).toFixed(2)}s`;
      function log(msg: string) { logStream.write(msg); process.stdout.write(msg); }

      const runDir = path.join(ctx.stateDir, "tmp", `${ts0}-plan`);
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(path.join(runDir, "CLAUDE.md"), [
        `# Plan: ${path.basename(file)}`,
        "",
        "This is a sandboxed non-interactive session. Do not use tools.",
        "Respond only with your decomposition and the APPLY block.",
      ].join("\n"));

      const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
      const debugFile = path.join(logDir, `${ts0}-plan.debug.log`);
      fs.writeFileSync(debugFile, "");

      const { CLAUDECODE: _cc, ...env } = process.env as Record<string, string | undefined>;
      if (!env.TMPDIR) env.TMPDIR = os.tmpdir();

      log(`[${ts()}] plan: ${path.basename(file)} → decomposing with ${opts.model}\n`);
      log(`[${ts()}] log: ${logFile}\n`);
      if (opts.dryRun) log(`[${ts()}] dry-run mode: cards will NOT be created\n`);

      const proc = spawn(CLAUDE_BIN, [
        "-p", planPrompt,
        "--model", opts.model,
        "--output-format", "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--debug-file", debugFile,
        "--mcp-config", '{"mcpServers":{}}',
        "--strict-mcp-config",
      ], { env: env as NodeJS.ProcessEnv, cwd: runDir, stdio: ["ignore", "pipe", "pipe"] });

      log(`[${ts()}] pid ${proc.pid}\n`);

      let buf = "";
      let fullOutput = "";

      const NOISE = /ENOENT|Broken symlink|detectFileEncoding|managed-settings|settings\.local|\[DEBUG\]/;
      const tail = spawn("tail", ["-f", debugFile]);
      tail.stdout.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString().split("\n").filter((l: string) => l.trim())) {
          if (NOISE.test(line)) continue;
          try {
            const entry = JSON.parse(line);
            const msg = entry.message ?? entry.msg ?? line;
            if (!NOISE.test(msg)) log(`  [dbg] ${msg}\n`);
          } catch { log(`  [dbg] ${line}\n`); }
        }
      });

      proc.stdout!.on("data", (chunk: Buffer) => {
        buf += chunk.toString();
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === "content_block_delta" && msg.delta?.type === "text_delta") {
              fullOutput += msg.delta.text;
              logStream.write(msg.delta.text);
            }
            if (msg.type === "result" && typeof msg.result === "string") {
              fullOutput += msg.result;
              logStream.write(msg.result);
            }
          } catch { logStream.write(line + "\n"); }
        }
      });

      proc.stderr!.on("data", (chunk: Buffer) => {
        for (const line of chunk.toString().split("\n")) {
          if (line.trim() && !NOISE.test(line)) log(line + "\n");
        }
      });

      proc.on("close", (code: number | null) => {
        setTimeout(() => tail.kill(), 300);
        if (buf.trim()) { fullOutput += buf; logStream.write(buf); }
        log(`\n[${ts()}] done (exit ${code})\n`);

        const match = fullOutput.match(/---APPLY---\s*([\s\S]*?)---END---/);
        if (!match) {
          log(`\n[${ts()}] no APPLY block found — nothing created\n`);
          logStream.end(() => process.exit(code ?? 1));
          return;
        }

        interface TaskSpec {
          key: string;
          title: string;
          problem_description?: string;
          implementation_plan?: string;
          acceptance_criteria?: string;
          priority?: string;
          tags?: string[];
          depends_on?: string[];
          verify_url?: string;
        }

        interface EpicSpec {
          title: string;
          problem_description?: string;
          implementation_plan?: string;
          acceptance_criteria?: string;
          priority?: string;
          tags?: string[];
          verify_url?: string;
        }

        interface PlanResult {
          epic?: EpicSpec;
          tasks?: TaskSpec[];
        }

        let plan: PlanResult;
        try {
          plan = JSON.parse(match[1].trim()) as PlanResult;
        } catch (e) {
          log(`\n[${ts()}] APPLY parse error: ${String(e)}\n`);
          logStream.end(() => process.exit(1));
          return;
        }

        if (!plan.epic) {
          log(`\n[${ts()}] no epic in APPLY block\n`);
          logStream.end(() => process.exit(1));
          return;
        }

        const tasks: TaskSpec[] = Array.isArray(plan.tasks) ? plan.tasks : [];

        // Dry-run: print what would be created
        if (opts.dryRun) {
          log(`\n[${ts()}] DRY RUN — cards that would be created:\n\n`);
          log(`EPIC: ${plan.epic.title}\n`);
          log(`  priority: ${plan.epic.priority ?? "high"}\n`);
          log(`  tags: ${(plan.epic.tags ?? ["epic"]).join(", ")}\n`);
          if (plan.epic.problem_description) log(`  problem: ${plan.epic.problem_description.slice(0, 80)}...\n`);
          log(`\n`);
          for (const task of tasks) {
            log(`TASK [${task.key}]: ${task.title}\n`);
            log(`  priority: ${task.priority ?? "medium"}\n`);
            log(`  tags: ${(task.tags ?? []).join(", ")}\n`);
            if (task.depends_on && task.depends_on.length > 0) log(`  depends_on: ${task.depends_on.join(", ")}\n`);
          }
          log(`\nTotal: 1 epic + ${tasks.length} tasks = ${1 + tasks.length} cards\n`);
          logStream.end(() => process.exit(0));
          return;
        }

        // Create epic card
        const epicTags = Array.isArray(plan.epic.tags) ? plan.epic.tags : ["epic"];
        if (!epicTags.includes("epic")) epicTags.unshift("epic");
        const epicPriority = normalizePriority(plan.epic.priority ?? "high") ?? "high";

        const epicCard = store.create({
          title: plan.epic.title,
          priority: epicPriority,
          tags: epicTags,
          project_id: opts.project,
          problem_description: plan.epic.problem_description ?? "",
          implementation_plan: plan.epic.implementation_plan ?? "",
          acceptance_criteria: plan.epic.acceptance_criteria ?? "",
        });
        log(`[${ts()}] created epic: ${epicCard.id} — ${epicCard.title}\n`);

        // Create sub-task cards — topological sort by depends_on keys
        // Map key → card ID once created
        const keyToId = new Map<string, string>();
        const taskMap = new Map<string, TaskSpec>(tasks.map(t => [t.key, t]));

        // Simple topological sort
        const visited = new Set<string>();
        const ordered: TaskSpec[] = [];

        function visit(key: string): void {
          if (visited.has(key)) return;
          visited.add(key);
          const task = taskMap.get(key);
          if (!task) return;
          for (const dep of task.depends_on ?? []) {
            visit(dep);
          }
          ordered.push(task);
        }

        for (const task of tasks) {
          visit(task.key);
        }

        for (const task of ordered) {
          const taskPriority = normalizePriority(task.priority ?? "medium") ?? "medium";
          const taskTags = Array.isArray(task.tags) ? task.tags : [];
          const dependsOnIds = (task.depends_on ?? [])
            .map(k => keyToId.get(k))
            .filter((id): id is string => id !== undefined);

          const card = store.create({
            title: task.title,
            priority: taskPriority,
            tags: taskTags,
            project_id: opts.project,
            depends_on: dependsOnIds.length > 0 ? dependsOnIds : undefined,
            problem_description: task.problem_description ?? "",
            implementation_plan: task.implementation_plan ?? "",
            acceptance_criteria: task.acceptance_criteria ?? "",
            verify_url: task.verify_url,
          });
          keyToId.set(task.key, card.id);
          const depStr = dependsOnIds.length > 0 ? ` (depends on: ${task.depends_on?.join(", ")})` : "";
          log(`[${ts()}] created task [${task.key}]: ${card.id} — ${card.title}${depStr}\n`);
        }

        log(`\n[${ts()}] plan complete: 1 epic + ${ordered.length} tasks created\n`);

        // Print dependency graph summary
        log(`\nDependency graph:\n`);
        log(`  ${epicCard.id} (EPIC): ${epicCard.title}\n`);
        for (const task of ordered) {
          const cardId2 = keyToId.get(task.key) ?? "?";
          const deps = (task.depends_on ?? []).map(k => keyToId.get(k) ?? k);
          const depStr = deps.length > 0 ? ` ← blocked by [${deps.join(", ")}]` : "";
          log(`  ${cardId2} [${task.key}]: ${task.title}${depStr}\n`);
        }

        logStream.end(() => process.exit(code ?? 0));
      });

      proc.on("error", (err: Error) => {
        tail.kill();
        log(`\n[${ts()}] error: ${err.message}\n`);
        logStream.end(() => process.exit(1));
      });
    });

}

function normalizePriority(p: string): Priority | null {
  const map: Record<string, Priority> = {
    critical: "critical", c: "critical",
    high: "high", h: "high",
    medium: "medium", med: "medium", m: "medium",
    low: "low", l: "low",
  };
  return map[p.toLowerCase()] ?? null;
}
