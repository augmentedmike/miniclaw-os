import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import type { Command } from "commander";
import type { BackupConfig } from "../index.js";

export interface CliContext {
  program: Command;
  logger: {
    info: (m: string) => void;
    warn: (m: string) => void;
    error: (m: string) => void;
  };
}

// ── Filename convention: 2026-03-11T14-30-00.tgz ──────────────────

function backupFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + ".tgz";
}

/** Parse date from backup filename. Returns null if not a valid backup file. */
function parseDateFromName(name: string): Date | null {
  const m = name.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})\.tgz$/,
  );
  if (!m) return null;
  return new Date(
    `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`,
  );
}

interface BackupEntry {
  name: string;
  path: string;
  date: Date;
  size: number;
}

function listBackups(backupDir: string): BackupEntry[] {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .map((name) => {
      const date = parseDateFromName(name);
      if (!date) return null;
      const full = path.join(backupDir, name);
      const stat = fs.statSync(full);
      return { name, path: full, date, size: stat.size };
    })
    .filter((e): e is BackupEntry => e !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime()); // newest first
}

// ── Retention logic ────────────────────────────────────────────────
//
// Walk backups newest→oldest, accumulating size.
//  - Under recentQuota: keep all (daily granularity)
//  - Under totalQuota:  keep only if day === 1 (monthly)
//  - Over totalQuota:   keep only if month === 0 (Jan) && day === 1 (yearly)
// Everything else gets deleted.

function pruneBackups(cfg: BackupConfig, dryRun = false): string[] {
  const entries = listBackups(cfg.backupDir);
  let cumSize = 0;
  const toDelete: string[] = [];

  for (const entry of entries) {
    cumSize += entry.size;
    const day = entry.date.getUTCDate();
    const month = entry.date.getUTCMonth(); // 0-indexed (Jan = 0)

    let keep: boolean;
    if (cumSize <= cfg.recentQuotaBytes) {
      keep = true; // recent window — keep all dailies
    } else if (cumSize <= cfg.totalQuotaBytes) {
      keep = day === 1; // monthly window — first of month only
    } else {
      keep = month === 0 && day === 1; // yearly window — Jan 1 only
    }

    if (!keep) {
      toDelete.push(entry.path);
      cumSize -= entry.size; // reclaim space since we're deleting it
    }
  }

  if (!dryRun) {
    for (const f of toDelete) fs.unlinkSync(f);
  }

  return toDelete;
}

// ── Commands ───────────────────────────────────────────────────────

export function registerBackupCommands(ctx: CliContext, cfg: BackupConfig): void {
  const { program } = ctx;

  const backup = program
    .command("mc-backup")
    .description(
      "Daily tgz backups with tiered retention (recent dailies → monthly → yearly)",
    );

  // ── mc-backup now ──
  backup
    .command("now")
    .description("Create a backup immediately and prune old archives")
    .option("--no-prune", "Skip pruning after backup")
    .action((opts: { prune: boolean }) => {
      try {
        fs.mkdirSync(cfg.backupDir, { recursive: true });

        const dest = path.join(cfg.backupDir, backupFilename());
        const parentDir = path.dirname(cfg.stateDir);
        const baseName = path.basename(cfg.stateDir);

        // Build exclude list: configured dirs + backup dir if nested
        const excludeArgs: string[] = cfg.excludeDirs.map(
          (d) => `--exclude=${d}`,
        );
        const relBackup = path.relative(cfg.stateDir, cfg.backupDir);
        if (!relBackup.startsWith("..")) {
          excludeArgs.push(`--exclude=${relBackup}`);
        }

        console.log(`Backing up ${cfg.stateDir} → ${dest}`);
        execSync(
          [
            "tar",
            "czf",
            dest,
            ...excludeArgs,
            "-C",
            parentDir,
            baseName,
          ]
            .map((a) => `'${a.replace(/'/g, "'\\''")}'`)
            .join(" "),
          { stdio: "inherit", timeout: 300_000 },
        );

        const stat = fs.statSync(dest);
        const mb = (stat.size / 1_048_576).toFixed(1);
        console.log(`Backup complete: ${dest} (${mb} MB)`);

        if (opts.prune) {
          const deleted = pruneBackups(cfg);
          if (deleted.length > 0) {
            console.log(`Pruned ${deleted.length} old backup(s):`);
            for (const d of deleted) console.log(`  - ${path.basename(d)}`);
          } else {
            console.log("No backups pruned.");
          }
        }
      } catch (err) {
        console.error(
          `Backup failed: ${err instanceof Error ? err.message : err}`,
        );
        process.exit(1);
      }
    });

  // ── mc-backup list ──
  backup
    .command("list")
    .alias("ls")
    .description("List all backup archives with sizes")
    .action(() => {
      const entries = listBackups(cfg.backupDir);
      if (entries.length === 0) {
        console.log("No backups found.");
        return;
      }
      let total = 0;
      for (const e of entries) {
        const mb = (e.size / 1_048_576).toFixed(1);
        total += e.size;
        console.log(`${e.name}  ${mb.padStart(8)} MB`);
      }
      console.log(
        `\n${entries.length} backup(s), ${(total / 1_048_576).toFixed(1)} MB total`,
      );
    });

  // ── mc-backup prune ──
  backup
    .command("prune")
    .description(
      "Delete old backups per retention policy (dailies → monthly → yearly)",
    )
    .option("--dry-run", "Show what would be deleted without deleting")
    .action((opts: { dryRun?: boolean }) => {
      const deleted = pruneBackups(cfg, opts.dryRun);
      if (deleted.length === 0) {
        console.log("Nothing to prune.");
        return;
      }
      const verb = opts.dryRun ? "Would delete" : "Deleted";
      console.log(`${verb} ${deleted.length} backup(s):`);
      for (const d of deleted) console.log(`  - ${path.basename(d)}`);
    });

  // ── mc-backup restore ──
  backup
    .command("restore <filename>")
    .description("Restore a backup archive (extracts to state dir parent)")
    .action((filename: string) => {
      const archivePath = filename.includes("/")
        ? filename
        : path.join(cfg.backupDir, filename);

      if (!fs.existsSync(archivePath)) {
        console.error(`Archive not found: ${archivePath}`);
        process.exit(1);
      }

      const parentDir = path.dirname(cfg.stateDir);
      console.log(`Restoring ${archivePath} → ${parentDir}/`);
      console.log(
        "WARNING: This will overwrite existing files. Ctrl-C to abort.",
      );

      execSync(`tar xzf '${archivePath.replace(/'/g, "'\\''")}' -C '${parentDir.replace(/'/g, "'\\''")}'`, {
        stdio: "inherit",
        timeout: 300_000,
      });

      console.log("Restore complete.");
    });
}
