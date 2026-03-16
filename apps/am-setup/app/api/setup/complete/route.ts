export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readSetupState, writeSetupState } from "@/lib/setup-state";
import { vaultSet } from "@/lib/vault";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync, spawnSync } from "node:child_process";
import { healSmokeFailures } from "@/lib/smoke-heal";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(process.env.HOME || "", ".openclaw");

function normalizeBotId(username: string): string {
  return username.replace(/^@/, "").trim();
}

/**
 * Register the telegram channel with openclaw and store the bot token in vault.
 * The botId is written under `meta.botId` (NOT top-level) so openclaw config
 * validation doesn't reject it.
 */
function configureGateway(botId: string, botToken: string) {
  const configPath = path.join(STATE_DIR, "openclaw.json");
  let cfg: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch { /* start fresh */ }

  // Store botId under meta (not top-level — top-level causes validation failure)
  const meta = (cfg.meta ?? {}) as Record<string, unknown>;
  meta.botId = botId;
  cfg.meta = meta;

  // Remove any legacy top-level botId
  delete cfg.botId;

  // Set gateway mode to local so `openclaw gateway` starts without --allow-unconfigured
  const gw = (cfg.gateway ?? {}) as Record<string, unknown>;
  if (!gw.mode) gw.mode = "local";
  cfg.gateway = gw;

  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n", "utf-8");

  // Store the telegram bot token in vault
  const vaultResult = vaultSet("telegram-bot-token", botToken);
  if (!vaultResult.ok) {
    console.error("Failed to store telegram bot token in vault:", vaultResult.error);
  }

  // Register the telegram channel with openclaw
  const ocBin = findBin("openclaw");
  if (ocBin) {
    const addResult = spawnSync(ocBin, [
      "channels", "add",
      "--channel", "telegram",
      "--token", botToken,
      "--name", botId,
    ], { encoding: "utf-8", timeout: 15_000 });
    if (addResult.status !== 0) {
      console.error("openclaw channels add failed:", addResult.stderr);
    }
  }
}

function findBin(name: string): string | null {
  try {
    return execSync(`which ${name}`, { encoding: "utf-8" }).trim() || null;
  } catch {
    return null;
  }
}

function seedBoardDb() {
  const dbDir = path.join(STATE_DIR, "USER", "brain");
  fs.mkdirSync(dbDir, { recursive: true });
  const dbPath = path.join(dbDir, "board.db");

  const script = `import sqlite3, datetime
conn = sqlite3.connect("${dbPath}")
conn.execute("""CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    work_dir TEXT NOT NULL DEFAULT '', github_repo TEXT NOT NULL DEFAULT '',
    build_command TEXT NOT NULL DEFAULT ''
)""")
now = datetime.datetime.utcnow().isoformat() + "Z"
seeds = [
    ("prj_uncategorized", "Uncategorized", "uncategorized", "Default project for unassigned cards"),
    ("prj_miniclaw_enh", "MiniClaw Enhancements", "miniclaw-enhancements", "Improvements and new features for MiniClaw"),
]
for sid, name, slug, desc in seeds:
    if not conn.execute("SELECT id FROM projects WHERE id = ?", (sid,)).fetchone():
        conn.execute("INSERT INTO projects (id, name, slug, description, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
            (sid, name, slug, desc, "active", now, now))
conn.commit()
conn.close()
`;
  const tmpScript = path.join(os.tmpdir(), `miniclaw-seed-${process.pid}.py`);
  fs.writeFileSync(tmpScript, script, "utf-8");
  try {
    execSync(`python3 "${tmpScript}"`, { stdio: "pipe" });
  } finally {
    fs.unlinkSync(tmpScript);
  }
}

/**
 * Install and start the openclaw gateway LaunchAgent.
 * Returns { ok, error? } — errors are non-fatal (gateway can be started manually).
 */
function ensureGatewayRunning(): { ok: boolean; error?: string } {
  const ocBin = findBin("openclaw");
  if (!ocBin) return { ok: false, error: "openclaw not found on PATH" };

  // Install the gateway LaunchAgent (creates plist + loads it)
  const installResult = spawnSync(ocBin, ["gateway", "install", "--force"], {
    encoding: "utf-8",
    timeout: 30_000,
  });
  if (installResult.status !== 0) {
    return { ok: false, error: installResult.stderr?.trim() || "gateway install failed" };
  }

  // Give it a moment to start
  spawnSync("sleep", ["3"]);

  // Check status
  const statusResult = spawnSync(ocBin, ["gateway", "status"], {
    encoding: "utf-8",
    timeout: 10_000,
  });
  const output = (statusResult.stdout || "") + (statusResult.stderr || "");
  const running = /running|listening|connected|uptime/i.test(output);

  return running
    ? { ok: true }
    : { ok: false, error: "gateway installed but not yet running — it may need a few more seconds" };
}

/**
 * Authenticate the gh CLI using the GitHub token from setup-state or vault.
 * This ensures `gh` commands work immediately after install.
 */
function applyGithubAuth(): { ok: boolean; error?: string } {
  const state = readSetupState();
  const token = (state as Record<string, string>).ghToken;
  if (!token) {
    return { ok: false, error: "No GitHub token found in setup state" };
  }

  const ghBin = findBin("gh");
  if (!ghBin) {
    return { ok: false, error: "gh CLI not found on PATH" };
  }

  const result = spawnSync(ghBin, ["auth", "login", "--with-token"], {
    input: token,
    encoding: "utf-8",
    timeout: 15_000,
    env: { ...process.env, GH_PROMPT_DISABLED: "1" },
  });

  if (result.status !== 0) {
    return { ok: false, error: result.stderr?.trim() || "gh auth login failed" };
  }

  return { ok: true };
}

/**
 * Set the mc-github defaultRepo in openclaw.json plugin config.
 */
function setGithubDefaultRepo() {
  const state = readSetupState();
  const username = (state as Record<string, string>).ghUsername;
  if (!username) return;

  const configPath = path.join(STATE_DIR, "openclaw.json");
  let cfg: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch { /* start fresh */ }

  const plugins = (cfg.plugins ?? {}) as Record<string, unknown>;
  const entries = (plugins.entries ?? {}) as Record<string, Record<string, unknown>>;
  const mcGithub = entries["mc-github"] ?? {};
  if (!mcGithub.defaultRepo) {
    mcGithub.defaultRepo = `${username}/miniclaw-os`;
  }
  entries["mc-github"] = mcGithub;
  plugins.entries = entries;
  cfg.plugins = plugins;

  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
}

/**
 * Run mc-smoke and return the output.
 */
function runSmoke(): { output: string; passed: boolean } {
  const smokeBin = findBin("mc-smoke");
  if (!smokeBin) return { output: "mc-smoke not found on PATH", passed: false };

  const result = spawnSync(smokeBin, [], {
    encoding: "utf-8",
    timeout: 120_000,
    env: { ...process.env, FORCE_COLOR: "0" }, // no ANSI in JSON response
  });
  const output = (result.stdout || "") + (result.stderr || "");
  return { output, passed: result.status === 0 };
}

export async function POST() {
  const setupState = readSetupState();
  const botId = normalizeBotId(setupState.telegramBotUsername);

  if (!botId) {
    return NextResponse.json(
      { ok: false, error: "Telegram bot username is required before completing setup" },
      { status: 400 },
    );
  }

  // Configure openclaw.json, register telegram channel, store token in vault
  configureGateway(botId, setupState.telegramBotToken);

  // Authenticate gh CLI with the GitHub token (non-fatal if it fails)
  const ghAuth = applyGithubAuth();
  if (!ghAuth.ok) {
    console.warn("gh auth login skipped:", ghAuth.error);
  }

  // Set mc-github defaultRepo in openclaw.json
  setGithubDefaultRepo();

  // Create USER/brain/ and seed the board DB with default projects
  seedBoardDb();

  // Install and start the openclaw gateway
  const gw = ensureGatewayRunning();

  // Register cron jobs with the running gateway
  registerCronJobs();

  // Run mc-smoke to verify everything is healthy
  const smoke = runSmoke();

  // Self-healing: auto-create fix cards for any smoke test failures
  const healResult = await healSmokeFailures(
    smoke.output,
    setupState.telegramBotToken,
    setupState.telegramChatId,
  );

  const state = writeSetupState({
    complete: true,
    completedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    state,
    ghAuth,
    gateway: gw,
    projectsFolder,
    smoke: {
      output: smoke.output,
      passed: smoke.passed,
      healing: {
        failures: healResult.failures.length,
        cardsCreated: healResult.cards.length,
        notified: healResult.notified,
        cards: healResult.cards,
      },
    },
  });
}
