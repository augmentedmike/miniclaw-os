export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readSetupState, writeSetupState } from "@/lib/setup-state";

export async function GET() {
  const state = readSetupState();
  return NextResponse.json(state);
}

export async function POST(req: Request) {
  const body = await req.json();
  const next = writeSetupState(body);
  return NextResponse.json(next);
}
