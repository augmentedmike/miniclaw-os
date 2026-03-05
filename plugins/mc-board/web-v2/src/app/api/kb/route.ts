import { NextRequest, NextResponse } from "next/server";
import { listKbEntries, searchKbEntries } from "@/lib/kb";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  const entries = q ? searchKbEntries(q) : listKbEntries();
  return NextResponse.json({ entries });
}
