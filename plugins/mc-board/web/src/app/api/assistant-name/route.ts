import { NextResponse } from "next/server";
import * as fs from "node:fs";
import { setupStatePath } from "@/lib/paths";

export const dynamic = "force-dynamic";

export function GET() {
  const stateFile = setupStatePath();
  let shortName = "Am";
  try {
    if (fs.existsSync(stateFile)) {
      const data = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
      shortName = data.shortName || data.assistantName || "Am";
      const accentColor = data.accentColor;
      return NextResponse.json({ shortName, ...(accentColor ? { accentColor } : {}) });
    }
  } catch { /* default */ }
  return NextResponse.json({ shortName });
}
