import type { Command } from "openclaw/plugin-sdk";
import type { Logger } from "openclaw/plugin-sdk";
import { backup, restore, list, diff, remove } from "../src/soul.js";

interface Deps {
  program: Command;
  stateDir: string;
  logger: Logger;
}

export function registerSoulCommands({ program, stateDir, logger }: Deps): void {
  const soul = program
    .command("soul")
    .description("Workspace snapshot and restore");

  // ── backup ──────────────────────────────────────────────────────────────
  soul
    .command("backup [name]")
    .description("Create a named snapshot of all soul files")
    .action((name?: string) => {
      const snapName = name ?? new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      try {
        const { count, skipped } = backup(stateDir, snapName);
        if (skipped.length) {
          for (const s of skipped) console.log(`  skipped (not found): ${s}`);
        }
        console.log(`snapshot '${snapName}' created (${count} files)`);
      } catch (e: unknown) {
        console.error(`error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  // ── restore ─────────────────────────────────────────────────────────────
  soul
    .command("restore <name>")
    .description("Restore a snapshot (overwrites current soul files)")
    .action((name: string) => {
      try {
        const { count, skipped } = restore(stateDir, name);
        if (skipped.length) {
          for (const s of skipped) console.log(`  skipped (not in snapshot): ${s}`);
        }
        console.log(`\nrestored ${count} files from '${name}'`);
      } catch (e: unknown) {
        console.error(`error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  // ── list ─────────────────────────────────────────────────────────────────
  soul
    .command("list")
    .description("List available snapshots")
    .action(() => {
      const snapshots = list(stateDir);
      if (snapshots.length === 0) {
        console.log("no snapshots found.");
        return;
      }
      const col1 = 32, col2 = 24;
      console.log(
        `${"NAME".padEnd(col1)}  ${"CREATED".padEnd(col2)}  FILES`,
      );
      console.log(`${"-".repeat(col1)}  ${"-".repeat(col2)}  -----`);
      for (const { name, meta } of snapshots) {
        const created = meta?.createdAt ?? "(unknown)";
        const files = meta?.fileCount?.toString() ?? "?";
        console.log(`${name.padEnd(col1)}  ${created.padEnd(col2)}  ${files}`);
      }
    });

  // ── diff ─────────────────────────────────────────────────────────────────
  soul
    .command("diff <name>")
    .description("Diff a snapshot against current soul files")
    .action((name: string) => {
      try {
        const result = diff(stateDir, name);
        console.log(result);
      } catch (e: unknown) {
        console.error(`error: ${(e as Error).message}`);
        process.exit(1);
      }
    });

  // ── delete ───────────────────────────────────────────────────────────────
  soul
    .command("delete <name>")
    .description("Delete a snapshot")
    .action((name: string) => {
      try {
        remove(stateDir, name);
        console.log(`deleted snapshot '${name}'`);
      } catch (e: unknown) {
        console.error(`error: ${(e as Error).message}`);
        process.exit(1);
      }
    });
}
