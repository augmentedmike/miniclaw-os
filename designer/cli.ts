#!/usr/bin/env bun
/**
 * mc designer — standalone CLI entry point
 *
 * Call paths:
 *   ~/.openclaw/miniclaw/designer/cli.ts    Direct (via bun)
 *   mc designer <cmd>                Via miniclaw wrapper
 *   oc mc-designer <cmd>             Via openclaw plugin
 *
 * This file bootstraps the designer without requiring the openclaw runtime.
 * The openclaw plugin (index.ts) wraps the same registerDesignerCommands().
 */

import { Command } from "commander";
import { resolveConfig } from "./src/config.js";
import { DesignerStore } from "./src/store.js";
import { GeminiClient } from "./src/gemini.js";
import { readApiKeyFromVault } from "./src/vault.js";
import { registerDesignerCommands } from "./cli/commands.js";
import type { DesignerLogger } from "./cli/commands.js";

// ── Bootstrap config (no openclaw API needed) ─────────────────────────────────

const MINICLAW_HOME = process.env.MINICLAW_HOME
  ?? `${process.env.OPENCLAW_STATE_DIR ?? `${process.env.HOME}/.openclaw`}/miniclaw`;

const cfg = resolveConfig({
  mediaDir: `${process.env.OPENCLAW_STATE_DIR ?? `${process.env.HOME}/.openclaw`}/media/designer`,
  vaultBin: `${MINICLAW_HOME}/vault/cli`,
});

// Try vault for API key
if (!cfg.apiKey) {
  const vaultKey = readApiKeyFromVault(cfg.vaultBin);
  if (vaultKey) cfg.apiKey = vaultKey;
}

const store = new DesignerStore(cfg);
const gemini = new GeminiClient(cfg.apiKey, cfg.model);

// ── Console logger ────────────────────────────────────────────────────────────

const logger: DesignerLogger = {
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
};

// ── CLI ───────────────────────────────────────────────────────────────────────

const program = new Command()
  .name("mc designer")
  .description("Miniclaw Designer — visual creation studio");

// Register commands on a wrapper program, then re-parent under our top-level.
// registerDesignerCommands expects to call program.command("mc-designer"),
// so we give it a wrapper and pull the subcommand out.
const wrapper = new Command();
registerDesignerCommands({ program: wrapper, cfg, store, gemini, logger });

// The commands register under wrapper as "mc-designer" — steal its subcommands
const designerCmd = wrapper.commands.find((c) => c.name() === "mc-designer");
if (designerCmd) {
  for (const sub of designerCmd.commands) {
    program.addCommand(sub);
  }
}

program.parse(process.argv);
