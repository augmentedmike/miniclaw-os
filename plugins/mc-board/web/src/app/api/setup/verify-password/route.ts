export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { execSync } from "child_process";

export async function POST(req: Request) {
  try {
    const { password } = await req.json();
    if (!password || typeof password !== "string") {
      return NextResponse.json({ ok: false, error: "Password is required" }, { status: 400 });
    }

    // Validate macOS user password via sudo -S -v
    try {
      execSync("sudo -S -v", {
        input: password,
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ ok: false, error: "Incorrect password" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
}
