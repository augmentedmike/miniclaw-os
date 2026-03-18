import { execSync } from "node:child_process";

export function vaultGet(vaultBin: string, key: string): string | null {
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

export function vaultSet(vaultBin: string, key: string, value: string): void {
  execSync(`${vaultBin} set ${key} ${JSON.stringify(value)}`, { stdio: "inherit" });
}

export function getStripeSecretKey(vaultBin: string): string | null {
  return vaultGet(vaultBin, "stripe-secret-key");
}

export function getStripePublishableKey(vaultBin: string): string | null {
  return vaultGet(vaultBin, "stripe-publishable-key");
}

export function saveStripeSecretKey(vaultBin: string, key: string): void {
  vaultSet(vaultBin, "stripe-secret-key", key);
}

export function saveStripePublishableKey(vaultBin: string, key: string): void {
  vaultSet(vaultBin, "stripe-publishable-key", key);
}
