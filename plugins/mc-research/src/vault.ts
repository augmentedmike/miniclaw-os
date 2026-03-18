import { execSync } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
const DEFAULT_VAULT_BIN = path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "mc-vault");

export function vaultGet(key: string, vaultBin = DEFAULT_VAULT_BIN): string | null {
  try {
    const out = execSync(`${vaultBin} get ${key}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (out.includes(" = ")) {
      return out.split(" = ").slice(1).join(" = ").trim() || null;
    }
    return out || null;
  } catch {
    return null;
  }
}

export function getPerplexityApiKey(): string | null {
  return vaultGet("research-perplexity-api-key");
}

export function getSerpApiKey(): string | null {
  return vaultGet("research-serp-api-key");
}

export function getGoogleSearchApiKey(): string | null {
  return vaultGet("research-google-api-key");
}

export function getGoogleSearchCx(): string | null {
  return vaultGet("research-google-cx");
}

export function getBingApiKey(): string | null {
  return vaultGet("research-bing-api-key");
}
