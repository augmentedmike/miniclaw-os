import { NextRequest, NextResponse } from "next/server";
import { moveCard, updateCard } from "@/lib/actions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, cardId } = body;
    if (!cardId) return NextResponse.json({ error: "missing cardId" }, { status: 400 });

    if (action === "move") {
      const result = moveCard(cardId, body.target, body.force ?? false);
      return NextResponse.json({ ok: true, result });
    }
    if (action === "update") {
      const { cardId: _, action: __, ...updates } = body;
      const result = updateCard(cardId, updates);
      return NextResponse.json({ ok: true, result });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
