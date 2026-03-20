export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { writeSetupState } from "@/lib/setup-state";
import { consumeToken } from "@/lib/sensitive-auth";

export async function POST(req: Request) {
  const { apiKey, sensitiveToken } = await req.json();

  if (!consumeToken(sensitiveToken)) {
    return NextResponse.json(
      { ok: false, error: "Password confirmation required" },
      { status: 403 },
    );
  }

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "API key is required" }, { status: 400 });
  }

  writeSetupState({
    geminiApiKey: apiKey,
    geminiConfigured: true,
  } as Record<string, string | boolean>);

  return NextResponse.json({ ok: true });
}
