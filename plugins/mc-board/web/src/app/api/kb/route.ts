import { NextRequest, NextResponse } from "next/server";
import { listKbEntries, searchKbEntries, pruneKbEntries, KB_TEMPLATE } from "@/lib/kb";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");
  if (req.nextUrl.searchParams.get("template") === "1") {
    return NextResponse.json({ template: KB_TEMPLATE });
  }
  const entries = q ? searchKbEntries(q) : listKbEntries();
  return NextResponse.json({ entries });
}

export function DELETE(req: NextRequest) {
  const confirm = req.nextUrl.searchParams.get("confirm") === "1";
  const dead = pruneKbEntries(!confirm);
  return NextResponse.json({ pruned: dead.length, entries: dead, dry: !confirm });
}
