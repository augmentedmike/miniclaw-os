import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const dynamic = "force-dynamic";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

function getBrainDir(): string {
  return path.join(STATE_DIR, "USER", "brain");
}

function promptPath(column: string): string {
  const envKey = `BOARD_${column.toUpperCase().replace(/-/g, "_")}_PROCESS_PROMPT`;
  return process.env[envKey] ?? path.join(getBrainDir(), "prompts", `${column}-process.txt`);
}

const DEFAULT_PROCESS_PROMPT = `You are a triage processor for the Brain board. This prompt runs both on-demand (web UI) and via the periodic cron job that checks the backlog column.

You are given a single card in full detail. Your job:

1. Review the existing problem description, plan, and acceptance criteria
2. Fill in the research section with relevant technical context, known issues, related code patterns, or documentation links that would help an agent implement this card
3. Identify gaps or ambiguities in the implementation plan and note them in the notes field
4. Assess readiness: does this card have everything needed to be worked on? (clear problem, acceptance criteria, implementation plan, project context)
5. Do NOT check off acceptance criteria — that is the agent's job after doing the work
6. Append a concise work log note summarizing what you found in this triage pass

Card:
{{CARD}}
`;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ column: string }> }) {
  const { column } = await params;
  const p = promptPath(column);
  try {
    const prompt = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : DEFAULT_PROCESS_PROMPT;
    return NextResponse.json({ prompt, path: p });
  } catch { /* prompt-file-unreadable */
    return NextResponse.json({ prompt: DEFAULT_PROCESS_PROMPT, path: p });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ column: string }> }) {
  const { column } = await params;
  const { prompt } = await req.json();
  if (typeof prompt !== "string") return new NextResponse("prompt required", { status: 400 });
  const p = promptPath(column);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, prompt, "utf8");
  return NextResponse.json({ ok: true });
}
