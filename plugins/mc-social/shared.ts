import fs from "fs";
import path from "path";
import os from "os";

export function socialDir(): string {
  const dir = path.join(os.homedir(), ".openclaw", "miniclaw", "USER", "social");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function engagementLogPath(): string {
  return path.join(socialDir(), "engagement-log.json");
}

export function targetReposPath(): string {
  return path.join(socialDir(), "target-repos.json");
}

export function readJsonArray(filePath: string): unknown[] {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "[]", "utf-8");
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function writeJsonArray(filePath: string, data: unknown[]): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}
