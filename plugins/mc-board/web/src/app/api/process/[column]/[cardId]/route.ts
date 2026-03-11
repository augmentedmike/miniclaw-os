import { NextRequest, NextResponse } from "next/server";
import { getCard } from "@/lib/data";
import { pickupCard } from "@/lib/actions";
import { enqueue } from "@/lib/agent-queue";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ column: string; cardId: string }> },
) {
  const { column, cardId } = await params;
  const { prompt } = await req.json();
  if (typeof prompt !== "string" || !prompt.trim()) {
    return new Response("prompt required", { status: 400 });
  }

  const card = getCard(cardId);
  if (!card) return new Response(`Card not found: ${cardId}`, { status: 404 });
  if (card.column !== column) {
    return new Response(`Card ${cardId} is in "${card.column}", not "${column}"`, { status: 409 });
  }

  // Write to agent_queue — the standalone runner daemon picks this up and spawns claude.
  // Web server never spawns agents directly; this returns 202 immediately.
  // NOTE: pickup happens in the runner when the agent actually starts, not here.
  // This prevents queued-but-not-yet-running cards from showing as active on the board.
  const queueId = enqueue(cardId, column, prompt, "board-worker-in-progress");

  return NextResponse.json({ ok: true, queued: true, queueId, cardId }, { status: 202 });
}
