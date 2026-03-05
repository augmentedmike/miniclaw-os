import * as path from "node:path";
import type { Command } from "commander";
import type { CardStore } from "../src/store.js";
import type { ProjectStore } from "../src/project-store.js";
import { formatConflictError } from "../src/dedup.js";
import { ActiveWorkStore } from "../src/active-work.js";
import { ArchiveStore } from "../src/archive.js";
import { COLUMNS, canTransition, checkGate, formatGateError } from "../src/state.js";
import {
  renderCardDetail,
  renderColumnContext,
  renderFullBoard,
  renderProjectBoard,
  renderProjectList,
  suggestNext,
} from "../src/board.js";
import type { Column, Priority } from "../src/card.js";
import { cardFilename } from "../src/card.js";

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
    .addHelpText("after", `
New cards always start in backlog. Fill in problem, plan, and criteria
before moving to in-progress.

Examples:
  miniclaw brain create --title "Fix login bug"
  miniclaw brain create --title "Add dark mode" --priority high --tags ui,miniclaw
  miniclaw brain create --title "API redesign" --project prj_a1b2c3d4
  miniclaw brain create --title "VERIFY: Fix login bug" --work-type verify --linked-card-id crd_abc123`)
    .action((opts: { title: string; priority: string; tags?: string; project?: string; workType?: string; linkedCardId?: string }) => {
      const priority = normalizePriority(opts.priority);
      if (!priority) {
        console.error(`Invalid priority: ${opts.priority}. Use: high, medium, low`);
        process.exit(1);
      }
      const tags = opts.tags
        ? opts.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
        : [];
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
      // Pre-create duplicate title check
      const conflict = store.checkTitleConflict(opts.title, { projectId: opts.project });
      if (conflict) {
        console.error(formatConflictError(opts.title, conflict));
        process.exit(1);
      }
      const card = store.create({ title: opts.title, priority, tags, project_id: opts.project, work_type, linked_card_id });
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
      if (opts.skipHold) cards = cards.filter(c => !c.tags.includes("on-hold"));
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
    .addHelpText("after", `
Outputs all cards in the column with full detail (problem, plan, criteria),
grouped by project and ordered by priority desc → oldest first.
Designed for feeding into a Haiku triage prompt to select the next candidates.

Tag a card as 'on-hold' to signal it's being worked on outside the queue:
  openclaw mc-board update <id> --tags "on-hold,<reason-tag>"
Then use --skip-hold so triage workers skip it automatically.

Examples:
  openclaw mc-board context --column backlog
  openclaw mc-board context --column backlog --skip-hold`)
    .action((opts: { column: string; skipHold?: boolean }) => {
      if (!COLUMNS.includes(opts.column as Column)) {
        console.error(`Invalid column: ${opts.column}. Valid: ${COLUMNS.join(", ")}`);
        process.exit(1);
      }
      let cards = store.list(opts.column as Column);
      if (opts.skipHold) cards = cards.filter(c => !c.tags.includes("on-hold"));
      const allProjects = projects.list();
      console.log(renderColumnContext(opts.column as Column, cards, allProjects));
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
    .option("--priority <priority>", "Priority: critical, high, medium, low")
    .option("--tags <tags>", "Comma-separated tags, e.g. miniclaw,build")
    .option("--problem <text>", "Problem description — why this work is needed")
    .option("--plan <text>", "Implementation plan — how to solve it")
    .option("--criteria <text>", "Acceptance criteria as markdown checklist (- [ ] / - [x])")
    .option("--notes <text>", "Notes / outcome — observations, decisions, results")
    .option("--review <text>", "Review notes — filled after critic/audit pass, required to ship")
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
        if (opts.tags !== undefined)
          updates.tags = opts.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
        if (opts.problem !== undefined) updates.problem_description = opts.problem;
        if (opts.plan !== undefined) updates.implementation_plan = opts.plan;
        if (opts.criteria !== undefined) updates.acceptance_criteria = opts.criteria;
        if (opts.notes !== undefined) updates.notes = opts.notes;
        if (opts.review !== undefined) updates.review_notes = opts.review;
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

        // ---- Auto-archive trigger for failed verify cards ----
        if (card.work_type === 'verify' && target === 'shipped') {
          // Check if the verify card has unchecked criteria (failure indicator)
          const unchecked = (card.acceptance_criteria.match(/^- \[ \]/gm) ?? []).length;
          if (unchecked > 0 && card.linked_card_id) {
            // Failed verify: archive this card and resurfacew the work card
            try {
              const workCard = store.findById(card.linked_card_id);
              
              // Archive the failed verify card
              const sourceFile = path.join(store.cardsDir, cardFilename(card));
              archive.archiveCard(card, sourceFile);
              
              // Clear all criteria checkboxes on work card
              const uncheckedCriteria = (workCard.acceptance_criteria.match(/^- \[x\]/gm) ?? []).length;
              const totalCriteria = (workCard.acceptance_criteria.match(/^- \[[ x]\]/gm) ?? []).length;
              
              // Reset all criteria to unchecked
              const resetCriteria = workCard.acceptance_criteria
                .split('\n')
                .map(line => line.replace(/^- \[x\]/, '- [ ]'))
                .join('\n');
              
              // Update work card with reset criteria and move back to in-progress
              store.update(workCard.id, { acceptance_criteria: resetCriteria });
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
    .addHelpText("after", `
Projects are containers for cards. Create a project, then link cards to it
with 'brain create --project <id>' or 'brain update <id> --project <id>'.

Examples:
  miniclaw brain project create --name "Telegram Overhaul"
  miniclaw brain project create --name "v2 API" --description "REST redesign initiative"`)
    .action((opts: { name: string; description?: string }) => {
      const proj = projects.create({ name: opts.name, description: opts.description });
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
        console.error(String(err));
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
        console.error(String(err));
        process.exit(1);
      }
    });

  // brain project update
  project
    .command("update <id>")
    .description("Update a project's name or description")
    .option("--name <name>", "New project name")
    .option("--description <desc>", "New project description")
    .addHelpText("after", `
  miniclaw brain project update prj_a1b2c3d4 --name "New Name"`)
    .action((id: string, opts: { name?: string; description?: string }) => {
      if (!opts.name && opts.description === undefined) {
        console.error("No fields to update. Provide --name or --description.");
        process.exit(1);
      }
      try {
        const proj = projects.update(id, { name: opts.name, description: opts.description });
        console.log(`Updated project ${proj.id}: ${proj.name}`);
      } catch (err) {
        console.error(String(err));
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
        console.error(String(err));
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

  // ---- brain check-dupes ----
  brain
    .command("check-dupes")
    .description("Detect cards with duplicate IDs across files (data integrity check)")
    .addHelpText("after", `
Scans the cards directory for files containing duplicate card IDs.
When duplicates are found, the list() command keeps the most recently
updated version — but stale files should be deleted manually.

  openclaw mc-board check-dupes`)
    .option("--fix", "Automatically delete stale duplicates, keeping the most recently updated file")
    .action((opts: { fix?: boolean }) => {
      const dupes = store.detectDuplicates();
      if (dupes.size === 0) {
        console.log("No duplicate card IDs found. Board integrity OK.");
        return;
      }
      console.error(`Found ${dupes.size} duplicate card ID(s):\n`);
      for (const [id, files] of dupes) {
        console.error(`  ${id}:`);
        // Sort by updated_at descending — keep the newest
        const sorted = [...files].sort((a, b) => {
          const ra = fs.statSync(path.join(store.cardsDir, a)).mtimeMs;
          const rb = fs.statSync(path.join(store.cardsDir, b)).mtimeMs;
          return rb - ra;
        });
        const [keep, ...stale] = sorted;
        console.error(`    keep:   ${keep}`);
        for (const f of stale) {
          if (opts.fix) {
            fs.unlinkSync(path.join(store.cardsDir, f));
            console.error(`    deleted: ${f}`);
          } else {
            console.error(`    stale:  ${f}`);
          }
        }
      }
      if (!opts.fix) {
        console.error(`\nRun with --fix to automatically delete stale duplicates.`);
        process.exit(1);
      }
      console.log(`\nFixed ${dupes.size} duplicate(s).`);
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
