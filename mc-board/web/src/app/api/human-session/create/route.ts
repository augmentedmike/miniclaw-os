import { NextRequest, NextResponse } from "next/server";
import { ensureSessionServer, createSession } from "@/lib/human-session-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { reason, timeoutMs } = await req.json().catch(() => ({}));
  if (!reason || typeof reason !== "string") {
    return new NextResponse("reason required", { status: 400 });
  }

  ensureSessionServer();

  const { token, url } = createSession(reason, typeof timeoutMs === "number" ? timeoutMs : 30 * 60 * 1000);
  return NextResponse.json({ ok: true, url, token });
}
