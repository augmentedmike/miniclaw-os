import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { Logger } from "pino";
import type { BackupConfig } from "../index.js";

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

export function createBackupTools(
  cfg: BackupConfig,
  logger: Logger,
): AnyAgentTool[] {
  return [
    {
      name: "backup_now",
      label: "Create Backup",
      description:
        "Create a tgz backup of the entire openclaw state directory and prune old archives " +
        "per the tiered retention policy. Returns the backup path and size.",
      parameters: schema({}) as never,
      execute: async () => {
        logger.info("mc-backup/tool backup_now: starting");
        try {
          fs.mkdirSync(cfg.backupDir, { recursive: true });
          const ts = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .slice(0, 19);
          const dest = path.join(cfg.backupDir, `${ts}.tgz`);
          const parentDir = path.dirname(cfg.stateDir);
          const baseName = path.basename(cfg.stateDir);

          const excludeArgs = cfg.excludeDirs.map((d) => `--exclude=${d}`);
          const relBackup = path.relative(cfg.stateDir, cfg.backupDir);
          if (!relBackup.startsWith("..")) {
            excludeArgs.push(`--exclude=${relBackup}`);
          }

          execFileSync("tar", ["czf", dest, ...excludeArgs, "-C", parentDir, baseName], {
            timeout: 300_000,
          });

          const stat = fs.statSync(dest);
          const mb = (stat.size / 1_048_576).toFixed(1);
          logger.info(`mc-backup/tool backup_now: ${dest} (${mb} MB)`);
          return ok(`Backup created: ${dest} (${mb} MB)`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-backup/tool backup_now error: ${msg}`);
          return toolErr(`backup_now failed: ${msg}`);
        }
      },
    },
    {
      name: "backup_list",
      label: "List Backups",
      description:
        "List all backup archives with dates and sizes. " +
        "Use this to check backup health or find a specific restore point.",
      parameters: schema({}) as never,
      execute: async () => {
        logger.debug("mc-backup/tool backup_list");
        try {
          if (!fs.existsSync(cfg.backupDir)) return ok("No backups found.");
          const files = fs
            .readdirSync(cfg.backupDir)
            .filter((f) => f.endsWith(".tgz"))
            .sort()
            .reverse();
          if (files.length === 0) return ok("No backups found.");

          let total = 0;
          const lines = files.map((f) => {
            const stat = fs.statSync(path.join(cfg.backupDir, f));
            total += stat.size;
            return `${f}  ${(stat.size / 1_048_576).toFixed(1)} MB`;
          });
          lines.push(
            `\n${files.length} backup(s), ${(total / 1_048_576).toFixed(1)} MB total`,
          );
          return ok(lines.join("\n"));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-backup/tool backup_list error: ${msg}`);
          return toolErr(`backup_list failed: ${msg}`);
        }
      },
    },
  ];
}
