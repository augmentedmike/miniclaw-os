import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";

export const dynamic = "force-dynamic";

function getActivePath(): string {
  const stateDir =
    process.env.OPENCLAW_STATE_DIR ??
    path.join(process.env.HOME ?? "", ".openclaw", "miniclaw");
  return path.join(stateDir, "USER", "brain", "office-layouts", "_active.json");
}

export function GET() {
  try {
    const filePath = getActivePath();
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      return NextResponse.json({ active: data.active ?? "default" });
    }
  } catch {}
  return NextResponse.json({ active: "default" });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { active } = body;

    if (!active || typeof active !== "string") {
      return NextResponse.json(
        { error: "active layout name is required" },
        { status: 400 }
      );
    }

    const filePath = getActivePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(filePath, JSON.stringify({ active }, null, 2));
    return NextResponse.json({ ok: true, active });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
