import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { readSetupState } from "@/lib/setup-state";
import { STATE_DIR, findBin } from "./constants";

/**
 * Persist the user's chosen update time to the mc-update plugin config in openclaw.json.
 * Converts HH:MM to a cron expression (e.g. "03:00" → "0 3 * * *").
 */
export function persistUpdateTime() {
  const state = readSetupState();
  const updateTime = (state as Record<string, string>).updateTime;
  if (!updateTime) return;

  const [hh, mm] = updateTime.split(":").map(Number);
  const cronExpr = `${mm || 0} ${hh || 3} * * *`;

  const configPath = path.join(STATE_DIR, "openclaw.json");
  let cfg: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch { /* start fresh */ }

  const plugins = (cfg.plugins ?? {}) as Record<string, unknown>;
  const installs = (plugins.installs ?? {}) as Record<string, Record<string, unknown>>;
  const mcUpdate = installs["mc-update"] ?? {};
  const mcUpdateConfig = (mcUpdate.config ?? {}) as Record<string, unknown>;
  mcUpdateConfig.updateTime = cronExpr;
  mcUpdate.config = mcUpdateConfig;
  installs["mc-update"] = mcUpdate;
  plugins.installs = installs;
  cfg.plugins = plugins;

  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
}

/**
 * Register cron jobs with the gateway from jobs.json.
 * The gateway must be running for this to work.
 */
export function registerCronJobs() {
  const ocBin = findBin("openclaw");
  if (!ocBin) return;

  const cronFile = path.join(STATE_DIR, "cron", "jobs.json");
  if (!fs.existsSync(cronFile)) return;

  try {
    const store = JSON.parse(fs.readFileSync(cronFile, "utf-8"));
    const jobs = store.jobs || [];

    // Check what's already registered
    const listResult = spawnSync(ocBin, ["cron", "list", "--json"], {
      encoding: "utf-8",
      timeout: 10_000,
    });
    let existingNames = new Set<string>();
    try {
      const parsed = JSON.parse(listResult.stdout || "[]");
      // Handle both array and {jobs: []} formats
      const existing = Array.isArray(parsed) ? parsed : (parsed.jobs || []);
      existingNames = new Set(existing.map((j: { name?: string }) => j.name));
    } catch { /* no existing jobs */ }

    for (const job of jobs) {
      if (existingNames.has(job.name)) continue;

      const cronExpr = job.schedule?.expr || "*/5 * * * *";
      const args = [
        "cron", "add",
        "--name", job.name,
        "--cron", cronExpr,
        "--session", job.sessionTarget || "isolated",
      ];

      if (job.payload?.timeoutSeconds) {
        args.push("--timeout-seconds", String(job.payload.timeoutSeconds));
      }

      if (job.payload?.messageFile) {
        const promptPath = path.join(STATE_DIR, "cron", job.payload.messageFile);
        if (fs.existsSync(promptPath)) {
          const prompt = fs.readFileSync(promptPath, "utf-8").trim();
          args.push("--message", prompt);
        }
      }

      const result = spawnSync(ocBin, args, {
        encoding: "utf-8",
        timeout: 10_000,
      });
      if (result.status === 0) {
        console.log(`Registered cron: ${job.name}`);
      } else {
        console.error(`Failed to register cron ${job.name}:`, result.stderr);
      }
    }
  } catch (e) {
    console.error("Cron registration failed:", e);
  }
}

/**
 * Register an email watch cron job when email credentials are present.
 * Checks IMAP every 5 minutes and surfaces relevant messages to the agent.
 */
export function ensureEmailWatchCron() {
  const state = readSetupState();
  const addr = (state as Record<string, string>).emailAddress;
  if (!addr) return;

  const ocBin = findBin("openclaw");
  if (!ocBin) return;

  // Skip if already registered
  const listResult = spawnSync(ocBin, ["cron", "list", "--json"], {
    encoding: "utf-8",
    timeout: 10_000,
  });
  try {
    const parsed = JSON.parse(listResult.stdout || "{}");
    const jobs = Array.isArray(parsed) ? parsed : (parsed.jobs || []);
    if (jobs.some((j: { name?: string }) => j.name === "email-watch")) {
      console.log("email-watch cron already registered — skipping");
      return;
    }
  } catch { /* proceed */ }

  const message = [
    "REMINDER: Check inbox for new emails.",
    "Run: mc email list --unread --limit 20",
    "For each unread message: summarize subject + sender and surface it via mc-memo or alert the main session.",
    "Mark messages read after processing.",
    "If nothing new, do nothing.",
  ].join(" ");

  const result = spawnSync(ocBin, [
    "cron", "add",
    "--name", "email-watch",
    "--every", "5m",
    "--session", "isolated",
    "--message", message,
    "--timeout-seconds", "60",
  ], { encoding: "utf-8", timeout: 15_000 });

  if (result.status === 0) {
    console.log("email-watch cron registered");
  } else {
    console.error("email-watch cron registration failed:", result.stderr);
  }
}
