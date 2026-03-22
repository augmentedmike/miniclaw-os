import { NextResponse } from "next/server";
import { readColumnsConfig, updateColumnConfig } from "@/lib/columns";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(readColumnsConfig());
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { column, maxConcurrency } = body as { column?: string; maxConcurrency?: number };
  if (!column) return NextResponse.json({ error: "column required" }, { status: 400 });
  if (maxConcurrency === undefined) return NextResponse.json({ error: "maxConcurrency required" }, { status: 400 });

  const updated = updateColumnConfig(column, { maxConcurrency });
  return NextResponse.json(updated);
}
