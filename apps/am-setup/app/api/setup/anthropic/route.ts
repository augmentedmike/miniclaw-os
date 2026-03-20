export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const CLAUDE_BIN = "/Users/michaeloneal/.local/bin/claude";
const HOME = process.env.HOME || "";

function isAnthropicAuthed(): boolean {
  // Claude Code stores OAuth token in macOS keychain under "Claude Code-credentials"
  try {
    const raw = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
      { encoding: "utf8", timeout: 3000 },
    ).trim();
    const creds = JSON.parse(raw);
    if (creds?.claudeAiOauth?.accessToken) return true;
  } catch {}

  // Fallback: check openclaw auth-profiles
  const candidates = [
    `${HOME}/.openclaw/agents/main/agent/auth-profiles.json`,
  ];
  for (const f of candidates) {
    try {
      if (!existsSync(f)) continue;
      const data = JSON.parse(readFileSync(f, "utf8"));
      const profiles = data?.profiles || {};
      if (Object.keys(profiles).some((k) => k.startsWith("anthropic") && profiles[k]?.token)) {
        return true;
      }
    } catch {}
  }

  return false;
}

// GET: poll for auth status
export async function GET() {
  return NextResponse.json({ authed: isAnthropicAuthed() });
}

// POST: open Terminal.app running claude setup-token
export async function POST() {
  try {
    const { CLAUDECODE: _, ...cleanEnv } = process.env;
    // Open a real Terminal window — customer sees it pop up, claude does the OAuth,
    // browser opens, they sign in, terminal closes automatically
    execSync(`osascript -e '
      tell application "Terminal"
        activate
        do script "${CLAUDE_BIN} setup-token; exit"
      end tell
    '`, {
      timeout: 5000,
      env: { ...cleanEnv, HOME },
    });
    return NextResponse.json({ ok: true, message: "Sign in via the browser window that opens" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

// PUT: paste a session token directly
export async function PUT(req: Request) {
  const { token } = await req.json();

  if (!token || typeof token !== "string") {
    return NextResponse.json({ ok: false, error: "Token is required" }, { status: 400 });
  }

  try {
    execSync(
      `openclaw models auth paste-token --provider anthropic --profile-id anthropic:default`,
      {
        input: token.trim(),
        encoding: "utf8",
        timeout: 10_000,
        env: { ...process.env, HOME },
      },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: `Failed to store token: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
