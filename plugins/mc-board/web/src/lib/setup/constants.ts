import * as path from "node:path";
import { execSync } from "node:child_process";

export const STATE_DIR =
  process.env.OPENCLAW_STATE_DIR ?? path.join(process.env.HOME || "", ".openclaw");

export function findBin(name: string): string | null {
  try {
    return execSync(`which ${name}`, { encoding: "utf-8" }).trim() || null;
  } catch {
    return null;
  }
}
