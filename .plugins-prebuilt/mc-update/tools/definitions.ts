import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { Logger } from "pino";
import type { UpdateConfig } from "../src/types.js";
import { checkAll } from "../src/updater.js";
import { loadState, saveState } from "../src/state.js";
import { runFullUpdate } from "../src/orchestrator.js";

function schema(
  props: Record<string, unknown>,
  required?: string[],
): unknown {
  return {
    type: "object",
    properties: props,
    required: required ?? [],
    additionalProperties: false,
  };
}

function ok(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    details: {},
  };
}

function toolErr(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    isError: true,
    details: {},
  };
}

export function createUpdateTools(
  cfg: UpdateConfig,
  logger: Logger,
): AnyAgentTool[] {
  return [
    {
      name: "update_check",
      label: "Check for Updates",
      description:
        "Check if any managed repos (miniclaw-os, openclaw, plugins) have " +
        "new stable-tagged versions available. Returns a list of repos with " +
        "their current and available versions. Does NOT apply any updates.",
      parameters: schema({}) as never,
      execute: async () => {
        logger.info("mc-update/tool update_check: starting");
        try {
          const results = checkAll(cfg);
          const state = loadState(cfg.pluginDir);
          state.lastCheck = new Date().toISOString();
          saveState(cfg.pluginDir, state);

          const lines = results.map((r) => {
            const status = r.hasUpdate ? "UPDATE AVAILABLE" : "up to date";
            const refs = r.hasUpdate
              ? `${r.currentRef.slice(0, 8)} → ${r.remoteRef.slice(0, 8)}`
              : r.currentRef.slice(0, 8);
            return `${r.repo.name}: ${status} (${refs})`;
          });

          const updatable = results.filter((r) => r.hasUpdate).length;
          lines.push(`\n${updatable} update(s) available`);

          return ok(lines.join("\n"));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-update/tool update_check error: ${msg}`);
          return toolErr(`update_check failed: ${msg}`);
        }
      },
    },
    {
      name: "update_now",
      label: "Apply Updates",
      description:
        "Fetch stable tags, pull updates, rebuild npm dependencies, and run " +
        "mc-smoke to verify. Takes an mc-backup snapshot first. Auto-rolls back " +
        "if smoke fails (when autoRollback is enabled). workspace/ and USER/ " +
        "directories are never modified.",
      parameters: schema({}) as never,
      execute: async () => {
        logger.info("mc-update/tool update_now: starting");
        try {
          const result = await runFullUpdate(cfg, logger);
          switch (result) {
            case "success":
              return ok("Update completed successfully. All smoke tests passed.");
            case "no-updates":
              return ok("Everything is already up to date.");
            case "rolled-back":
              return toolErr(
                "Update failed smoke verification and was rolled back to the previous version.",
              );
            case "locked":
              return toolErr(
                "Another update is already running. Try again later.",
              );
            case "failed":
              return toolErr("Update failed. Check logs for details.");
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-update/tool update_now error: ${msg}`);
          return toolErr(`update_now failed: ${msg}`);
        }
      },
    },
    {
      name: "update_status",
      label: "Update Status",
      description:
        "Query the last update time, current versions of all managed repos, " +
        "and whether the last update succeeded or failed.",
      parameters: schema({}) as never,
      execute: async () => {
        logger.info("mc-update/tool update_status");
        try {
          const state = loadState(cfg.pluginDir);
          const lines = [
            `Last check: ${state.lastCheck ?? "never"}`,
            `Last update: ${state.lastUpdate ?? "never"}`,
            `Last result: ${state.lastResult ?? "n/a"}`,
            `Schedule: ${cfg.updateTime}`,
            `Auto-rollback: ${cfg.autoRollback ? "enabled" : "disabled"}`,
          ];

          if (Object.keys(state.versions).length > 0) {
            lines.push("\nVersions:");
            for (const [name, ref] of Object.entries(state.versions)) {
              lines.push(`  ${name}: ${ref.slice(0, 8)}`);
            }
          }

          if (state.rollbackRefs.length > 0) {
            lines.push(`\nRollback available: ${state.rollbackRefs.length} repo(s)`);
          }

          return ok(lines.join("\n"));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-update/tool update_status error: ${msg}`);
          return toolErr(`update_status failed: ${msg}`);
        }
      },
    },
  ];
}
