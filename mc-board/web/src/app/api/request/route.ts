import { NextRequest, NextResponse } from "next/server";
import { createCard } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const description = (body.description ?? "").trim();
  if (!description) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }
  const id = createCard(description);
  if (!id) {
    return NextResponse.json({ error: "failed to create card" }, { status: 500 });
  }
  return NextResponse.json({ id });
}
