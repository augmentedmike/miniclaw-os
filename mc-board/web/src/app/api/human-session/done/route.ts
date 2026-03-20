import { NextRequest, NextResponse } from "next/server";
import { closeSession } from "@/lib/human-session-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { token } = await req.json().catch(() => ({}));
  if (!token || typeof token !== "string") {
    return new NextResponse("token required", { status: 400 });
  }
  const closed = closeSession(token);
  return NextResponse.json({ ok: closed });
}
