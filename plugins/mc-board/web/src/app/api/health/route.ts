import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";

export const dynamic = "force-dynamic";

function getVersion(): string {
  const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(process.env.HOME || "", ".openclaw");
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(stateDir, "miniclaw", "MANIFEST.json"), "utf-8"));
    return manifest.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function GET() {
  return NextResponse.json({ ok: true, version: getVersion(), time: new Date().toISOString() });
}
