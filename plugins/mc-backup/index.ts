import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerBackupCommands } from "./cli/commands.js";
import { createBackupTools } from "./tools/definitions.js";

export interface BackupConfig {
  backupDir: string;
  stateDir: string;
  recentQuotaBytes: number;
  totalQuotaBytes: number;
  excludeDirs: string[];
}

const ONE_GB = 1_073_741_824;
const TWO_GB = 2_147_483_648;

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveConfig(api: OpenClawPluginApi): BackupConfig {
  const raw = (api.pluginConfig ?? {}) as Partial<BackupConfig>;
  const stateDir = resolvePath(
    process.env.OPENCLAW_STATE_DIR ?? "~/.openclaw",
  );
  const includeUserMedia = (raw as any).includeUserMedia ?? false;
  const defaultExcludes = [
    "projects",       // separate git repos — back up independently
    ".git",           // repo metadata
    "node_modules",   // reinstallable from lockfiles
    "backups",        // old manual backups
    "logs",           // ephemeral runtime logs
    "tmp",            // temp scratch space
    "browser",        // browser automation cache
    "media",          // legacy top-level media dir (pre-migration)
    ...(includeUserMedia ? [] : ["*/media"]), // user/<bot>/media/ — generated assets
  ];
  return {
    stateDir,
    backupDir: resolvePath(raw.backupDir ?? "~/.openclaw-backups"),
    recentQuotaBytes: raw.recentQuotaBytes ?? ONE_GB,
    totalQuotaBytes: raw.totalQuotaBytes ?? TWO_GB,
    excludeDirs: (raw as any).excludeDirs ?? defaultExcludes,
  };
}

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);
  api.logger.info(
    `mc-backup loading (stateDir=${cfg.stateDir}, backupDir=${cfg.backupDir})`,
  );

  api.registerCli((ctx) => {
    registerBackupCommands(
      { program: ctx.program, logger: api.logger },
      cfg,
    );
  });

  for (const tool of createBackupTools(cfg, api.logger)) {
    api.registerTool(tool);
  }

  api.logger.info("mc-backup loaded");
}
