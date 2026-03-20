import { NextRequest, NextResponse } from "next/server";
import { getSessionStatus } from "@/lib/human-session-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "token required" }, { status: 400 });
  }
  const { closed } = getSessionStatus(token);
  return NextResponse.json({ ok: true, closed });
}
