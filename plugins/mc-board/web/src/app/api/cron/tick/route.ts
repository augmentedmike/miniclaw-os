import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { listCronJobs, updateCronJob } from "@/lib/cron";
import { listCards, getActiveWork } from "@/lib/data";
import { releaseCard } from "@/lib/actions";
import { sortCards } from "@/lib/sort";

export const dynamic = "force-dynamic";

const STATE_DIR = process.env.MINICLAW_STATE_DIR ?? process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".miniclaw");
const BRAIN_DIR = path.join(STATE_DIR, "user", "augmentedmike_bot", "brain");

// Parse a job ID into { column, projectId } — supports both:
//   "board-{col}-triage"            (global)
//   "board-{col}-triage:{projectId}" (per-project)
function parseJobId(id: string): { column: string; projectId?: string } | null {
  const m = id.match(/^board-(backlog|in-progress|in-review)-triage(?::(.+))?$/);
  if (!m) return null;
  return { column: m[1], projectId: m[2] ?? undefined };
}

// Parse a cron expression like "*/5 * * * *" into an interval in ms.
// Supports: "* * * * *" (1m), "*/N * * * *" (Nm), "N * * * *" (60m).
function scheduleIntervalMs(expr: string): number {
  const parts = expr.trim().split(/\s+/);
  const min = parts[0] ?? "*";
  if (min === "*") return 60_000;
  const m = min.match(/^\*\/(\d+)$/);
  if (m) return parseInt(m[1]) * 60_000;
  return 60 * 60_000; // hourly if specific minute
}

function readPrompt(column: string): string {
  const p = path.join(BRAIN_DIR, "prompts", `${column}-process.txt`);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

const STALE_MS = 20 * 60 * 1000; // 20 minutes
const AGENT_RUNNING_MS = 5 * 60 * 1000; // if log modified within 5m, agent is still running

function findLatestLogForColumn(cardId: string, column: string): { file: string; mtime: number } | null {
  const dirName = `${column}-process`;
  const d = path.join(STATE_DIR, "logs", dirName);
  if (!fs.existsSync(d)) return null;
  let best: { file: string; mtime: number } | null = null;
  try {
    for (const f of fs.readdirSync(d)) {
      if (!f.includes(cardId) || !f.endsWith(".log") || f.endsWith(".debug.log")) continue;
      const full = path.join(d, f);
      const mtime = fs.statSync(full).mtimeMs;
      if (!best || mtime > best.mtime) best = { file: full, mtime };
    }
  } catch {}
  return best;
}

function findLatestLog(cardId: string): string | null {
  const dirs = ["in-progress-process", "in-review-process", "backlog-process"];
  let best: { file: string; mtime: number } | null = null;
  for (const dir of dirs) {
    const d = path.join(STATE_DIR, "logs", dir);
    if (!fs.existsSync(d)) continue;
    try {
      for (const f of fs.readdirSync(d)) {
        if (!f.includes(cardId) || !f.endsWith(".log") || f.endsWith(".debug.log")) continue;
        const full = path.join(d, f);
        const mtime = fs.statSync(full).mtimeMs;
        if (!best || mtime > best.mtime) best = { file: full, mtime };
      }
    } catch {}
  }
  return best?.file ?? null;
}

/** Check if the agent log for this card+column has a running PID that is still alive. */
function agentStillRunning(cardId: string, column: string): boolean {
  const entry = findLatestLogForColumn(cardId, column);
  if (!entry) return false;
  const now = Date.now();
  // If log was modified recently, consider agent still running
  if (now - entry.mtime < AGENT_RUNNING_MS) return true;
  // Parse PID from log and check if process is alive
  try {
    const content = fs.readFileSync(entry.file, "utf8");
    const m = content.match(/pid (\d+)/);
    if (m) {
      const pid = parseInt(m[1]);
      try { process.kill(pid, 0); return true; } catch { return false; }
    }
  } catch {}
  return false;
}

// How recently a card must have been triaged to be considered "already handled"
const REACTIVE_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

/** True if a backlog-process agent ran for this card within the cooldown window. */
function recentlyTriaged(cardId: string): boolean {
  const entry = findLatestLogForColumn(cardId, "backlog");
  if (!entry) return false;
  return Date.now() - entry.mtime < REACTIVE_COOLDOWN_MS;
}

export async function GET(req: Request) {
  const base = new URL(req.url).origin;
  const now = Date.now();
  const jobs = listCronJobs();
  const { active } = getActiveWork();

  // Auto-release stale pickups — agent died without calling release
  const released: string[] = [];
  for (const entry of active) {
    const pickedMs = new Date(entry.pickedUpAt ?? "").getTime();
    if (!pickedMs || now - pickedMs < STALE_MS) continue;
    // Check if log has had recent activity
    const logFile = findLatestLog(entry.cardId);
    const logMtime = logFile ? fs.statSync(logFile).mtimeMs : 0;
    if (logFile && now - logMtime < STALE_MS) continue; // still writing
    try { releaseCard(entry.cardId, entry.worker ?? "board-worker-web"); released.push(entry.cardId); } catch {}
  }

  const activeIds = new Set(active.map(a => a.cardId).filter(id => !released.includes(id)));

  // --- Reactive unblock: fire triage immediately for backlog cards whose deps just all shipped ---
  // Runs every tick regardless of schedule, so cards don't wait up to N minutes after a dep ships.
  const reactivelyFired: string[] = [];
  const backlogPrompt = readPrompt("backlog");
  if (backlogPrompt) {
    const allCards = listCards();
    const shippedIds = new Set(allCards.filter(c => c.column === "shipped").map(c => c.id));
    const newlyUnblocked = allCards.filter(c =>
      c.column === "backlog" &&
      c.depends_on.length > 0 &&
      c.depends_on.every(dep => shippedIds.has(dep)) &&
      !activeIds.has(c.id) &&
      !agentStillRunning(c.id, "backlog") &&
      !recentlyTriaged(c.id)
    );
    for (const card of newlyUnblocked) {
      try {
        await fetch(`${base}/api/process/backlog/${card.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: backlogPrompt }),
        });
        reactivelyFired.push(card.id);
        activeIds.add(card.id); // prevent scheduled loop from double-firing
      } catch {}
    }
  }

  const fired: string[] = [];
  const skipped: string[] = [];

  for (const job of jobs) {
    const parsed = parseJobId(job.id);
    if (!parsed) continue;
    const { column, projectId } = parsed;
    if (!job.enabled) { skipped.push(`${job.id}: disabled`); continue; }

    const intervalMs = scheduleIntervalMs(job.schedule);
    const elapsed = now - (job.lastRunAtMs ?? 0);
    if (elapsed < intervalMs) {
      skipped.push(`${job.id}: not due (${Math.round((intervalMs - elapsed) / 1000)}s remaining)`);
      continue;
    }

    const prompt = readPrompt(column);
    if (!prompt) { skipped.push(`${job.id}: no prompt`); continue; }

    const maxConcurrent = job.maxConcurrent ?? 3;
    const allCards = listCards();
    const shippedIds = new Set(allCards.filter(c => c.column === "shipped").map(c => c.id));
    const cards = sortCards(allCards.filter(c => {
        if (c.column !== column) return false;
        if (projectId && c.project_id !== projectId) return false;
        if (activeIds.has(c.id)) return false;
        if (agentStillRunning(c.id, column)) return false;
        // Block if any dependency is not yet shipped
        if (c.depends_on.some(dep => !shippedIds.has(dep))) return false;
        return true;
      }), activeIds)
      .slice(0, maxConcurrent);

    if (cards.length === 0) { skipped.push(`${job.id}: no eligible cards`); continue; }

    // Update lastRunAtMs before firing (prevents double-fire if tick overlaps)
    updateCronJob(job.id, { lastRunAtMs: now });

    for (const card of cards) {
      try {
        await fetch(`${base}/api/process/${column}/${card.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        fired.push(`${card.id} (${column})`);
      } catch (e) {
        skipped.push(`${card.id}: fetch failed — ${String(e)}`);
      }
    }
  }

  return NextResponse.json({ ok: true, fired, skipped, released, reactivelyFired, ts: new Date(now).toISOString() });
}
