import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const manifestPath = path.join(os.homedir(), ".openclaw", "miniclaw", "MANIFEST.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    return NextResponse.json({ version: manifest.version ?? "unknown" });
  } catch {
    return NextResponse.json({ version: "unknown" });
  }
}
