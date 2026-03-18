import { execSync } from "node:child_process";

export function readCookieFromVault(vaultBin: string, vaultKey = "substack-sid"): string | null {
  try {
    const out = execSync(`${vaultBin} get ${vaultKey}`, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    return out || null;
  } catch {
    return null;
  }
}

export function saveCookieToVault(vaultBin: string, sid: string, vaultKey = "substack-sid"): void {
  execSync(`${vaultBin} set ${vaultKey} "${sid}"`, { stdio: "inherit" });
}
