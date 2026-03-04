import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const SOUL_FILES = [
  "workspace/SOUL.md",
  "workspace/IDENTITY.md",
  "workspace/USER.md",
  "workspace/AGENTS.md",
  "workspace/HEARTBEAT.md",
  "workspace/TOOLS.md",
  "workspace/BOND.md",
  "openclaw.json",
];

export interface SnapshotMeta {
  name: string;
  createdAt: string;
  fileCount: number;
}

export interface SnapshotEntry {
  name: string;
  meta: SnapshotMeta | null;
}

/**
 * Resolve the active state directory.
 *
 * Priority:
 *   1. Plugin config stateDir (explicit override in openclaw.json)
 *   2. OPENCLAW_STATE_DIR env var (set by LaunchAgent for the gateway process)
 *   3. ~/.openclaw (fallback)
 */
export function resolveStateDir(configured?: string): string {
  const raw =
    configured?.trim() ||
    process.env.OPENCLAW_STATE_DIR?.trim() ||
    path.join(os.homedir(), ".openclaw");
  return raw.startsWith("~/") ? path.join(os.homedir(), raw.slice(2)) : raw;
}

export function backupsDir(stateDir: string): string {
  return path.join(stateDir, "soul-backups");
}

export function backup(stateDir: string, name: string): { count: number; skipped: string[] } {
  const dest = path.join(backupsDir(stateDir), name);

  if (fs.existsSync(dest)) {
    throw new Error(`snapshot '${name}' already exists`);
  }

  fs.mkdirSync(dest, { recursive: true });

  let count = 0;
  const skipped: string[] = [];

  for (const rel of SOUL_FILES) {
    const src = path.join(stateDir, rel);
    if (fs.existsSync(src)) {
      const destFile = path.join(dest, rel);
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.copyFileSync(src, destFile);
      count++;
    } else {
      skipped.push(rel);
    }
  }

  const meta: SnapshotMeta = {
    name,
    createdAt: new Date().toISOString(),
    fileCount: count,
  };
  fs.writeFileSync(path.join(dest, "meta.json"), JSON.stringify(meta, null, 2));

  return { count, skipped };
}

export function restore(stateDir: string, name: string): { count: number; skipped: string[] } {
  const src = path.join(backupsDir(stateDir), name);

  if (!fs.existsSync(src)) {
    throw new Error(`snapshot '${name}' not found`);
  }

  let count = 0;
  const skipped: string[] = [];

  for (const rel of SOUL_FILES) {
    const backupFile = path.join(src, rel);
    if (fs.existsSync(backupFile)) {
      const destFile = path.join(stateDir, rel);
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.copyFileSync(backupFile, destFile);
      count++;
    } else {
      skipped.push(rel);
    }
  }

  return { count, skipped };
}

export function list(stateDir: string): SnapshotEntry[] {
  const dir = backupsDir(stateDir);
  if (!fs.existsSync(dir)) return [];

  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  return entries.map((name) => {
    const metaPath = path.join(dir, name, "meta.json");
    let meta: SnapshotMeta | null = null;
    if (fs.existsSync(metaPath)) {
      try {
        meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as SnapshotMeta;
      } catch {
        // bad meta — leave null
      }
    }
    return { name, meta };
  });
}

export function diff(stateDir: string, name: string): string {
  const src = path.join(backupsDir(stateDir), name);
  if (!fs.existsSync(src)) {
    throw new Error(`snapshot '${name}' not found`);
  }

  const lines: string[] = [];

  for (const rel of SOUL_FILES) {
    const backupFile = path.join(src, rel);
    const currentFile = path.join(stateDir, rel);
    const inBackup = fs.existsSync(backupFile);
    const inCurrent = fs.existsSync(currentFile);

    if (inBackup && inCurrent) {
      const a = fs.readFileSync(backupFile, "utf8");
      const b = fs.readFileSync(currentFile, "utf8");
      if (a !== b) {
        lines.push(`--- snapshot/${rel}`);
        lines.push(`+++ current/${rel}`);
        lines.push(simpleDiff(a, b));
      }
    } else if (inBackup && !inCurrent) {
      lines.push(`MISSING in current: ${rel}`);
    } else if (!inBackup && inCurrent) {
      lines.push(`NEW (not in snapshot): ${rel}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "(no differences)";
}

export function remove(stateDir: string, name: string): void {
  const target = path.join(backupsDir(stateDir), name);
  if (!fs.existsSync(target)) {
    throw new Error(`snapshot '${name}' not found`);
  }
  fs.rmSync(target, { recursive: true, force: true });
}

function simpleDiff(a: string, b: string): string {
  const aLines = a.split("\n");
  const bLines = b.split("\n");
  const out: string[] = [];
  const max = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < max; i++) {
    const al = aLines[i];
    const bl = bLines[i];
    if (al !== bl) {
      if (al !== undefined) out.push(`- ${al}`);
      if (bl !== undefined) out.push(`+ ${bl}`);
    }
  }
  return out.join("\n");
}
