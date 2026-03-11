import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const dynamic = "force-dynamic";

const STATE_DIR = process.env.MINICLAW_STATE_DIR ?? process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), "am");
const BRAIN_DIR = path.join(STATE_DIR, "user", "augmentedmike_bot", "brain");

const PROMPT_PATHS = [
  process.env.BOARD_BACKLOG_PROMPT,
  path.join(BRAIN_DIR, "prompts", "backlog-triage.txt"),
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
  // Also sync to repo if it exists
  const repoPath = path.join(STATE_DIR, "projects", "miniclaw-os", "plugins", "mc-board", "prompts", "backlog-processor.txt");
  if (fs.existsSync(path.dirname(repoPath))) {
    try { fs.writeFileSync(repoPath, text, "utf-8"); } catch { /* skip */ }
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
