import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";

export const dynamic = "force-dynamic";

const ZONES_PATH = path.join(
  process.env.OPENCLAW_STATE_DIR ?? path.join(process.env.HOME ?? "", ".openclaw", "miniclaw"),
  "USER", "brain", "office-zones.json"
);

export function GET() {
  try {
    if (fs.existsSync(ZONES_PATH)) {
      const data = JSON.parse(fs.readFileSync(ZONES_PATH, "utf-8"));
      return NextResponse.json(data);
    }
  } catch { /* zones file missing or malformed */ }
  return NextResponse.json({ zones: {} });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const dir = path.dirname(ZONES_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(ZONES_PATH, JSON.stringify(body, null, 2));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
