export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { readSetupState, writeSetupState } from "@/lib/setup-state";
import { vaultSet } from "@/lib/vault";
import { healSmokeFailures } from "@/lib/smoke-heal";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
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
 * Seed the GitHub presence setup card into the board DB.
 * Only called when a GH token is present and auth succeeded.
 */
function seedGithubSetupCard() {
  const dbPath = path.join(STATE_DIR, "USER", "brain", "board.db");
  if (!fs.existsSync(dbPath)) return;

  const script = `import sqlite3
conn = sqlite3.connect("${dbPath}")
conn.execute("""INSERT OR IGNORE INTO cards (id, title, col, priority, tags, project_id, created_at, updated_at, problem_description, implementation_plan, acceptance_criteria)
VALUES (
  'crd_seed_github_presence',
  'Set up GitHub presence',
  'backlog',
  'medium',
  '["setup","github"]',
  'prj_setup',
  datetime('now'),
  datetime('now'),
  'GitHub token is configured but the account may not be set up for MiniClaw collaboration. Need to verify: profile avatar, profile README, fork of miniclaw-os, publish any extensions, and ensure contribution graph is visible.',
  '1. Check if GitHub profile has an avatar — if not, upload one.\\n2. Create or update profile README (username/username repo) with a short bio.\\n3. Fork augmentedmike/miniclaw-os to the human''s account if not already forked.\\n4. If any local mc-* extensions exist, publish them as public repos.\\n5. Ensure contribution graph is set to show all contributions (not private-only).',
  'GitHub profile has an avatar set. Profile README repo exists and is non-empty. miniclaw-os fork exists under the human''s account. Contribution graph is publicly visible.'
)""")
conn.commit()
conn.close()
`;
  const tmpScript = path.join(os.tmpdir(), `miniclaw-gh-seed-${process.pid}.py`);
  fs.writeFileSync(tmpScript, script, "utf-8");
  try {
    execSync(`python3 "${tmpScript}"`, { stdio: "pipe" });
  } catch (e) {
    console.error("GitHub setup card seeding failed:", e);
  } finally {
    try { fs.unlinkSync(tmpScript); } catch { /* ignore */ }
  }
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
  const installs = (plugins.installs ?? {}) as Record<string, Record<string, unknown>>;
  const mcGithub = installs["mc-github"] ?? {};
  const mcGithubConfig = (mcGithub.config ?? {}) as Record<string, unknown>;
  if (!mcGithubConfig.defaultRepo) {
    mcGithubConfig.defaultRepo = `${username}/miniclaw-os`;
  }
  mcGithub.config = mcGithubConfig;
  installs["mc-github"] = mcGithub;
  plugins.installs = installs;
  cfg.plugins = plugins;

  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + "\n", "utf-8");
}

/**
 * Create the canonical projects folder and ~/mc-projects symlink.
 * Path: ~/.openclaw/miniclaw/USER/projects (safe from updates)
 * Symlink: ~/mc-projects -> the above path
 */
function ensureProjectsFolder(): { ok: boolean; path: string; symlink: string } {
  const projectsDir = path.join(STATE_DIR, "miniclaw", "USER", "projects");
  const symlinkPath = path.join(os.homedir(), "mc-projects");

  fs.mkdirSync(projectsDir, { recursive: true });

  // Create symlink if it doesn't already point to the right place
  try {
    const existing = fs.readlinkSync(symlinkPath);
    if (existing !== projectsDir) {
      fs.unlinkSync(symlinkPath);
      fs.symlinkSync(projectsDir, symlinkPath);
    }
  } catch {
    // symlink doesn't exist or isn't a symlink — create it
    try { fs.unlinkSync(symlinkPath); } catch { /* ignore */ }
    fs.symlinkSync(projectsDir, symlinkPath);
  }

  return { ok: true, path: projectsDir, symlink: symlinkPath };
}

/**
 * Persist the user's chosen update time to the mc-update plugin config in openclaw.json.
 * Converts HH:MM to a cron expression (e.g. "03:00" → "0 3 * * *").
 */
function persistUpdateTime() {
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

  const workspace = path.join(STATE_DIR, "workspace");
  const manifestPath = path.join(STATE_DIR, "miniclaw", "MANIFEST.json");

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
email = state.get("emailAddress", "")
gh_user = state.get("ghUsername", "")

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
    "{{EMAIL}}": email, "{{GITHUB}}": gh_user,
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

/**
 * Register cron jobs with the gateway from jobs.json.
 * The gateway must be running for this to work.
 */
function registerCronJobs() {
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
 * Seed the rolodex with the human owner and agent contacts.
 * Writes contacts.json so the rolodex SQLite migration picks them up on first open.
 * Only seeds if contacts.json doesn't exist yet or is empty.
 *
 * IMPORTANT identity rules:
 * - The wizard's emailAddress field is the AGENT's email, NOT the human's.
 * - Human contact is seeded with NO email (emails: []).
 *   The agent should later ask the human for their real name & email via the
 *   onboarding seed card created by seedOnboardingCard().
 */
function seedRolodexContacts() {
  const setupState = readSetupState();
  const rolodexDir = path.join(STATE_DIR, "USER", "rolodex");
  const contactsPath = path.join(rolodexDir, "contacts.json");

  // Skip if contacts.json already has data
  if (fs.existsSync(contactsPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(contactsPath, "utf-8"));
      if (Array.isArray(existing) && existing.length > 0) return;
    } catch { /* treat parse errors as empty */ }
  }

  fs.mkdirSync(rolodexDir, { recursive: true });

  const contacts = [];

  // Human owner contact — NO email, NO real name yet.
  // The onboarding seed card will prompt the agent to ask the human for these.
  contacts.push({
    id: crypto.randomUUID(),
    name: "My Human",
    emails: [],
    phones: [],
    domains: [],
    tags: ["owner", "human"],
    trustStatus: "verified",
    lastVerified: new Date().toISOString(),
    notes: "Human owner — added during setup. Name and email TBD (agent will ask).",
  });

  // Agent contact — emailAddress from the wizard is the AGENT's own email.
  // Do NOT put the human's email here.
  const agentName = setupState.assistantName || "MiniClaw";
  const agentShort = setupState.shortName || agentName;
  const agentEmail = setupState.emailAddress || "";
  const agentGh = (setupState as Record<string, string>).ghUsername || "";
  contacts.push({
    id: crypto.randomUUID(),
    name: agentName,
    emails: agentEmail ? [agentEmail] : [],
    phones: [],
    domains: [],
    tags: ["agent", "self"],
    trustStatus: "verified",
    lastVerified: new Date().toISOString(),
    notes: agentGh ? `AI agent (${agentShort}). GitHub: ${agentGh}.` : `AI agent (${agentShort}) — added during setup.`,
  });

  fs.writeFileSync(contactsPath, JSON.stringify(contacts, null, 2) + "\n", "utf-8");
}

/**
 * Seed an onboarding card that prompts the agent to ask the human their real
 * name and preferred email address, then update the rolodex accordingly.
 * This runs after seedRolodexContacts() so the human contact exists as "My Human"
 * with no email — the agent's first task is to fix that.
 */
function seedOnboardingCard() {
  const dbPath = path.join(STATE_DIR, "USER", "brain", "board.db");
  if (!fs.existsSync(dbPath)) return;

  const script = `import sqlite3
conn = sqlite3.connect("${dbPath}")
conn.execute("""INSERT OR IGNORE INTO cards (id, title, col, priority, tags, project_id, created_at, updated_at, problem_description, implementation_plan, acceptance_criteria)
VALUES (
  'crd_seed_onboarding',
  'Onboarding: ask human their name and email',
  'backlog',
  'high',
  '["setup","onboarding"]',
  'prj_setup',
  datetime('now'),
  datetime('now'),
  'The rolodex has a placeholder contact for the human owner (name="My Human", no email). The agent needs to ask the human for their real name and preferred email address, then update the rolodex so all future communications use the correct identity.',
  '1. Send the human a Telegram message (use the inbox CLI, NOT mc-human) asking for their preferred name and email address.\\n2. Once the human replies in Telegram, find the human contact id with: openclaw mc-rolodex list --tag owner\\n3. Update the contact: openclaw mc-rolodex update <human-contact-id> --name "<real name>" --email "<real email>"\\n4. Verify the rolodex contact was updated correctly with: openclaw mc-rolodex list',
  '- [ ] Human contact in rolodex has their real name (not "My Human")\\n- [ ] Human contact has their real email address\\n- [ ] Agent confirmed the update via mc-rolodex list'
)""")
conn.commit()
conn.close()
`;
  const tmpScript = path.join(os.tmpdir(), `miniclaw-onboarding-seed-${process.pid}.py`);
  fs.writeFileSync(tmpScript, script, "utf-8");
  try {
    execSync(`python3 "${tmpScript}"`, { stdio: "pipe" });
  } catch (e) {
    console.error("Onboarding seed card creation failed:", e);
  } finally {
    try { fs.unlinkSync(tmpScript); } catch { /* ignore */ }
  }
}

/**
 * Register an email watch cron job when email credentials are present.
 * Checks IMAP every 5 minutes and surfaces relevant messages to the agent.
 */
function ensureEmailWatchCron() {
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

/**
 * Send a welcome email from the agent to itself, confirming email is working.
 */
function sendWelcomeEmail() {
  const state = readSetupState();
  const addr = state.emailAddress;
  const pw = (state as Record<string, string>).appPassword;
  if (!addr || !pw) return;

  const host = (state as Record<string, string>).emailSmtpHost || "smtp.gmail.com";
  const port = (state as Record<string, string>).emailSmtpPort || "587";
  const name = state.assistantName || "MiniClaw";

  const script = `
import smtplib, sys, ssl
from email.message import EmailMessage
addr, pw, host, port, name = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), sys.argv[5]
msg = EmailMessage()
msg["Subject"] = f"Hello from {name}"
msg["From"] = addr
msg["To"] = addr
msg.set_content(f"Hi! I'm {name}, your MiniClaw AI assistant. I just finished setting up and I'm ready to work.\\n\\nThis email confirms that my email is configured and working.\\n\\n\\u2014 {name}")
try:
    if port == 465:
        ctx = ssl.create_default_context()
        with smtplib.SMTP_SSL(host, port, context=ctx) as s:
            s.login(addr, pw)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port) as s:
            s.starttls()
            s.login(addr, pw)
            s.send_message(msg)
    print("sent")
except Exception as e:
    print(f"failed: {e}")
`;

  try {
    const tmpScript = path.join(os.tmpdir(), `mc-welcome-email-${process.pid}.py`);
    fs.writeFileSync(tmpScript, script, "utf-8");
    const result = execSync(
      `python3 "${tmpScript}" "${addr}" '${pw.replace(/'/g, "'\\''")}' "${host}" "${port}" "${name}"`,
      { encoding: "utf-8", timeout: 30_000 },
    );
    fs.unlinkSync(tmpScript);
    console.log(`Welcome email: ${result.trim()}`);
  } catch (e) {
    console.error("Welcome email failed:", e);
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

  // Authenticate gh CLI with the GitHub token (non-fatal if it fails)
  const ghAuth = applyGithubAuth();
  if (!ghAuth.ok) {
    console.warn("gh auth login skipped:", ghAuth.error);
  }

  // Set mc-github defaultRepo in openclaw.json
  setGithubDefaultRepo();

  // Create USER/brain/ and seed the board DB with default projects
  seedBoardDb();

  // Seed GitHub presence setup card if GH token is configured
  if (ghAuth.ok) {
    seedGithubSetupCard();
  }

  // Create canonical projects folder and ~/mc-projects symlink
  const projectsFolder = ensureProjectsFolder();

  // Re-run workspace personalization now that setup-state.json is complete
  personalizeWorkspace();

  // Seed rolodex with human owner and agent contacts
  // NOTE: human gets NO email here — the onboarding card asks the agent to collect it
  seedRolodexContacts();

  // Seed onboarding card so the agent asks the human their real name & email
  seedOnboardingCard();

  // Install and start the openclaw gateway
  const gw = ensureGatewayRunning();

  // Register cron jobs with the running gateway
  registerCronJobs();

  // Register email watch cron if email is configured
  ensureEmailWatchCron();

  // Persist the user's chosen nightly update time to mc-update plugin config
  persistUpdateTime();

  // Send welcome email from the agent
  sendWelcomeEmail();

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
        skippedDuplicates: healResult.skippedDuplicates,
        notified: healResult.notified,
        cards: healResult.cards,
      },
    },
  });
}
