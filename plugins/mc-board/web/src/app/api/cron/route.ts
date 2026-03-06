import { NextResponse } from "next/server";
import { listCronJobs, listCronRuns, updateCronJob, upsertCronJob } from "@/lib/cron";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ jobs: listCronJobs(), runs: listCronRuns() });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { id, schedule, enabled } = body as { id: string; schedule?: string; enabled?: boolean };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const patch: { schedule?: string; enabled?: boolean } = {};
  if (schedule !== undefined) patch.schedule = schedule;
  if (enabled !== undefined) patch.enabled = enabled;

  const updated = updateCronJob(id, patch);
  if (!updated) return NextResponse.json({ error: "job not found" }, { status: 404 });
  return NextResponse.json({ job: updated });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { id, name, schedule, enabled, payload } = body;
  if (!id || !name || !schedule) return NextResponse.json({ error: "id, name, schedule required" }, { status: 400 });
  upsertCronJob({ id, name, schedule, enabled: enabled !== false, payload });
  return NextResponse.json({ ok: true });
}
