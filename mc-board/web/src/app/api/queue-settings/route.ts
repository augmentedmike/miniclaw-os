import { NextResponse } from "next/server";
import { getQueueSettings, updateQueueSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ settings: getQueueSettings() });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { col, maxConcurrent, intervalMs, enabled } = body as {
    col: string;
    maxConcurrent?: number;
    intervalMs?: number;
    enabled?: boolean;
  };
  if (!col) return NextResponse.json({ error: "col required" }, { status: 400 });

  const patch: { maxConcurrent?: number; intervalMs?: number; enabled?: boolean } = {};
  if (maxConcurrent !== undefined) patch.maxConcurrent = maxConcurrent;
  if (intervalMs !== undefined) patch.intervalMs = intervalMs;
  if (enabled !== undefined) patch.enabled = enabled;

  const updated = updateQueueSettings(col, patch);
  if (!updated) return NextResponse.json({ error: "update failed" }, { status: 500 });
  return NextResponse.json({ setting: updated });
}
