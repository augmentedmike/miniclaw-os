import * as fs from "node:fs";
import * as path from "node:path";

const _STATE = process.env.OPENCLAW_STATE_DIR ?? path.join(require("node:os").homedir(), ".miniclaw");
const JOBS_FILE = process.env.BOARD_CRON_JOBS ?? path.join(_STATE, "cron", "jobs.json");
const RUNS_DIR = process.env.BOARD_CRON_RUNS ?? path.join(_STATE, "cron", "runs");

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  lastRunAtMs?: number;
  maxConcurrent?: number;
  payload?: { message?: string; messageFile?: string };
}

export interface CronRun {
  id: string;
  jobId?: string;
  startedAt: string;
  durationMs?: number;
  status: "ok" | "error" | "silent";
}

export function listCronJobs(): CronJob[] {
  if (!fs.existsSync(JOBS_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(JOBS_FILE, "utf-8"));
    const jobs: CronJob[] = [];
    for (const [id, job] of Object.entries(raw as Record<string, unknown>)) {
      if (id === "version" || id === "jobs") continue;
      if (!job || typeof job !== "object" || Array.isArray(job)) continue;
      const j = job as Record<string, unknown>;
      jobs.push({
        id,
        name: String(j.name ?? id),
        schedule: String(j.schedule ?? ""),
        enabled: j.enabled !== false,
        maxConcurrent: typeof j.maxConcurrent === "number" ? j.maxConcurrent as number : undefined,
        lastRunAtMs: typeof j.lastRunAtMs === "number" ? j.lastRunAtMs as number : undefined,
        payload: (j.payload as CronJob["payload"]) ?? {},
      });
    }
    return jobs;
  } catch { return []; }
}

export function updateCronJob(id: string, patch: Partial<Pick<CronJob, "schedule" | "enabled" | "maxConcurrent" | "lastRunAtMs">>): CronJob | null {
  const raw: Record<string, unknown> = fs.existsSync(JOBS_FILE)
    ? JSON.parse(fs.readFileSync(JOBS_FILE, "utf-8"))
    : {};
  if (!raw[id]) return null;
  const job = raw[id] as Record<string, unknown>;
  if (patch.schedule !== undefined) job.schedule = patch.schedule;
  if (patch.enabled !== undefined) job.enabled = patch.enabled;
  if (patch.maxConcurrent !== undefined) job.maxConcurrent = patch.maxConcurrent;
  if (patch.lastRunAtMs !== undefined) job.lastRunAtMs = patch.lastRunAtMs;
  fs.mkdirSync(require("node:path").dirname(JOBS_FILE), { recursive: true });
  fs.writeFileSync(JOBS_FILE, JSON.stringify(raw, null, 2), "utf-8");
  return {
    id,
    name: String(job.name ?? id),
    schedule: String(job.schedule ?? ""),
    enabled: job.enabled !== false,
    maxConcurrent: typeof job.maxConcurrent === "number" ? job.maxConcurrent : undefined,
    lastRunAtMs: typeof job.lastRunAtMs === "number" ? job.lastRunAtMs : undefined,
    payload: (job.payload as CronJob["payload"]) ?? {},
  };
}

export function upsertCronJob(job: CronJob): void {
  const raw: Record<string, unknown> = fs.existsSync(JOBS_FILE)
    ? JSON.parse(fs.readFileSync(JOBS_FILE, "utf-8"))
    : {};
  raw[job.id] = {
    name: job.name,
    schedule: job.schedule,
    enabled: job.enabled,
    ...(job.payload ? { payload: job.payload } : {}),
  };
  fs.mkdirSync(require("node:path").dirname(JOBS_FILE), { recursive: true });
  fs.writeFileSync(JOBS_FILE, JSON.stringify(raw, null, 2), "utf-8");
}

export function listCronRuns(limit = 20): CronRun[] {
  if (!fs.existsSync(RUNS_DIR)) return [];
  try {
    const files = fs.readdirSync(RUNS_DIR)
      .filter(f => f.endsWith(".jsonl"))
      .map(f => {
        const stat = fs.statSync(path.join(RUNS_DIR, f));
        return { f, mtime: stat.mtime.getTime(), size: stat.size };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit);

    return files.map(({ f, mtime, size }) => ({
      id: f.replace(".jsonl", ""),
      startedAt: new Date(mtime).toISOString(),
      status: size < 300 ? "silent" : "ok",
    }));
  } catch { return []; }
}
