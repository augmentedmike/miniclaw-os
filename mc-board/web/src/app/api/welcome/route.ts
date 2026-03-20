import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const dynamic = "force-dynamic";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
const FLAG_FILE = path.join(STATE_DIR, "USER", ".welcome-done");

export function GET() {
  const done = fs.existsSync(FLAG_FILE);
  return NextResponse.json({ done });
}

export async function POST() {
  fs.mkdirSync(path.dirname(FLAG_FILE), { recursive: true });
  fs.writeFileSync(FLAG_FILE, new Date().toISOString() + "\n", "utf-8");
  return NextResponse.json({ ok: true });
}
