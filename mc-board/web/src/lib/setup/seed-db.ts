import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";
import { STATE_DIR } from "./constants";

export function seedBoardDb() {
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
 * Seed an onboarding card that prompts the agent to ask the human their real
 * name and preferred email address, then update the rolodex accordingly.
 */
export function seedOnboardingCard() {
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
  'The rolodex has a placeholder contact for the human owner (name="My Human", no email). The agent needs to ask the human for their real name and preferred email address, then update the rolodex so all future communications use the correct identity. IMPORTANT: Before asking, run openclaw mc-rolodex list --tag owner. If the owner contact already has a real name (not "My Human") and an email address, skip asking and move this card directly to done.',
  '0. GUARD: Run openclaw mc-rolodex list --tag owner. If the owner name is NOT "My Human" AND has a non-empty email, onboarding is already complete — move this card to done and exit immediately.\\n1. Send the human a Telegram message (use the inbox CLI, NOT mc-human) asking for their preferred name and email address.\\n2. Once the human replies in Telegram, find the human contact id with: openclaw mc-rolodex list --tag owner\\n3. Update the contact: openclaw mc-rolodex update CONTACT_ID --name "their name" --email "their email"\\n4. Verify the rolodex contact was updated correctly with: openclaw mc-rolodex list',
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
