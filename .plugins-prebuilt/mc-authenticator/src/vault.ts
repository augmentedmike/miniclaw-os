import { execFileSync } from "node:child_process";

function vaultGet(vaultBin: string, key: string): string | null {
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

function vaultSet(vaultBin: string, key: string, value: string): void {
  execFileSync(vaultBin, ["set", key, value], { stdio: "inherit" });
}

function vaultRm(vaultBin: string, key: string): void {
  execFileSync(vaultBin, ["rm", key], { stdio: "inherit" });
}

function vaultList(vaultBin: string): string[] {
  try {
    const out = execFileSync(vaultBin, ["list"], {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (!out) return [];
    return out.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export interface TOTPEntry {
  secret: string;
  issuer: string;
  account: string;
  algorithm: string;
  digits: number;
  period: number;
}

const PREFIX = "totp-";

export function getTOTPEntry(vaultBin: string, name: string): TOTPEntry | null {
  const raw = vaultGet(vaultBin, `${PREFIX}${name}`);
  if (!raw) return null;
  return JSON.parse(raw) as TOTPEntry;
}

export function saveTOTPEntry(vaultBin: string, name: string, entry: TOTPEntry): void {
  vaultSet(vaultBin, `${PREFIX}${name}`, JSON.stringify(entry));
}

export function removeTOTPEntry(vaultBin: string, name: string): void {
  vaultRm(vaultBin, `${PREFIX}${name}`);
}

export function listTOTPEntries(vaultBin: string): string[] {
  const keys = vaultList(vaultBin);
  return keys
    .filter((k) => k.startsWith(PREFIX))
    .map((k) => k.slice(PREFIX.length));
}
