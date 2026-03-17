import type { Command } from "commander";
import type { UpdateConfig } from "../src/types.js";
import { checkAll, rollbackRepo } from "../src/updater.js";
import { loadState, saveState, acquireLock, releaseLock } from "../src/state.js";
import { runFullUpdate } from "../src/orchestrator.js";

export interface CliContext {
  program: Command;
  logger: {
    info: (m: string) => void;
    warn: (m: string) => void;
    error: (m: string) => void;
  };
}

export function registerUpdateCommands(ctx: CliContext, cfg: UpdateConfig): void {
  const { program } = ctx;

  const update = program
    .command("mc-update")
    .description("Self-update system for miniclaw-os, plugins, and core");

  // ── mc-update check ──
  update
    .command("check")
    .description("Check for available updates without applying them (dry run)")
    .action(() => {
      try {
        console.log("Checking for updates...\n");
        const results = checkAll(cfg);

        const state = loadState(cfg.pluginDir);
        state.lastCheck = new Date().toISOString();
        saveState(cfg.pluginDir, state);

        let updatesAvailable = 0;
        for (const r of results) {
          const status = r.hasUpdate ? "⬆ UPDATE AVAILABLE" : "✓ up to date";
          const refs = r.hasUpdate
            ? ` (${r.currentRef.slice(0, 8)} → ${r.remoteRef.slice(0, 8)})`
            : ` (${r.currentRef.slice(0, 8)})`;
          console.log(`  ${r.repo.name}: ${status}${refs}`);
          if (r.hasUpdate) updatesAvailable++;
        }

        console.log(
          `\n${updatesAvailable} update(s) available out of ${results.length} repo(s)`,
        );

        if (updatesAvailable === 0) {
          console.log("Everything is up to date.");
        } else {
          console.log('Run "mc-update now" to apply updates.');
        }
      } catch (err) {
        console.error(`Check failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  // ── mc-update now ──
  update
    .command("now")
    .description("Fetch stable tags, pull updates, rebuild, and verify with mc-smoke")
    .action(async () => {
      try {
        console.log("Starting update...\n");
        const result = await runFullUpdate(cfg, ctx.logger);

        switch (result) {
          case "success":
            console.log("\n✓ Update completed successfully.");
            break;
          case "no-updates":
            console.log("\n✓ Everything is already up to date.");
            break;
          case "rolled-back":
            console.log("\n⚠ Update failed verification — rolled back to previous version.");
            process.exit(1);
            break;
          case "locked":
            console.log("\n⚠ Another update is already running. Try again later.");
            process.exit(1);
            break;
          case "failed":
            console.log("\n✗ Update failed. Check logs for details.");
            process.exit(1);
            break;
        }
      } catch (err) {
        console.error(`Update failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  // ── mc-update rollback ──
  update
    .command("rollback")
    .description("Manually revert to pre-update refs from the last update")
    .action(() => {
      try {
        const state = loadState(cfg.pluginDir);

        if (state.rollbackRefs.length === 0) {
          console.log("No rollback refs available. No previous update to revert.");
          return;
        }

        console.log(`Rolling back ${state.rollbackRefs.length} repo(s)...\n`);

        if (!acquireLock(cfg.pluginDir)) {
          console.error("Cannot rollback: another update is running.");
          process.exit(1);
        }

        try {
          let allOk = true;
          for (const ref of state.rollbackRefs) {
            console.log(`  ${ref.name}: ${ref.updatedRef.slice(0, 8)} → ${ref.previousRef.slice(0, 8)}`);
            if (!rollbackRepo(ref, ctx.logger)) {
              console.error(`  ✗ Failed to rollback ${ref.name}`);
              allOk = false;
            } else {
              console.log(`  ✓ ${ref.name} rolled back`);
            }
          }

          // Clear rollback refs after successful rollback
          if (allOk) {
            state.rollbackRefs = [];
            state.lastResult = "rolled-back";
            saveState(cfg.pluginDir, state);
            console.log("\n✓ Rollback complete.");
          } else {
            saveState(cfg.pluginDir, state);
            console.error("\n⚠ Some repos failed to rollback.");
            process.exit(1);
          }
        } finally {
          releaseLock(cfg.pluginDir);
        }
      } catch (err) {
        console.error(`Rollback failed: ${err instanceof Error ? err.message : err}`);
        process.exit(1);
      }
    });

  // ── mc-update status ──
  update
    .command("status")
    .description("Show last update time, versions, and pass/fail result")
    .action(() => {
      const state = loadState(cfg.pluginDir);

      console.log("mc-update status\n");
      console.log(`  Last check:   ${state.lastCheck ?? "never"}`);
      console.log(`  Last update:  ${state.lastUpdate ?? "never"}`);
      console.log(`  Last result:  ${state.lastResult ?? "n/a"}`);
      console.log(`  Schedule:     ${cfg.updateTime}`);
      console.log(`  Auto-rollback: ${cfg.autoRollback ? "enabled" : "disabled"}`);

      if (Object.keys(state.versions).length > 0) {
        console.log("\n  Versions:");
        for (const [name, ref] of Object.entries(state.versions)) {
          console.log(`    ${name}: ${ref.slice(0, 8)}`);
        }
      }

      if (state.rollbackRefs.length > 0) {
        console.log(`\n  Rollback available: ${state.rollbackRefs.length} repo(s)`);
        for (const ref of state.rollbackRefs) {
          console.log(`    ${ref.name}: can revert to ${ref.previousRef.slice(0, 8)}`);
        }
      }
    });
}
