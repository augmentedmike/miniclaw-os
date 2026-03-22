import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execSync, spawnSync } from "node:child_process";
import { readSetupState } from "@/lib/setup-state";
import { STATE_DIR, findBin } from "./constants";

/**
 * Authenticate the gh CLI using the GitHub token from setup-state or vault.
 * This ensures `gh` commands work immediately after install.
 */
export function applyGithubAuth(): { ok: boolean; error?: string } {
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
export function seedGithubSetupCard() {
  const dbPath = path.join(STATE_DIR, "miniclaw", "USER", "brain", "board.db");
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
export function setGithubDefaultRepo() {
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
