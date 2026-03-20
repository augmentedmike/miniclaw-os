export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readSetupState, writeSetupState } from "@/lib/setup-state";
import { consumeToken } from "@/lib/sensitive-auth";

// GET: read current state (no auth — settings page needs to load values)
export async function GET() {
  const state = readSetupState();
  return NextResponse.json(state);
}

// POST: write state (requires auth — post-setup)
export async function POST(req: Request) {
  const body = await req.json();
  const { sensitiveToken, ...data } = body;

  if (!consumeToken(sensitiveToken)) {
    return NextResponse.json(
      { ok: false, error: "Password confirmation required" },
      { status: 403 },
    );
  }

  const next = writeSetupState(data);
  return NextResponse.json(next);
}

// PATCH: update state (requires auth — post-setup)
export async function PATCH(req: Request) {
  const body = await req.json();
  const { sensitiveToken, ...data } = body;

  if (!consumeToken(sensitiveToken)) {
    return NextResponse.json(
      { ok: false, error: "Password confirmation required" },
      { status: 403 },
    );
  }

  const next = writeSetupState(data);
  return NextResponse.json(next);
}
