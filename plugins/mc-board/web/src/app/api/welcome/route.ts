import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { userDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

function flagFile(): string {
  return path.join(userDir(), ".welcome-done");
}

export function GET() {
  const done = fs.existsSync(flagFile());
  return NextResponse.json({ done });
}

export async function POST() {
  const f = flagFile();
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, new Date().toISOString() + "\n", "utf-8");
  return NextResponse.json({ ok: true });
}
