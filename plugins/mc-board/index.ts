/**
 * mc-board — OpenClaw plugin
 *
 * State-machine-backed kanban board as the agent's internal planning mechanism.
 * The "prefrontal cortex" — tracks tasks from backlog through to shipped.
 *
 * Storage: SQLite DB at <stateDir>/board.db (migrated from markdown files on first run)
 */

import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { openDb } from "./src/db.js";
import { migrateIfNeeded } from "./src/migrate.js";
import { CardStore } from "./src/store.js";
import { ProjectStore } from "./src/project-store.js";
import { renderCompactBoard, renderCompactBoardWithProjects } from "./src/board.js";
import { QmdClient } from "./src/qmd.js";
import { registerBrainCommands } from "./cli/commands.js";
import { brainTools } from "./tools/definitions.js";

// ---- Config types ----

interface BrainConfig {
  stateDir: string;
  qmdBin: string;
  qmdCollection: string;
}

function resolveConfig(api: OpenClawPluginApi): BrainConfig {
  const raw = (api.pluginConfig ?? {}) as Partial<{ cardsDir: string; qmdBin: string; qmdCollection: string }>;

  // stateDir = parent of cardsDir (the brain/ directory)
  const cardsDir = resolvePath(raw.cardsDir ?? "~/.openclaw/USER/augmentedmike_bot/brain/cards");
  const stateDir = path.dirname(cardsDir);

  const qmdBin = resolvePath(raw.qmdBin ?? "~/.bun/bin/qmd");
  const qmdCollection = raw.qmdCollection ?? "mc-board";

  return { stateDir, qmdBin, qmdCollection };
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

// ---- Plugin entry point ----

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);

  // Open (or create) the SQLite database, run schema migrations
  const db = openDb(cfg.stateDir);
  migrateIfNeeded(db, cfg.stateDir);

  const store = new CardStore(db);
  const projectStore = new ProjectStore(db);
  const qmd = new QmdClient(cfg.qmdBin, cfg.qmdCollection);

  api.logger.info(`mc-board loaded (stateDir=${cfg.stateDir}, db=board.db)`);

  // ---- Phase 1: CLI ----
  api.registerCli((ctx) => {
    registerBrainCommands(
      { program: ctx.program, stateDir: cfg.stateDir, logger: api.logger },
      store,
      projectStore,
    );
  });

  // ---- Phase 1: Context injection hook ----
  api.on("before_prompt_build", async (_event, _ctx) => {
    try {
      const cards = store.list();
      if (cards.length === 0) return;

      const projects = projectStore.list();
      const boardText = projects.length > 0
        ? renderCompactBoardWithProjects(cards, projects)
        : renderCompactBoard(cards);
      return { prependContext: boardText };
    } catch (err) {
      api.logger.warn(`mc-board: before_prompt_build error: ${err}`);
      return;
    }
  });

  // ---- Phase 2: Agent tools ----
  for (const tool of brainTools) {
    api.registerTool(tool);
  }
}
