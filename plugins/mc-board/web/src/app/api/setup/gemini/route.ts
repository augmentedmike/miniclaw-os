export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { writeSetupState } from "@/lib/setup-state";

export async function POST(req: Request) {
  const { apiKey } = await req.json();

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "API key is required" }, { status: 400 });
  }

  // Save to setup state — vault persists at "Finishing up" step after install.sh
  writeSetupState({
    geminiApiKey: apiKey,
    geminiConfigured: true,
  } as Record<string, string | boolean>);

  return NextResponse.json({ ok: true });
}
