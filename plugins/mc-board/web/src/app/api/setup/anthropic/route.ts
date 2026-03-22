export const dynamic = "force-dynamic";

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { consumeToken } from "@/lib/sensitive-auth";
import { isSetupComplete } from "@/lib/setup-state";
import { apiOk, apiError } from "@/lib/api-response";
import { stateDir } from "@/lib/paths";

const HOME = process.env.HOME || "";
const CLAUDE_BIN = `${HOME}/.local/bin/claude`;

function isAnthropicAuthed(): boolean {
  // Claude Code stores OAuth token in macOS keychain under "Claude Code-credentials"
  try {
    const raw = execSync(
      'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
      { encoding: "utf8", timeout: 3000 },
    ).trim();
    const creds = JSON.parse(raw);
    if (creds?.claudeAiOauth?.accessToken) return true;
  } catch { /* keychain lookup failed */ }

  // Fallback: check openclaw auth-profiles
  const candidates = [
    path.join(stateDir(), "agents", "main", "agent", "auth-profiles.json"),
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

// GET: poll for auth status
export async function GET() {
  return apiOk({ authed: isAnthropicAuthed() });
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
    return apiOk({ message: "Sign in via the browser window that opens" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return apiError(msg, 500);
  }
}

// PUT: paste a session token directly
export async function PUT(req: Request) {
  const { token, sensitiveToken } = await req.json();

  if (isSetupComplete() && !consumeToken(sensitiveToken)) {
    return apiError("Password confirmation required", 403);
  }

  if (!token || typeof token !== "string") {
    return apiError("Token is required");
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
    return apiError(`Failed to store token: ${msg}`, 500);
  }

  return apiOk();
}
