/**
 * mc-voice — OpenClaw plugin
 *
 * Captures human→agent messages from all channels into voice.db with Gemini embeddings.
 * Hooks into the message_received event to capture Telegram (and any other channel) messages.
 *
 * Transparency & opt-out:
 *   - Sends a proactive disclosure on the first message captured for a human_id (once only)
 *   - /voice-off   — disable ingestion + mimic immediately
 *   - /voice-on    — re-enable
 *   - /voice-purge — delete all stored messages and reset profile
 */

import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { spawn } from "node:child_process";
import { Database } from "bun:sqlite";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

interface VoiceConfig {
  humanId: string;
  dbPath: string;
  ingestBin: string;
}

const DISCLOSURE_TEXT =
  "Hey — I'm going to start learning from how you write so I can match your style over time. " +
  "I'll track vocabulary, tone, and sentence patterns from your messages. " +
  "You can turn this off any time by sending /voice-off.";

const STOP_MIRRORING_PATTERNS = [
  /\bstop\s+mirroring\s+me\b/i,
  /\bstop\s+mirroring\b/i,
  /\bturn\s+off\s+mirroring\b/i,
  /\bdisable\s+mirroring\b/i,
  /\bstop\s+learning\s+my\s+style\b/i,
];

function matchesStopMirroring(text: string): boolean {
  return STOP_MIRRORING_PATTERNS.some((re) => re.test(text));
}

function resolvePath(p: string): string {
  return p.startsWith("~/") ? path.join(os.homedir(), p.slice(2)) : p;
}

function resolveConfig(api: OpenClawPluginApi): VoiceConfig {
  const raw = (api.pluginConfig ?? {}) as Partial<VoiceConfig>;
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
  return {
    humanId: raw.humanId ?? "augmentedmike",
    dbPath: resolvePath(
      raw.dbPath ?? path.join(stateDir, "USER", "voice", "voice.db")
    ),
    ingestBin: resolvePath(
      raw.ingestBin ?? path.join(stateDir, "miniclaw/SYSTEM/bin/voice-ingest")
    ),
  };
}

// ── SQLite helpers (sync) ──────────────────────────────────────────────────────

function openDb(dbPath: string): Database {
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;");

  // Ensure disclosure columns exist (idempotent)
  for (const ddl of [
    "ALTER TABLE voice_settings ADD COLUMN needs_disclosure INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE voice_settings ADD COLUMN disclosed_at TEXT",
  ]) {
    try { db.exec(ddl); } catch { /* already exists */ }
  }

  // Mark existing users with prior messages as pre-acknowledged (no retroactive disclosure)
  db.exec(`
    UPDATE voice_settings
    SET disclosed_at = strftime('%Y-%m-%dT%H:%M:%SZ','now'), needs_disclosure = 0
    WHERE human_id IN (SELECT DISTINCT human_id FROM human_voice)
      AND disclosed_at IS NULL;
  `);

  return db;
}

function isOptedOut(db: Database, humanId: string): boolean {
  const row = db.prepare(
    "SELECT opted_out FROM voice_settings WHERE human_id = ?"
  ).get(humanId) as { opted_out: number } | undefined;
  return Boolean(row?.opted_out);
}

function needsDisclosure(db: Database, humanId: string): boolean {
  const row = db.prepare(
    "SELECT needs_disclosure, disclosed_at FROM voice_settings WHERE human_id = ?"
  ).get(humanId) as { needs_disclosure: number; disclosed_at: string | null } | undefined;
  if (!row) return false;
  return Boolean(row.needs_disclosure) && !row.disclosed_at;
}

function markDisclosed(db: Database, humanId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE voice_settings
     SET needs_disclosure = 0, disclosed_at = ?, updated_at = ?
     WHERE human_id = ?`
  ).run(now, now, humanId);
}

function setOptedOut(db: Database, humanId: string, value: boolean): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO voice_settings (human_id, opted_out, opted_out_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(human_id) DO UPDATE SET
       opted_out = excluded.opted_out,
       opted_out_at = CASE WHEN excluded.opted_out = 1 THEN excluded.opted_out_at ELSE NULL END,
       updated_at = excluded.updated_at`
  ).run(humanId, value ? 1 : 0, value ? now : null, now);
}

function purgeVoiceData(db: Database, humanId: string): number {
  const result = db.prepare(
    "DELETE FROM human_voice WHERE human_id = ?"
  ).run(humanId) as { changes: number };
  const count = result.changes;
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE voice_settings
     SET opted_out = 0, opted_out_at = NULL, learning_active = 1,
         last_analyzed_at = NULL, message_count_at_last_analysis = 0,
         needs_disclosure = 0, disclosed_at = NULL, updated_at = ?
     WHERE human_id = ?`
  ).run(now, humanId);
  return count;
}

// ── Ingest call (async, fire-and-forget) ──────────────────────────────────────

function callIngest(
  cfg: VoiceConfig,
  logger: OpenClawPluginApi["logger"],
  channel: string,
  message: string,
): void {
  const googleApiKey = process.env.GOOGLE_API_KEY ?? "";
  const child = spawn(
    cfg.ingestBin,
    [
      "--human-id", cfg.humanId,
      "--channel", channel,
      "--message", message,
      "--db", cfg.dbPath,
    ],
    {
      env: {
        ...process.env,
        GOOGLE_API_KEY: googleApiKey,
        OPENCLAW_STATE_DIR: process.env.OPENCLAW_STATE_DIR ?? "",
      },
      // Detach from event loop so we don't block on the Gemini API call
      detached: false,
      stdio: ["ignore", "ignore", "pipe"],
    }
  );

  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  child.on("error", (err) => {
    logger.warn(`mc-voice: ingest spawn error: ${err.message}`);
  });

  child.on("close", (code) => {
    if (code !== 0) {
      logger.warn(`mc-voice: ingest exited ${code}: ${stderr.slice(0, 200)}`);
    }
  });
}

// ── Plugin entry point ────────────────────────────────────────────────────────

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);

  api.logger.info(
    `mc-voice loaded (humanId=${cfg.humanId}, db=${cfg.dbPath})`
  );

  // Lazy DB handle — opened on first use
  let _db: Database | null = null;
  function getDb(): Database {
    if (!_db) _db = openDb(cfg.dbPath);
    return _db;
  }

  // In-memory flags for injecting replies via before_prompt_build
  let pendingOptOutConfirmation = false;

  // ── Capture all incoming human messages ──────────────────────────────────
  api.on("message_received", (event, _ctx) => {
    const content = event.content?.trim();
    if (!content) return;

    const channelRaw = (_ctx as { channelId?: string }).channelId ?? "other";
    let channel: string;
    if (channelRaw.includes("telegram")) channel = "telegram";
    else if (channelRaw.includes("inbox")) channel = "inbox";
    else channel = "other";

    // Natural language opt-out: "stop mirroring me" and variants
    if (matchesStopMirroring(content)) {
      try {
        const db = getDb();
        setOptedOut(db, cfg.humanId, true);
        pendingOptOutConfirmation = true;
        api.logger.info(`mc-voice: natural language opt-out detected for human=${cfg.humanId}`);
      } catch (err) {
        api.logger.warn(`mc-voice: natural language opt-out error: ${err}`);
      }
      return; // Do not ingest the message
    }

    // Short-circuit: skip ingest for opted-out users
    try {
      const db = getDb();
      if (isOptedOut(db, cfg.humanId)) return;
    } catch (err) {
      api.logger.warn(`mc-voice: opt-out check error: ${err}`);
    }

    callIngest(cfg, api.logger, channel, content);
  });

  // ── Disclosure + opt-out confirmation injection ───────────────────────────
  // Before the agent builds its prompt, check if a disclosure or opt-out
  // confirmation is pending. If so, inject context telling the agent what to say.
  api.on("before_prompt_build", (_event, _ctx) => {
    try {
      // Opt-out confirmation takes priority over disclosure
      if (pendingOptOutConfirmation) {
        pendingOptOutConfirmation = false;
        api.logger.info("mc-voice: injecting opt-out confirmation into context");
        return {
          prependContext:
            `[voice-opt-out] The user just asked to stop voice mirroring using natural language. ` +
            `Voice learning has been disabled. At the start of this response, send the following ` +
            `confirmation verbatim before any other content:\n\n` +
            `"Got it — mirroring off. I'll stop learning your style and my writing will drift back to default from here."\n\n` +
            `After sending it, continue with the human's message normally.`,
        };
      }

      const db = getDb();
      if (!needsDisclosure(db, cfg.humanId)) return;
      markDisclosed(db, cfg.humanId);
      api.logger.info("mc-voice: injecting first-time disclosure into context");
      return {
        prependContext:
          `[voice-transparency] At the start of this response, send the following disclosure ` +
          `message verbatim before any other content:\n\n"${DISCLOSURE_TEXT}"\n\n` +
          `After sending it, continue with the human's message normally.`,
      };
    } catch (err) {
      api.logger.warn(`mc-voice: prompt build hook error: ${err}`);
    }
  });

  // ── /voice-off ────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "voice-off",
    description: "Disable voice learning — stop capturing your messages for style mirroring.",
    acceptsArgs: false,
    requireAuth: true,
    handler: (_ctx) => {
      try {
        const db = getDb();
        setOptedOut(db, cfg.humanId, true);
        api.logger.info(`mc-voice: opted out human=${cfg.humanId}`);
        return {
          text: "Got it — mirroring off. I'll stop learning your style and my writing will drift back to default from here.",
        };
      } catch (err) {
        api.logger.error(`mc-voice: voice-off error: ${err}`);
        return { text: "Something went wrong trying to turn off voice learning. Try again." };
      }
    },
  });

  // ── /voice-on ─────────────────────────────────────────────────────────────
  api.registerCommand({
    name: "voice-on",
    description: "Re-enable voice learning — resume capturing your messages for style mirroring.",
    acceptsArgs: false,
    requireAuth: true,
    handler: (_ctx) => {
      try {
        const db = getDb();
        setOptedOut(db, cfg.humanId, false);
        api.logger.info(`mc-voice: opted in human=${cfg.humanId}`);
        return {
          text: "Voice learning back on. I'll start picking up your style again from new messages.",
        };
      } catch (err) {
        api.logger.error(`mc-voice: voice-on error: ${err}`);
        return { text: "Something went wrong trying to turn on voice learning. Try again." };
      }
    },
  });

  // ── /voice-purge ──────────────────────────────────────────────────────────
  api.registerCommand({
    name: "voice-purge",
    description: "Delete all stored messages and reset your voice profile.",
    acceptsArgs: false,
    requireAuth: true,
    handler: (_ctx) => {
      try {
        const db = getDb();
        const deleted = purgeVoiceData(db, cfg.humanId);
        api.logger.info(`mc-voice: purged ${deleted} messages for human=${cfg.humanId}`);
        return {
          text: `Done — deleted ${deleted} stored message${deleted === 1 ? "" : "s"} and reset your voice profile. Nothing retained.`,
        };
      } catch (err) {
        api.logger.error(`mc-voice: voice-purge error: ${err}`);
        return { text: "Something went wrong during purge. Try again." };
      }
    },
  });
}
