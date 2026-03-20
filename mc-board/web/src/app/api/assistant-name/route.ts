import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const dynamic = "force-dynamic";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

export function GET() {
  const stateFile = path.join(STATE_DIR, "USER", "setup-state.json");
  let shortName = "Am";
  try {
    if (fs.existsSync(stateFile)) {
      const data = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
      shortName = data.shortName || data.assistantName || "Am";
    }
  } catch { /* default */ }
  return NextResponse.json({ shortName });
}
