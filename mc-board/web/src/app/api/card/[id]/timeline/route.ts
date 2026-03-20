import { NextRequest, NextResponse } from "next/server";
import { getCardTimeline } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const timeline = getCardTimeline(id);
  return NextResponse.json(timeline);
}
