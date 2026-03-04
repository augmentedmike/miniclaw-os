/**
 * mc-board — OpenClaw plugin
 *
 * State-machine-backed kanban board as the agent's internal planning mechanism.
 * The "prefrontal cortex" — tracks tasks from backlog through to shipped.
 *
 * Phase 1: Core + CLI + Context hook
 * Phase 2: Agent tools
 * Phase 3: Web debug view (port 4220)
 */

import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { CardStore } from "./src/store.js";
import { ProjectStore } from "./src/project-store.js";
import { renderCompactBoard, renderCompactBoardWithProjects } from "./src/board.js";
import { QmdClient } from "./src/qmd.js";
import { registerBrainCommands } from "./cli/commands.js";
import { brainTools } from "./tools/definitions.js";

// ---- Config types ----

interface BrainConfig {
  cardsDir: string;
  qmdBin: string;
  qmdCollection: string;
}

function resolveConfig(api: OpenClawPluginApi): BrainConfig {
  const raw = (api.pluginConfig ?? {}) as Partial<BrainConfig & { webPort: number }>;

  const cardsDir = resolvePath(
    raw.cardsDir ?? "~/.openclaw/user/augmentedmike_bot/brain/cards",
  );
  const qmdBin = resolvePath(raw.qmdBin ?? "~/.bun/bin/qmd");
  const qmdCollection = raw.qmdCollection ?? "mc-board";

  return { cardsDir, qmdBin, qmdCollection };
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

// ---- Plugin entry point ----

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);
  const store = new CardStore(cfg.cardsDir);

  // stateDir is the parent of cardsDir (e.g. ~/.openclaw/.../brain/)
  const stateDir = path.dirname(cfg.cardsDir);
  const projectsDir = path.join(stateDir, "projects");
  const projectStore = new ProjectStore(projectsDir);

  const qmd = new QmdClient(cfg.qmdBin, cfg.qmdCollection);

  api.logger.info(`mc-board loaded (cardsDir=${cfg.cardsDir}, projectsDir=${projectsDir})`);

  // ---- Phase 1: CLI ----
  api.registerCli((ctx) => {
    registerBrainCommands(
      { program: ctx.program, stateDir, logger: api.logger },
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
      // Never crash the prompt build
      api.logger.warn(`mc-board: before_prompt_build error: ${err}`);
      return;
    }
  });

  // ---- Phase 2: Agent tools ----
  for (const tool of brainTools) {
    api.registerTool(tool);
  }
  // Web view runs as a standalone LaunchAgent (com.augmentedmike.mc-board-web)
}
