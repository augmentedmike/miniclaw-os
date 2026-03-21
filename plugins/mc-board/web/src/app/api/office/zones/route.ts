import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { zonesPath } from "@/lib/paths";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const zp = zonesPath();
    if (fs.existsSync(zp)) {
      const data = JSON.parse(fs.readFileSync(zp, "utf-8"));
      return NextResponse.json(data);
    }
  } catch {}
  return NextResponse.json({ zones: {} });
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const zp = zonesPath();
    const dir = path.dirname(zp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(zp, JSON.stringify(body, null, 2));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
