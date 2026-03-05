import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const dynamic = "force-dynamic";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".miniclaw");
const OPENCLAW_DIR = process.env.OPENCLAW_DIR ?? path.join(os.homedir(), ".openclaw");

const PROMPT_PATHS = [
  process.env.BOARD_BACKLOG_PROMPT,
  path.join(STATE_DIR, "cron", "prompts", "board-worker-backlog.txt"),
].filter(Boolean) as string[];

function readPrompt(): string {
  for (const p of PROMPT_PATHS) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8");
  }
  return "";
}

function writePrompt(text: string): void {
  for (const p of PROMPT_PATHS) {
    try {
      fs.mkdirSync(require("path").dirname(p), { recursive: true });
      fs.writeFileSync(p, text, "utf-8");
    } catch { /* skip unwritable */ }
  }
  // Also sync to source repo if it exists
  const srcPath = path.join(OPENCLAW_DIR, "miniclaw", "plugins", "mc-board", "prompts", "backlog-processor.txt");
  if (fs.existsSync(require("path").dirname(srcPath))) {
    try { fs.writeFileSync(srcPath, text, "utf-8"); } catch { /* skip */ }
  }
}

export function GET() {
  return NextResponse.json({ prompt: readPrompt() });
}

export async function POST(req: Request) {
  const { prompt } = await req.json();
  if (typeof prompt !== "string") return NextResponse.json({ error: "prompt required" }, { status: 400 });
  writePrompt(prompt);
  return NextResponse.json({ ok: true });
}
