import { spawnSync } from "node:child_process";
import * as path from "node:path";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(process.env.HOME || "", ".openclaw");
const VAULT_BIN = path.join(STATE_DIR, "miniclaw", "system", "bin", "mc-vault");

export function vaultSet(key: string, value: string): { ok: boolean; error?: string } {
  const result = spawnSync(VAULT_BIN, ["set", key, "-"], {
    input: value,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (result.error) return { ok: false, error: result.error.message };
  if (result.status !== 0) return { ok: false, error: result.stderr?.trim() || "vault write failed" };
  return { ok: true };
}

export function vaultGet(key: string): string | null {
  const result = spawnSync(VAULT_BIN, ["export", key], { encoding: "utf-8" });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim() || null;
}
