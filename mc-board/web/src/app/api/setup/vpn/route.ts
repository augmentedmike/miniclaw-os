export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

const MULLVAD_CANDIDATES = [
  "/usr/local/bin/mullvad",
  "/usr/bin/mullvad",
  "/opt/homebrew/bin/mullvad",
  "/opt/local/bin/mullvad",
];

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(process.env.HOME || "", ".openclaw");
const VPN_STATE_DIR = path.join(STATE_DIR, ".vpn");
const AUTOCONNECT_FILE = path.join(VPN_STATE_DIR, "autoconnect.json");

function findBin(): string | null {
  for (const p of MULLVAD_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function runSafe(bin: string, args: string[], timeout = 10_000): string | null {
  try {
    return execFileSync(bin, args, { timeout, encoding: "utf-8" }).trim();
  } catch { /* command-failed */
    return null;
  }
}

function readAutoconnect(): { enabled: boolean; defaultCountry: string } {
  try {
    if (fs.existsSync(AUTOCONNECT_FILE)) {
      const raw = JSON.parse(fs.readFileSync(AUTOCONNECT_FILE, "utf-8"));
      return { enabled: !!raw.enabled, defaultCountry: raw.defaultCountry || "" };
    }
  } catch { /* autoconnect config missing or malformed */ }
  return { enabled: false, defaultCountry: "" };
}

function writeAutoconnect(data: { enabled?: boolean; defaultCountry?: string }) {
  const current = readAutoconnect();
  const next = { ...current, ...data };
  if (!fs.existsSync(VPN_STATE_DIR)) fs.mkdirSync(VPN_STATE_DIR, { recursive: true });
  fs.writeFileSync(AUTOCONNECT_FILE, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

/** GET — return VPN status, binary info, config */
export async function GET() {
  const bin = findBin();
  const installed = !!bin;
  let version = "";
  let connected = false;
  let country = "";
  let city = "";
  let ip = "";

  if (bin) {
    const vRaw = runSafe(bin, ["version"]) ?? "";
    const vMatch = vRaw.match(/(\d+\.\d+(?:\.\d+)?)/);
    version = vMatch ? vMatch[1] : vRaw;
    const raw = runSafe(bin, ["status"]);
    if (raw) {
      connected = /^Connected/i.test(raw);
      const locMatch = raw.match(/location:\s+(.+)/i);
      if (locMatch) {
        const parts = locMatch[1].split(",").map((s: string) => s.trim());
        country = parts[0] || "";
        city = parts[1] || "";
      }
      const ipMatch = raw.match(/IPv[46]:\s+(\S+)/);
      if (ipMatch) ip = ipMatch[1];
    }
  }

  const ac = readAutoconnect();

  return NextResponse.json({
    installed,
    bin: bin ?? "",
    version,
    connected,
    country,
    city,
    ip,
    autoConnect: ac.enabled,
    defaultCountry: ac.defaultCountry,
  });
}

/** POST — save account to vault, update autoConnect and defaultCountry */
export async function POST(req: Request) {
  const body = await req.json();
  const updates: { enabled?: boolean; defaultCountry?: string } = {};

  // Store account number in vault if provided
  if (typeof body.account === "string" && body.account.trim()) {
    const account = body.account.replace(/\s+/g, "").trim();
    const vaultRoot = path.join(STATE_DIR, "miniclaw", "SYSTEM", "vault");
    const vaultBin = ["/usr/local/bin/mc-vault", path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "mc-vault")]
      .find((p) => fs.existsSync(p));
    if (vaultBin) {
      try {
        execFileSync(vaultBin, ["set", "mullvad-account", account], {
          timeout: 10_000,
          encoding: "utf-8",
          env: { ...process.env, OPENCLAW_VAULT_ROOT: vaultRoot },
        });
      } catch (e) {
        return NextResponse.json({ ok: false, error: `Failed to store account in vault: ${e}` }, { status: 500 });
      }
    }

    // Also set account number in mullvad CLI if installed
    const bin = findBin();
    if (bin) {
      runSafe(bin, ["account", "login", account]);
    }
  }

  if (typeof body.autoConnect === "boolean") updates.enabled = body.autoConnect;
  if (typeof body.defaultCountry === "string") updates.defaultCountry = body.defaultCountry;

  // Set relay country in mullvad if provided
  if (body.defaultCountry) {
    const bin = findBin();
    if (bin) {
      runSafe(bin, ["relay", "set", "location", body.defaultCountry]);
    }
  }

  const next = writeAutoconnect(updates);

  return NextResponse.json({ ok: true, autoConnect: next.enabled, defaultCountry: next.defaultCountry });
}
