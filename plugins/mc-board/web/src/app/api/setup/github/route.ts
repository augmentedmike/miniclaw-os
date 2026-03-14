export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { writeSetupState } from "@/lib/setup-state";

export async function POST(req: Request) {
  const { token } = (await req.json()) as { token: string };

  if (!token?.trim()) {
    return NextResponse.json({ ok: false, error: "Token is required" }, { status: 400 });
  }

  try {
    // Validate the token against the GitHub API
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "MiniClaw-Setup/1.0",
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json({
        ok: false,
        error: res.status === 401
          ? "Invalid token — check that you copied the full token"
          : `GitHub API error: ${(body as Record<string, string>).message || res.statusText}`,
      });
    }

    const user = (await res.json()) as { login: string; name?: string };

    // Save token to setup state — vault doesn't exist yet during first-run.
    // The "Finishing up" step moves it to vault after install.sh runs.
    writeSetupState({
      ghToken: token.trim(),
      ghUsername: user.login,
      ghConfigured: true,
    } as Record<string, string | boolean>);

    return NextResponse.json({
      ok: true,
      username: user.login,
      name: user.name,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: `Connection failed: ${e instanceof Error ? e.message : "unknown"}`,
    });
  }
}
