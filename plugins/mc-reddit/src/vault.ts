import { execSync } from "node:child_process";

const DEFAULT_VAULT_BIN = `${process.env.HOME}/am/miniclaw/SYSTEM/bin/miniclaw-vault`;

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

export function vaultExport(key: string, vaultBin = DEFAULT_VAULT_BIN): string | null {
  try {
    const out = execSync(`${vaultBin} export ${key}`, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

export function vaultSet(key: string, value: string, vaultBin = DEFAULT_VAULT_BIN): void {
  const child = execSync(`${vaultBin} set ${key} -`, {
    input: value,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export function getCookies(vaultBin = DEFAULT_VAULT_BIN): string | null {
  return vaultExport("social-reddit-cookies", vaultBin);
}

export function getCookieFile(vaultBin = DEFAULT_VAULT_BIN): string | null {
  return vaultExport("social-reddit-cookie-file", vaultBin);
}

export function saveCookies(cookies: string, vaultBin = DEFAULT_VAULT_BIN): void {
  vaultSet("social-reddit-cookies", cookies, vaultBin);
}

export function saveCookieFile(filePath: string, vaultBin = DEFAULT_VAULT_BIN): void {
  vaultSet("social-reddit-cookie-file", filePath, vaultBin);
}
