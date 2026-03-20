export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readSetupState } from "@/lib/setup-state";

export async function GET() {
  const state = readSetupState();
  return NextResponse.json({
    ok: true,
    setupComplete: state.complete,
    emailConfigured: state.emailConfigured,
    geminiConfigured: state.geminiConfigured,
    timestamp: new Date().toISOString(),
  });
}
