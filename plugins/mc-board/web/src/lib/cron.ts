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
      const j = job as Record<string, unknown>;
      jobs.push({
        id,
        name: String(j.name ?? id),
        schedule: String(j.schedule ?? ""),
        enabled: j.enabled !== false,
        payload: (j.payload as CronJob["payload"]) ?? {},
      });
    }
    return jobs;
  } catch { return []; }
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
