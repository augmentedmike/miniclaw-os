import { NextResponse } from "next/server";
import { getAgentRuns } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(getAgentRuns(id));
}
