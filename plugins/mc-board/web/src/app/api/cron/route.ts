import { NextResponse } from "next/server";
import { listCronJobs, listCronRuns, updateCronJob, upsertCronJob } from "@/lib/cron";
import { updateQueueSettings, getQueueSettings } from "@/lib/data";

export const dynamic = "force-dynamic";

/** Extract the column name from a cron job id like "board-backlog-triage" */
function jobIdToColumn(id: string): string | null {
  const m = id.match(/^board-(backlog|in-progress|in-review)-triage/);
  return m ? m[1] : null;
}

export function GET() {
  // Merge queue_settings into the job response so the UI gets DB-authoritative values
  const jobs = listCronJobs();
  const queueSettings = getQueueSettings();
  const settingsByCol = Object.fromEntries(queueSettings.map(s => [s.col, s]));

  const enrichedJobs = jobs.map(job => {
    const col = jobIdToColumn(job.id);
    const qs = col ? settingsByCol[col] : null;
    return {
      ...job,
      maxConcurrent: qs?.maxConcurrent ?? job.maxConcurrent ?? 3,
      // include DB-sourced enabled and intervalMs for the UI
      queueEnabled: qs?.enabled,
      queueIntervalMs: qs?.intervalMs,
    };
  });

  return NextResponse.json({ jobs: enrichedJobs, runs: listCronRuns() });
}

export async function PATCH(req: Request) {
  const body = await req.json();
  const { id, schedule, enabled, maxConcurrent } = body as { id: string; schedule?: string; enabled?: boolean; maxConcurrent?: number };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Write schedule and enabled to board-cron.json (for lastRunAtMs tracking and schedule storage)
  const cronPatch: { schedule?: string; enabled?: boolean } = {};
  if (schedule !== undefined) cronPatch.schedule = schedule;
  if (enabled !== undefined) cronPatch.enabled = enabled;

  const updated = updateCronJob(id, cronPatch);
  if (!updated) return NextResponse.json({ error: "job not found" }, { status: 404 });

  // Write maxConcurrent, enabled, and interval to queue_settings DB table (authoritative source)
  const col = jobIdToColumn(id);
  if (col) {
    const qsPatch: { maxConcurrent?: number; intervalMs?: number; enabled?: boolean } = {};
    if (maxConcurrent !== undefined) qsPatch.maxConcurrent = maxConcurrent;
    if (enabled !== undefined) qsPatch.enabled = enabled;
    if (schedule !== undefined) {
      // Convert cron schedule to intervalMs
      const m = schedule.match(/^\*\/(\d+) \* \* \* \*$/);
      if (m) qsPatch.intervalMs = parseInt(m[1]) * 60_000;
      else if (schedule === "* * * * *") qsPatch.intervalMs = 60_000;
    }
    if (Object.keys(qsPatch).length > 0) {
      updateQueueSettings(col, qsPatch);
    }
  }

  return NextResponse.json({ job: updated });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { id, name, schedule, enabled, payload } = body;
  if (!id || !name || !schedule) return NextResponse.json({ error: "id, name, schedule required" }, { status: 400 });
  upsertCronJob({ id, name, schedule, enabled: enabled !== false, payload });
  return NextResponse.json({ ok: true });
}
