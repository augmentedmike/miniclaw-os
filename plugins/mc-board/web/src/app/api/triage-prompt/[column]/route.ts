import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const dynamic = "force-dynamic";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), "am");
const BRAIN_DIR = path.join(STATE_DIR, "USER", "augmentedmike_bot", "brain");

function promptPath(column: string): string {
  const envKey = `BOARD_${column.toUpperCase().replace(/-/g, "_")}_PROMPT`;
  return process.env[envKey] ?? path.join(BRAIN_DIR, "prompts", `${column}-triage.txt`);
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
  return NextResponse.json({ prompt: readPrompt(column) });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ column: string }> }) {
  const { column } = await params;
  const { prompt } = await req.json();
  if (typeof prompt !== "string") return NextResponse.json({ error: "prompt required" }, { status: 400 });
  writePrompt(column, prompt);
  return NextResponse.json({ ok: true });
}
