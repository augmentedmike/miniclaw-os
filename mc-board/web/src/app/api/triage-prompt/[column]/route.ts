import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { brainDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

/** Whitelist of valid column names to prevent path traversal via column parameter. */
const VALID_COLUMNS = new Set([
  "backlog", "in-progress", "in-review", "shipped", "held", "blocked",
]);

function validateColumn(column: string): string | null {
  if (!VALID_COLUMNS.has(column)) return null;
  return column;
}

function promptPath(column: string): string {
  const promptsDir = path.join(brainDir(), "prompts");
  const resolved = path.resolve(promptsDir, `${column}-triage.txt`);
  // Ensure resolved path stays within the prompts directory
  if (!resolved.startsWith(path.resolve(promptsDir) + path.sep)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

function readPrompt(column: string): string {
  const p = promptPath(column);
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8");
  return "";
}

function writePrompt(column: string, text: string): void {
  const p = promptPath(column);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, "utf-8");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ column: string }> }) {
  const { column } = await params;
  if (!validateColumn(column)) {
    return NextResponse.json({ error: "Invalid column" }, { status: 400 });
  }
  return NextResponse.json({ prompt: readPrompt(column) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ column: string }> }) {
  const { column } = await params;
  if (!validateColumn(column)) {
    return NextResponse.json({ error: "Invalid column" }, { status: 400 });
  }
  const { prompt } = await req.json();
  if (typeof prompt !== "string") return NextResponse.json({ error: "prompt required" }, { status: 400 });
  writePrompt(column, prompt);
  return NextResponse.json({ ok: true });
}
