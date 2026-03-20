"use client";
import useSWR from "swr";

interface CronJob { id: string; name: string; schedule: string; enabled: boolean; }
interface CronRun { id: string; startedAt: string; status: string; }
interface CronData { jobs: CronJob[]; runs: CronRun[]; }

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function CronTab() {
  const { data } = useSWR<CronData>("/api/cron", fetcher, { refreshInterval: 30000, revalidateOnFocus: false });
  const jobs = data?.jobs ?? [];
  const runs = data?.runs ?? [];

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-zinc-100">
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 shrink-0">
        <span className="text-sm font-semibold text-zinc-200">Scheduling</span>
        <span className="text-xs text-zinc-500">{jobs.length} jobs</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Jobs</div>
          <div className="space-y-2 mb-6">
            {jobs.length === 0 && <div className="text-xs text-zinc-600">No jobs</div>}
            {jobs.map(job => (
              <div key={job.id} className="bg-zinc-900 border border-zinc-800 rounded px-3 py-2 flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: job.enabled ? "var(--accent)" : undefined }} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-300 font-medium truncate">{job.name}</div>
                  <div className="text-[10px] text-zinc-600 font-mono mt-0.5">{job.schedule}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Recent Runs</div>
          <div className="space-y-1">
            {runs.length === 0 && <div className="text-xs text-zinc-600">No runs</div>}
            {runs.map(run => (
              <div key={run.id} className="flex items-center gap-3 px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded">
                <span className="text-[10px] font-medium" style={{ color: run.status === "ok" ? "var(--accent)" : run.status === "error" ? "#f87171" : "#52525b" }}>
                  {run.status.toUpperCase()}
                </span>
                <span className="text-xs text-zinc-500 font-mono truncate">{run.id.slice(0, 8)}</span>
                <span className="text-[10px] text-zinc-600 ml-auto">{new Date(run.startedAt).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
