export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { consumeToken } from "@/lib/sensitive-auth";

const HOME = process.env.HOME || "";
const CLAUDE_BIN = `${HOME}/.local/bin/claude`;

function isAnthropicAuthed(): boolean {
  try {
    const raw = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
      { encoding: "utf8", timeout: 3000 },
    ).trim();
    const creds = JSON.parse(raw);
    if (creds?.claudeAiOauth?.accessToken) return true;
  } catch { /* keychain lookup failed */ }

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
    } catch { /* auth profile unreadable */ }
  }

  return false;
}

// GET: poll for auth status (no auth required — read-only)
export async function GET() {
  return NextResponse.json({ authed: isAnthropicAuthed() });
}

// POST: open Terminal.app running claude setup-token (requires auth — post-setup)
export async function POST(req: Request) {
  const { sensitiveToken } = await req.json().catch(() => ({}));

  if (!consumeToken(sensitiveToken)) {
    return NextResponse.json(
      { ok: false, error: "Password confirmation required" },
      { status: 403 },
    );
  }

  try {
    const { CLAUDECODE: _, ...cleanEnv } = process.env;
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

// PUT: paste a session token directly (requires auth — post-setup)
export async function PUT(req: Request) {
  const { token, sensitiveToken } = await req.json();

  if (!consumeToken(sensitiveToken)) {
    return NextResponse.json(
      { ok: false, error: "Password confirmation required" },
      { status: 403 },
    );
  }

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
