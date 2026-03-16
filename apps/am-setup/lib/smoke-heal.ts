/**
 * smoke-heal.ts — Parse mc-smoke output and auto-create fix cards for failures.
 *
 * Each smoke test failure spawns a high-priority board card with a pre-filled
 * problem description and remediation plan so the board worker can pick it up
 * automatically.
 */

import { execSync, spawnSync } from "node:child_process";

/* ── Failure → remediation mapping ──────────────────────────────────────── */

interface Remediation {
  /** Substring to match against the combined label+fix text (case-insensitive) */
  match: string;
  component: string;
  plan: string;
}

/**
 * Known remediation plans. Order matters — more specific matches first,
 * generic fallbacks last.
 */
const REMEDIATIONS: Remediation[] = [
  // mc-vault
  { match: "vault not initialized", component: "mc-vault", plan: "Run: mc-vault init — this creates the age key and vault directory." },
  { match: "encrypt/decrypt failed", component: "mc-vault / age", plan: "Check age binaries (brew install age) and vault key at SYSTEM/vault/key.txt. Re-run: mc-vault init if key is corrupt." },

  // age
  { match: "age key roundtrip failed", component: "age", plan: "The vault key may be corrupt. Back up and regenerate: age-keygen -o ~/.openclaw/miniclaw/SYSTEM/vault/key.txt" },
  { match: "no age recipient", component: "age", plan: "The vault key file doesn't contain a valid age public key. Regenerate: age-keygen -o ~/.openclaw/miniclaw/SYSTEM/vault/key.txt" },
  { match: "/opt/homebrew/bin/age", component: "age", plan: "Install age encryption: brew install age. Verify /opt/homebrew/bin/age and /opt/homebrew/bin/age-keygen exist." },

  // inbox
  { match: "cli missing or not executable", component: "inbox", plan: "Re-run installer to create ~/.claude-inbox/msg or manually create the inbox CLI script." },

  // openclaw
  { match: "openclaw.json missing", component: "openclaw config", plan: "Re-run the setup wizard or create ~/.openclaw/openclaw.json with gateway and channel config." },

  // board DB
  { match: "prj_miniclaw_enh missing", component: "board DB", plan: "Seed the required project: run the setup wizard complete step or manually INSERT into projects table." },
  { match: "board.db cannot be read", component: "board DB", plan: "The board database is corrupt or unreadable. Delete and re-seed: re-run the setup wizard completion step." },
  { match: "board.db not found", component: "board DB", plan: "Re-run the setup wizard completion step which seeds the board DB, or run install.sh." },

  // backups
  { match: "backup is corrupt", component: "backups", plan: "Delete the corrupt archive and run: openclaw mc-backup now — to create a fresh backup." },

  // plugin secrets (match before generic "missing")
  { match: "secret", component: "plugin secrets", plan: "Set the missing vault secret: mc-vault set <secret-key> <value>. Check MANIFEST.json for required secrets." },

  // plugin CLI
  { match: "not on path", component: "plugin CLI", plan: "Add SYSTEM/bin to $PATH. Edit shell profile: export PATH=\"$HOME/.openclaw/miniclaw/SYSTEM/bin:$PATH\"" },
  { match: "path but not executable", component: "plugin CLI", plan: "Fix permissions: chmod +x on the plugin binary in SYSTEM/bin/." },
  { match: "missing from system/bin", component: "plugin CLI", plan: "Re-run install.sh to generate CLI wrappers in SYSTEM/bin for all plugins." },

  // plugin loading
  { match: "load failed", component: "plugin loading", plan: "Check the plugin's index.ts for import errors. Common fix: cd to plugin dir, run npm install / bun install, then npx tsx -e \"import r from './index.ts'\" to diagnose." },
  { match: "missing index.ts", component: "plugin loading", plan: "The plugin is missing its entry point. Re-run install.sh or check the plugin source." },

  // plugin tests
  { match: "tests", component: "plugin tests", plan: "Run: cd <plugin-dir> && npx vitest run — to see failing tests. Fix or skip broken tests." },

  // gateway
  { match: "gateway launchagent plist missing", component: "gateway", plan: "Install the gateway LaunchAgent: openclaw gateway install --force" },
  { match: "gateway launchagent not loaded", component: "gateway", plan: "Load the gateway: launchctl load ~/Library/LaunchAgents/ai.openclaw.gateway.plist" },
  { match: "gateway not running", component: "gateway", plan: "Start the gateway: openclaw gateway start. If it fails, check logs: cat ~/Library/Logs/openclaw-gateway.log" },

  // telegram
  { match: "telegram channel not in", component: "telegram", plan: "Re-run setup wizard or add channels.telegram config to ~/.openclaw/openclaw.json with botToken and enabled: true." },
  { match: "telegram channel disabled", component: "telegram", plan: "Enable telegram: set channels.telegram.enabled = true in ~/.openclaw/openclaw.json" },
  { match: "telegram bot token missing", component: "telegram", plan: "Set the bot token: add channels.telegram.botToken in ~/.openclaw/openclaw.json or re-run setup wizard." },

  // LaunchAgents (after gateway-specific matches)
  { match: "plist missing", component: "LaunchAgents", plan: "Re-install the LaunchAgent plist. For board-web: copy com.miniclaw.board-web.plist to ~/Library/LaunchAgents/. For gateway: openclaw gateway install --force." },

  // cron jobs
  { match: "jobs.json missing", component: "cron jobs", plan: "Re-run install.sh to generate cron/jobs.json from MANIFEST.json." },
  { match: "cron job missing", component: "cron jobs", plan: "Sync cron jobs: re-run install.sh or manually add the missing job to cron/jobs.json and register via openclaw cron add." },
  { match: "duplicate cron jobs", component: "cron jobs", plan: "Remove duplicates: openclaw cron list, then openclaw cron rm <duplicate-id> for each duplicate." },

  // install verification
  { match: "placeholders", component: "workspace personalization", plan: "Re-run install.sh or the setup wizard completion step to replace {{AGENT_NAME}} etc. in workspace .md files." },
  { match: "soul.md missing agent name", component: "workspace personalization", plan: "Re-run workspace personalization via setup wizard complete step." },
  { match: "identity.md missing agent name", component: "workspace personalization", plan: "Re-run workspace personalization via setup wizard complete step." },
  { match: "gateway.mode not set", component: "openclaw config", plan: "Set gateway.mode = \"local\" in ~/.openclaw/openclaw.json." },
  { match: "model missing provider prefix", component: "openclaw config", plan: "Update agents.defaults.model.primary in openclaw.json to use provider prefix (e.g. anthropic/claude-sonnet-4-5-20250514)." },

  // browser
  { match: "google chrome not installed", component: "browser", plan: "Install Chrome: brew install --cask google-chrome" },
  { match: "mc-chrome launcher missing", component: "browser", plan: "Re-run install.sh to create mc-chrome launcher in SYSTEM/bin/." },

  // gh CLI
  { match: "gh cli not on path", component: "GitHub CLI", plan: "Install gh: brew install gh. Then authenticate: gh auth login." },

  // Claude Code
  { match: "claude code not on path", component: "Claude Code", plan: "Install Claude Code: npm install -g @anthropic-ai/claude-code" },

  // power management
  { match: "disksleep", component: "power management", plan: "Disable disk sleep: sudo pmset -a disksleep 0" },
  { match: "autorestart", component: "power management", plan: "Enable auto restart: sudo pmset -a autorestart 1" },

  // Generic fallbacks (must be last)
  { match: "not found", component: "system", plan: "A required binary is not on PATH. Re-run install.sh or install the missing tool." },
  { match: "missing", component: "system", plan: "A required file or directory is missing. Re-run install.sh or create it manually." },
  { match: "not loaded", component: "LaunchAgents", plan: "Load the LaunchAgent: launchctl load ~/Library/LaunchAgents/<label>.plist" },
];

/* ── Parsing ────────────────────────────────────────────────────────────── */

export interface SmokeFailure {
  label: string;
  fix: string;
  component: string;
  plan: string;
}

/**
 * Parse mc-smoke output and extract all failures with remediation info.
 */
export function parseSmokeFailures(output: string): SmokeFailure[] {
  const failures: SmokeFailure[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    // Match failure lines: "  ✗  <label>  →  <fix>"
    if (!line.includes("✗") && !line.includes("[✗]")) continue;

    const label = line
      .replace(/.*[✗]\s*/, "")
      .replace(/\s*→.*/, "")
      .trim();
    const fix = line.includes("→")
      ? line.replace(/.*→\s*/, "").trim()
      : "";

    // Find the best matching remediation
    const remed = findRemediation(label, fix);

    failures.push({
      label,
      fix,
      component: remed.component,
      plan: remed.plan,
    });
  }

  return failures;
}

function findRemediation(label: string, fix: string): { component: string; plan: string } {
  const combined = `${label} ${fix}`.toLowerCase();
  for (const remed of REMEDIATIONS) {
    if (combined.includes(remed.match)) {
      return { component: remed.component, plan: remed.plan };
    }
  }
  return {
    component: "unknown",
    plan: `Investigate the failure: "${label}". Suggested fix from smoke test: ${fix || "none provided"}.`,
  };
}

/* ── Card creation ──────────────────────────────────────────────────────── */

export interface CreatedFixCard {
  id: string;
  title: string;
  component: string;
}

function findBin(name: string): string | null {
  try {
    return execSync(`which ${name}`, { encoding: "utf-8" }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Create a fix card on the board for a single smoke test failure.
 * Returns the card ID if successful, null otherwise.
 */
function createFixCard(failure: SmokeFailure): CreatedFixCard | null {
  const ocBin = findBin("openclaw");
  if (!ocBin) return null;

  const title = `Fix: ${failure.component} — ${failure.label}`;
  const problem = [
    `Post-install smoke test failure:`,
    ``,
    `**Check:** ${failure.label}`,
    `**Suggested fix:** ${failure.fix}`,
    ``,
    `This was automatically detected by mc-smoke during setup completion.`,
  ].join("\n");

  const plan = [
    `1. Diagnose: ${failure.plan}`,
    `2. Verify fix by running: mc-smoke (check that "${failure.label}" now passes)`,
    `3. If the fix requires user action (sudo, credentials), add a hold tag and notify.`,
  ].join("\n");

  const criteria = [
    `- [ ] "${failure.label}" smoke check passes`,
    `- [ ] No regressions in other smoke checks`,
  ].join("\n");

  const result = spawnSync(
    ocBin,
    [
      "mc-board",
      "create",
      "--title", title,
      "--priority", "high",
      "--tags", "setup,smoke-fix,self-healing",
      "--problem", problem,
      "--plan", plan,
      "--criteria", criteria,
      "--notes", `Auto-created by smoke-heal on ${new Date().toISOString()}`,
    ],
    {
      encoding: "utf-8",
      timeout: 15_000,
    },
  );

  if (result.status !== 0) {
    console.error(`Failed to create fix card for "${failure.label}":`, result.stderr);
    return null;
  }

  // Extract card ID from output (e.g. "Created crd_abc12345: Fix: ...")
  const match = result.stdout.match(/crd_[a-z0-9]+/);
  const id = match ? match[0] : "unknown";

  return { id, title, component: failure.component };
}

/* ── Telegram notification ──────────────────────────────────────────────── */

async function notifyTelegram(
  cards: CreatedFixCard[],
  botToken: string,
  chatId: string,
): Promise<boolean> {
  if (!botToken || !chatId || cards.length === 0) return false;

  const lines = [
    `🔧 *Self-healing: ${cards.length} fix card${cards.length > 1 ? "s" : ""} created*`,
    ``,
    `Post-install smoke test found failures. Fix cards have been added to the board backlog:`,
    ``,
    ...cards.map((c) => `• \\[${c.id}\\] ${escapeMarkdown(c.title)}`),
    ``,
    `The board worker will pick these up automatically.`,
  ];

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: lines.join("\n"),
          parse_mode: "MarkdownV2",
        }),
      },
    );
    const data = await res.json();
    return data.ok === true;
  } catch (e) {
    console.error("Telegram notification failed:", e);
    return false;
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}

/* ── Public API ─────────────────────────────────────────────────────────── */

export interface SmokeHealResult {
  failures: SmokeFailure[];
  cards: CreatedFixCard[];
  notified: boolean;
}

/**
 * Process mc-smoke output: parse failures, create fix cards, notify via Telegram.
 *
 * @param smokeOutput — raw stdout+stderr from mc-smoke
 * @param telegramBotToken — bot token (from setup state or openclaw.json)
 * @param telegramChatId — chat ID for notifications
 */
export async function healSmokeFailures(
  smokeOutput: string,
  telegramBotToken?: string,
  telegramChatId?: string,
): Promise<SmokeHealResult> {
  const failures = parseSmokeFailures(smokeOutput);

  if (failures.length === 0) {
    return { failures: [], cards: [], notified: false };
  }

  // Create a fix card for each failure
  const cards: CreatedFixCard[] = [];
  for (const failure of failures) {
    const card = createFixCard(failure);
    if (card) cards.push(card);
  }

  // Notify via Telegram if config is available
  let notified = false;
  if (telegramBotToken && telegramChatId && cards.length > 0) {
    notified = await notifyTelegram(cards, telegramBotToken, telegramChatId);
  }

  return { failures, cards, notified };
}
