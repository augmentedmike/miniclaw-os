import { NextRequest, NextResponse } from "next/server";
import { getCard, getDb } from "@/lib/data";
import { pickupCard } from "@/lib/actions";
import { enqueue } from "@/lib/agent-queue";
import { listCronJobs } from "@/lib/cron";

export const dynamic = "force-dynamic";

const COL_TO_JOB: Record<string, string> = {
  "backlog": "board-backlog-triage",
  "in-progress": "board-in-progress-triage",
  "in-review": "board-in-review-triage",
};

function getCapacityLimitForColumn(column: string): number {
  const jobId = COL_TO_JOB[column];
  if (!jobId) return 3;
  const jobs = listCronJobs();
  const job = jobs.find(j => j.id === jobId);
  return job?.maxConcurrent ?? 3;
}

function countCardsInColumn(column: string): number {
  const db = getDb();
  if (!db) return 0;
  try {
    const row = db.prepare(`SELECT COUNT(*) as cnt FROM cards WHERE col = ?`).get(column) as { cnt: number };
    return row.cnt;
  } catch { return 0; }
}

function countQueuedOrRunning(column: string): number {
  const db = getDb();
  if (!db) return 0;
  try {
    const row = db.prepare(
      `SELECT COUNT(*) as cnt FROM agent_queue WHERE col = ? AND status IN ('pending', 'running')`,
    ).get(column) as { cnt: number };
    return row.cnt;
  } catch { return 0; }
}

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

  // capacity limit check — reject if too many agents already queued/running for this column
  const capacityLimit = getCapacityLimitForColumn(column);
  const queuedOrRunning = countQueuedOrRunning(column);
  if (queuedOrRunning >= capacityLimit) {
    return NextResponse.json(
      { ok: false, reason: `capacity limit reached for "${column}": ${queuedOrRunning}/${capacityLimit} agents queued/running` },
      { status: 429 },
    );
  }

  // Write to agent_queue — the standalone runner daemon picks this up and spawns claude.
  // Web server never spawns agents directly; this returns 202 immediately.
  // NOTE: pickup happens in the runner when the agent actually starts, not here.
  // This prevents queued-but-not-yet-running cards from showing as active on the board.
  const queueId = enqueue(cardId, column, prompt, "board-worker-in-progress");

  return NextResponse.json({ ok: true, queued: true, queueId, cardId }, { status: 202 });
}
