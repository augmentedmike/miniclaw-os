import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const dynamic = "force-dynamic";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

function getBrainDir(): string {
  return path.join(STATE_DIR, "USER", "brain");
}

/** Allowed directory for prompt files — all paths validated against this. */
function getPromptsDir(): string {
  return path.resolve(getBrainDir(), "prompts");
}

/**
 * Validate that a path is within the allowed prompts directory.
 * Blocks path traversal via env var override or crafted paths.
 */
function validatePromptPath(p: string): boolean {
  const resolved = path.resolve(p);
  return resolved.startsWith(getPromptsDir() + path.sep) || resolved === getPromptsDir();
}

function getPromptPaths(): string[] {
  return [
    process.env.BOARD_BACKLOG_PROMPT,
    path.join(getBrainDir(), "prompts", "backlog-triage.txt"),
  ].filter((p): p is string => Boolean(p) && validatePromptPath(p!));
}

function readPrompt(): string {
  for (const p of getPromptPaths()) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf-8");
  }
  return "";
}

function writePrompt(text: string): void {
  for (const p of getPromptPaths()) {
    if (!validatePromptPath(p)) continue;
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
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
