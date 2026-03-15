export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readSetupState, writeSetupState } from "@/lib/setup-state";
import { vaultSet } from "@/lib/vault";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync, spawnSync } from "node:child_process";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(process.env.HOME || "", ".openclaw");

function normalizeBotId(username: string): string {
  return username.replace(/^@/, "").trim();
}

/**
 * Register the telegram channel with openclaw and store the bot token in vault.
 * The botId is written under `meta.botId` (NOT top-level) so openclaw config
 * validation doesn't reject it.
 */
function configureGateway(botId: string, botToken: string, chatId?: string) {
  const configPath = path.join(STATE_DIR, "openclaw.json");
  let cfg: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      cfg = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch { /* start fresh */ }

  // Remove any botId from config — openclaw doesn't recognize it
  delete cfg.botId;
  const meta = (cfg.meta ?? {}) as Record<string, unknown>;
  delete meta.botId;
  cfg.meta = meta;

  // Set gateway mode to local
  const gw = (cfg.gateway ?? {}) as Record<string, unknown>;
  if (!gw.mode) gw.mode = "local";
  cfg.gateway = gw;

  // Configure telegram channel directly in openclaw.json
  const channels = (cfg.channels ?? {}) as Record<string, unknown>;
  channels.telegram = {
    enabled: true,
    botToken: botToken,
    dmPolicy: "pairing",
    groupPolicy: "allowlist",
    groupAllowFrom: chatId ? [chatId] : [],
    allowFrom: chatId ? [chatId] : [],
    streaming: "partial",
  };
  cfg.channels = channels;

  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n", "utf-8");

  // Also store the bot token in vault as backup
  const vaultResult = vaultSet("telegram-bot-token", botToken);
  if (!vaultResult.ok) {
    console.error("Vault write failed (non-fatal):", vaultResult.error);
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

  // DO NOT run openclaw doctor --fix here — it rewrites openclaw.json
  // and wipes the miniclaw plugin paths/entries that install.sh configured.

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

/**
 * Re-run the workspace personalization from install.sh.
 * Replaces {{AGENT_NAME}}, {{PRONOUNS}}, etc. in all workspace .md files.
 */
function personalizeWorkspace() {
  const setupState = readSetupState();
  const name = setupState.assistantName;
  if (!name) return;

  const miniclaw = path.join(STATE_DIR, "miniclaw");
  const workspace = path.join(miniclaw, "workspace");
  const manifestPath = path.join(miniclaw, "MANIFEST.json");

  if (!fs.existsSync(workspace)) return;

  const script = `
import json, sys, os
from datetime import date

workspace = sys.argv[1]
manifest_path = sys.argv[2]
state = json.loads(sys.argv[3])

name = state.get("assistantName", "")
short = state.get("shortName", name)
pronouns = state.get("pronouns", "they/them")
blurb = state.get("personaBlurb", "")

if not name:
    sys.exit(0)

pmap = {"she/her": ("she", "her"), "he/him": ("he", "his"), "they/them": ("they", "their")}
subj, poss = pmap.get(pronouns, ("they", "their"))

version = "0.1.0"
try:
    with open(manifest_path) as f:
        version = json.load(f).get("version", version)
except Exception:
    pass

today = date.today().isoformat()
replacements = {
    "{{AGENT_NAME}}": name, "{{AGENT_SHORT}}": short,
    "{{HUMAN_NAME}}": "my human", "{{PRONOUNS}}": pronouns,
    "{{PRONOUNS_SUBJECT}}": subj, "{{PRONOUNS_POSSESSIVE}}": poss,
    "{{VERSION}}": version, "{{DATE}}": today,
}

for dirpath, _dirs, files in os.walk(workspace):
    for fname in files:
        if not fname.endswith(".md"):
            continue
        fpath = os.path.join(dirpath, fname)
        with open(fpath) as f:
            content = f.read()
        changed = False
        for placeholder, value in replacements.items():
            if placeholder in content:
                content = content.replace(placeholder, value)
                changed = True
        if changed:
            with open(fpath, "w") as f:
                f.write(content)

print(f"Personalized: {name} ({pronouns})")
`;

  try {
    const stateJson = JSON.stringify(setupState);
    const tmpScript = path.join(os.tmpdir(), `miniclaw-personalize-${process.pid}.py`);
    fs.writeFileSync(tmpScript, script, "utf-8");
    execSync(`python3 "${tmpScript}" "${workspace}" "${manifestPath}" '${stateJson.replace(/'/g, "'\\''")}'`, {
      encoding: "utf-8",
      timeout: 15_000,
    });
    fs.unlinkSync(tmpScript);
  } catch (e) {
    console.error("Workspace personalization failed:", e);
  }
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
  configureGateway(botId, setupState.telegramBotToken, setupState.telegramChatId);

  // Create USER/brain/ and seed the board DB with default projects
  seedBoardDb();

  // Re-run workspace personalization now that setup-state.json is complete
  personalizeWorkspace();

  // Install and start the openclaw gateway
  const gw = ensureGatewayRunning();

  // Run mc-smoke to verify everything is healthy
  const smoke = runSmoke();

  const state = writeSetupState({
    complete: true,
    completedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    ok: true,
    state,
    gateway: gw,
    smoke: { output: smoke.output, passed: smoke.passed },
  });
}
