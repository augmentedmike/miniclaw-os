export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { issueToken, checkRateLimit } from "@/lib/sensitive-auth";

export async function POST(req: Request) {
  try {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts. Try again in a minute." },
        { status: 429 },
      );
    }

    const { password } = await req.json();
    if (!password || typeof password !== "string") {
      return NextResponse.json({ ok: false, error: "Password is required" }, { status: 400 });
    }

    try {
      execSync("sudo -S -v", {
        input: password,
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      });
      const sensitiveToken = issueToken();
      return NextResponse.json({ ok: true, sensitiveToken });
    } catch { // sudo validation failed — wrong password
      return NextResponse.json({ ok: false, error: "Incorrect password" }, { status: 401 });
    }
  } catch { // request body parse failure or missing fields
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
}
