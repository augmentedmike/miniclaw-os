import { spawnSync } from "node:child_process";
import * as path from "node:path";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(process.env.HOME || "", ".openclaw");
const MINICLAW_DIR = path.join(STATE_DIR, "miniclaw");
const VAULT_BIN = path.join(MINICLAW_DIR, "vault", "cli");
const VAULT_ROOT = path.join(MINICLAW_DIR, "SYSTEM", "vault");

const vaultEnv = {
  ...process.env,
  OPENCLAW_VAULT_ROOT: VAULT_ROOT,
  PATH: `${MINICLAW_DIR}/SYSTEM/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}`,
};

export function vaultSet(key: string, value: string): { ok: boolean; error?: string } {
  const result = spawnSync(VAULT_BIN, ["set", key, "-"], {
    input: value,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    env: vaultEnv,
  });
  if (result.error) return { ok: false, error: result.error.message };
  if (result.status !== 0) return { ok: false, error: result.stderr?.trim() || "vault write failed" };
  return { ok: true };
}

export function vaultGet(key: string): string | null {
  const result = spawnSync(VAULT_BIN, ["export", key], {
    encoding: "utf-8",
    env: vaultEnv,
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim() || null;
}
