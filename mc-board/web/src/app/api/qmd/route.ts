import { NextRequest, NextResponse } from "next/server";
import { listQmdRecent, searchKbEntries } from "@/lib/kb";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (q) {
    // Fall back to kb search for text search
    return NextResponse.json({ entries: searchKbEntries(q, 20) });
  }
  return NextResponse.json({ entries: listQmdRecent() });
}
