import { execSync } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";

function getDefaultVaultBin(): string {
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
  return path.join(stateDir, "miniclaw", "SYSTEM", "bin", "mc-vault");
}

export function vaultGet(key: string, vaultBin?: string): string | null {
  const bin = vaultBin ?? getDefaultVaultBin();
  try {
    const out = execSync(`${bin} get ${key}`, {
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
