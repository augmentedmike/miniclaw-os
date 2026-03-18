import { execFileSync } from "node:child_process";

export function vaultGet(vaultBin: string, key: string): string | null {
  try {
    const out = execFileSync(vaultBin, ["get", key], {
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

export function vaultSet(vaultBin: string, key: string, value: string): void {
  execFileSync(vaultBin, ["set", key, value], { stdio: "inherit" });
}

export function getSquareAccessToken(vaultBin: string): string | null {
  return vaultGet(vaultBin, "square-access-token");
}

export function saveSquareAccessToken(vaultBin: string, token: string): void {
  vaultSet(vaultBin, "square-access-token", token);
}
