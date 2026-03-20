export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { vaultSet } from "@/lib/vault";
import { writeSetupState } from "@/lib/setup-state";

export async function POST(req: Request) {
  const { apiKey } = await req.json();

  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "API key is required" }, { status: 400 });
  }

  const result = vaultSet("gemini-api-key", apiKey);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: `Vault error: ${result.error}` }, { status: 500 });
  }

  writeSetupState({ geminiConfigured: true });

  return NextResponse.json({ ok: true });
}
