#!/usr/bin/env node
/**
 * agent-runner/runner.mjs — Standalone board agent runner daemon.
 *
 * Managed by LaunchAgent: com.miniclaw.board-agent-runner
 *
 * Polls agent_queue in board.db for pending work, spawns claude fully detached
 * (independent of the Next.js web server), writes agent_runs on completion,
 * and releases cards.
 *
 * Usage: node ~/.openclaw/miniclaw/plugins/mc-board/agent-runner/runner.mjs
 */

import Database from "better-sqlite3";
import { spawn, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// ---- Config ----

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
const DB_PATH   = process.env.BOARD_DB_PATH ?? path.join(STATE_DIR, "miniclaw", "USER", "brain", "board.db");
const CLAUDE_BIN    = process.env.CLAUDE_BIN ?? "claude";
const OPENCLAW_BIN  = process.env.OPENCLAW_BIN ?? "openclaw";
const POLL_MS       = parseInt(process.env.AGENT_RUNNER_POLL_MS ?? "5000", 10);
const TICK_MS       = parseInt(process.env.AGENT_RUNNER_TICK_MS ?? "60000", 10);
const BOARD_PORT    = process.env.BOARD_PORT ?? "4220";
const JOBS_FILE     = process.env.BOARD_CRON_JOBS ?? path.join(STATE_DIR, "miniclaw", "USER", "brain", "board-cron.json");
const COLUMNS_FILE  = process.env.BOARD_COLUMNS_FILE ?? path.join(STATE_DIR, "miniclaw", "USER", "brain", "board-columns.json");

// Read MAX_CONCURRENT from board-columns.json — the same file the web UI writes to.
// Falls back to AGENT_RUNNER_MAX_CONCURRENT env var, then 3.

/** Returns per-column max concurrent: { backlog: N, 'in-progress': N, 'in-review': N } */
function getMaxConcurrentPerColumn() {
  const fallback = parseInt(process.env.AGENT_RUNNER_MAX_CONCURRENT ?? "3", 10);
  const result = { backlog: fallback, "in-progress": fallback, "in-review": fallback };
  try {
    const cols = JSON.parse(fs.readFileSync(COLUMNS_FILE, "utf8"));
    for (const col of Object.keys(result)) {
      if (cols[col] && typeof cols[col].maxConcurrency === "number") {
        result[col] = cols[col].maxConcurrency;
      }
    }
  } catch (err) {
    log(`warn: board-columns.json parse error, using defaults: ${err.message}`);
  }
  return result;
}

// Full-agent columns run claude directly. Other columns delegate to openclaw triage CLI.
const FULL_AGENT_COLUMNS = new Set(["backlog", "in-progress", "in-review"]);

// Sync OAuth token from Claude Code Keychain on startup
const oauthSyncBin = path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "mc-oauth-sync");
if (fs.existsSync(oauthSyncBin)) {
  try { execFileSync(oauthSyncBin, [], { timeout: 10_000, stdio: "pipe" }); } catch {}
}

// ---- Logging ----

const runnerLog = path.join(STATE_DIR, "logs", "agent-runner.log");
fs.mkdirSync(path.dirname(runnerLog), { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  fs.appendFileSync(runnerLog, line);
}

// ---- DB helpers ----

function getDb() {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  ensureSchema(db);
  return db;
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_queue (
      id          TEXT PRIMARY KEY,
      card_id     TEXT NOT NULL,
      col         TEXT NOT NULL,
      prompt      TEXT NOT NULL,
      worker      TEXT NOT NULL DEFAULT 'board-worker-in-progress',
      status      TEXT NOT NULL DEFAULT 'pending',
      created_at  TEXT NOT NULL,
      started_at  TEXT,
      ended_at    TEXT,
      pid         INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_agent_queue_status ON agent_queue(status);
    CREATE INDEX IF NOT EXISTS idx_agent_queue_card   ON agent_queue(card_id);

    CREATE TABLE IF NOT EXISTS agent_runs (
      id               TEXT PRIMARY KEY,
      card_id          TEXT NOT NULL,
      column           TEXT NOT NULL,
      started_at       TEXT NOT NULL,
      ended_at         TEXT NOT NULL,
      duration_ms      INTEGER NOT NULL DEFAULT 0,
      exit_code        INTEGER,
      peak_tokens      INTEGER,
      tool_call_count  INTEGER NOT NULL DEFAULT 0,
      tool_calls       TEXT NOT NULL DEFAULT '[]',
      log_file         TEXT NOT NULL DEFAULT '',
      debug_log_file   TEXT NOT NULL DEFAULT '',
      input_tokens     INTEGER DEFAULT 0,
      output_tokens    INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_write_tokens INTEGER DEFAULT 0,
      total_tokens     INTEGER DEFAULT 0,
      cost_usd         REAL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_card ON agent_runs(card_id);

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY
    ) WITHOUT ROWID;
  `);
  // Additive migrations for existing agent_runs tables
  try { db.exec(`ALTER TABLE agent_runs ADD COLUMN input_tokens INTEGER DEFAULT 0`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE agent_runs ADD COLUMN output_tokens INTEGER DEFAULT 0`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE agent_runs ADD COLUMN cache_read_tokens INTEGER DEFAULT 0`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE agent_runs ADD COLUMN cache_write_tokens INTEGER DEFAULT 0`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE agent_runs ADD COLUMN total_tokens INTEGER DEFAULT 0`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE agent_runs ADD COLUMN cost_usd REAL DEFAULT 0`); } catch { /* already exists */ }
}

function getCard(db, cardId) {
  try {
    return db.prepare("SELECT * FROM cards WHERE id = ?").get(cardId);
  } catch { return null; }
}

function getProject(db, projectId) {
  if (!projectId) return null;
  try {
    return db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
  } catch { return null; }
}

function claimPending(db) {
  const limits = getMaxConcurrentPerColumn();
  const claimed = [];

  for (const [col, max] of Object.entries(limits)) {
    const slots = Math.max(0, max - runningCountForCol(col));
    if (slots === 0) continue;

    const rows = db.prepare(
      `SELECT q.* FROM agent_queue q
       LEFT JOIN cards c ON c.id = q.card_id
       WHERE q.status = 'pending'
         AND q.col = ?
         AND (c.tags IS NULL OR (c.tags NOT LIKE '%"hold"%' AND c.tags NOT LIKE '%"blocked"%'))
       ORDER BY
         CASE WHEN c.tags LIKE '%"focus"%' THEN 0 ELSE 1 END ASC,
         CASE c.priority
           WHEN 'critical' THEN 0
           WHEN 'high'     THEN 1
           WHEN 'medium'   THEN 2
           WHEN 'low'      THEN 3
           ELSE 4
         END ASC,
         q.created_at ASC
       LIMIT ?`,
    ).all(col, slots);

    for (const row of rows) {
      const changed = db.prepare(
        `UPDATE agent_queue SET status = 'running', started_at = ? WHERE id = ? AND status = 'pending'`,
      ).run(new Date().toISOString(), row.id).changes;
      if (changed > 0) claimed.push(row);
    }
  }
  return claimed;
}

function markDone(db, id, exitCode, pid) {
  db.prepare(
    `UPDATE agent_queue SET status = 'done', ended_at = ?, pid = ? WHERE id = ?`,
  ).run(new Date().toISOString(), pid, id);
}

function markFailed(db, id) {
  db.prepare(
    `UPDATE agent_queue SET status = 'failed', ended_at = ? WHERE id = ?`,
  ).run(new Date().toISOString(), id);
}

const STALE_MS = 30 * 60 * 1000;

function resetStaleRunning() {
  const db = getDb();
  const rows = db.prepare(`SELECT id, pid, card_id, started_at FROM agent_queue WHERE status = 'running'`).all();
  let reset = 0;
  let failed = 0;
  const now = Date.now();
  for (const row of rows) {
    let alive = false;
    if (row.pid) {
      try { process.kill(row.pid, 0); alive = true; } catch { /* gone */ }
    }
    if (alive) continue;
    const age = row.started_at ? now - new Date(row.started_at).getTime() : Infinity;
    if (!row.pid || age > STALE_MS) {
      db.prepare(`UPDATE agent_queue SET status = 'failed', ended_at = ? WHERE id = ?`).run(new Date().toISOString(), row.id);
      failed++;
      log(`resetStaleRunning: failed stale ${row.id} card=${row.card_id} age=${Math.round(age / 1000)}s`);
      try { runBoard("release", row.card_id, "--worker", "board-worker-in-progress"); } catch (err) { log(`release failed for stale ${row.card_id}: ${err.message}`); }
    } else {
      db.prepare(`UPDATE agent_queue SET status = 'pending', started_at = NULL WHERE id = ?`).run(row.id);
      reset++;
    }
  }
  db.close();
  if (rows.length > 0) log(`resetStaleRunning: ${rows.length} rows — ${reset} reset, ${failed} failed, ${rows.length - reset - failed} alive`);
}

// ---- openclaw CLI helpers ----

function runBoard(...args) {
  return execFileSync(OPENCLAW_BIN, ["mc-board", ...args], {
    encoding: "utf-8",
    timeout: 30_000,
    env: { ...process.env, OPENCLAW_STATE_DIR: STATE_DIR },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// ---- Agent spawning ----

const running = new Map(); // queueId -> { proc, cardId, col }

function runningCountForCol(col) {
  let n = 0;
  for (const v of running.values()) { if (v.col === col) n++; }
  return n;
}

/** Read shared agent context template, with embedded fallback */
function readAgentBaseContext() {
  const templatePath = path.join(STATE_DIR, "miniclaw", "SYSTEM", "context", "agent-base.md");
  try {
    return fs.readFileSync(templatePath, "utf8").trim();
  } catch {
    return [
      "## Available CLI tools (use via Bash)",
      "- `openclaw mc-board` — board management (create, update, move, show, board, pickup, release, active, context)",
      "- `openclaw mc-rolodex` — contact management (add, search, list, update, remove)",
      "- `openclaw mc-kb` — knowledge base (search, add, update, get)",
      "- `openclaw mc-email` — email (send, inbox, triage)",
      "- `openclaw mc-vault` — secrets (get, set, list)",
      "- `openclaw mc-backup` — backups (now, list, restore)",
      "- `openclaw mc-calendar` — calendar management",
      "- `openclaw mc-designer` — generate images, palettes, textures, mockups via Gemini",
      "- `openclaw mc-memory` — search agent knowledge base and episodic memory",
      "- `openclaw mc-memo` — short-term working memory for sessions",
      "- `openclaw mc-research` — web research with source citations",
      "- `openclaw mc-github` — GitHub integration (issues, PRs, repos)",
      "- `openclaw mc-social` — social media management",
      "- `openclaw mc-blog` — blog post management",
      "- `openclaw mc-substack` — Substack publishing",
      "- `openclaw mc-voice` — voice/audio transcription",
      "- `openclaw mc-youtube` — YouTube video management",
      "- `openclaw mc-booking` — appointment scheduling",
      "- `openclaw mc-tailscale` — network/VPN management",
      "- `openclaw mc-trust` — agent trust and permissions",
      "- `openclaw mc-docs` — documentation search",
      "",
      "## Card-Only Workflow Rule",
      "ALL tasks go to cards. Inline work is ONLY for answering direct questions.",
      "- If someone asks you to DO something (build, fix, create, update, research), create a card: `openclaw mc-board create --title \"...\" --priority medium`",
      "- If someone asks you a QUESTION, answer it directly in chat.",
      "- NEVER execute multi-step work inline. Always create a card and let the board worker handle it.",
      "- This rule applies to ALL agent sessions: Telegram, DMs, channels, and card workers.",
      "",
      "## Non-Interactive Automation",
      "You are a non-interactive automation agent. Execute your instructions immediately using tool calls.",
      "NEVER ask questions. NEVER generate conversational responses. NEVER summarize the board state.",
      "If you cannot proceed, exit silently. Do not explain why.",
      "Update the card via: openclaw mc-board update / move / release",
    ].join("\n");
  }
}

function cardToMarkdown(card) {
  const lines = [];
  function unescape(s) { return s ? s.replace(/\\n/g, "\n") : ""; }
  lines.push(`# [${card.id}] ${card.title}`);
  lines.push("");
  if (card.priority) lines.push(`**priority:** ${card.priority}`);
  try { const tags = JSON.parse(card.tags || "[]"); if (tags.length) lines.push(`**tags:** ${tags.join(", ")}`); } catch {}
  if (card.project_id) lines.push(`**project:** ${card.project_id}`);
  if (card.problem_description) { lines.push(""); lines.push("## Problem"); lines.push(unescape(card.problem_description)); }
  if (card.research) { lines.push(""); lines.push("## Research"); lines.push(unescape(card.research)); } else { lines.push(""); lines.push("## Research"); lines.push("*(needs research — queued for agent pass)*"); }
  if (card.implementation_plan) { lines.push(""); lines.push("## Implementation Plan"); lines.push(unescape(card.implementation_plan)); }
  if (card.acceptance_criteria) { lines.push(""); lines.push("## Acceptance Criteria"); lines.push(unescape(card.acceptance_criteria)); }
  if (card.notes) { lines.push(""); lines.push("## Notes"); lines.push(unescape(card.notes)); }
  lines.push(""); lines.push("## Work Log"); lines.push("*(see board for work log)*");
  return lines.join("\n");
}

function spawnFullAgent(row, card, project) {
  const ts0 = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const runDir = path.join(STATE_DIR, "tmp", `${ts0}-${row.card_id}`);
  fs.mkdirSync(runDir, { recursive: true });

  const logDir = path.join(STATE_DIR, "logs", `${row.col}-process`);
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `${ts0}-${row.card_id}.log`);
  const debugFile = path.join(logDir, `${ts0}-${row.card_id}.debug.log`);
  const logStream = fs.createWriteStream(logFile, { flags: "a" });
  const t0 = Date.now();
  const ts = () => `+${((Date.now() - t0) / 1000).toFixed(2)}s`;
  let fileAtLineStart = true;

  function writeFile(msg) {
    if (!msg) return;
    logStream.write(msg);
    if (msg.length > 0) fileAtLineStart = msg[msg.length - 1] === "\n";
  }
  function logDbg(msg) {
    const pfx = fileAtLineStart ? "  [dbg] " : "\n  [dbg] ";
    writeFile(`${pfx}${msg}\n`);
  }

  const cardMd = card ? cardToMarkdown(card) : `Card ${row.card_id} (details unavailable)`;
  const systemPrompt = row.prompt.replace("{{CARD}}", "").replace(/\{\{CARD_ID\}\}/g, row.card_id).trim();

  // Issue #7: Reject empty/invalid prompt before spawning claude
  if (!systemPrompt || systemPrompt.length < 20) {
    log(`ERROR: empty or invalid prompt for ${row.card_id} (length=${systemPrompt.length}), marking failed`);
    const fdb = getDb();
    markFailed(fdb, row.id);
    fdb.close();
    return;
  }

  const userPrompt = `Here is the card to work on:\n\n${cardMd}\n\nCard ID: ${row.card_id}\n\nExecute the instructions in your system prompt now. Do not ask questions. Do not summarize. Use tools immediately.`;
  const agentCwd = (project?.work_dir && fs.existsSync(project.work_dir)) ? project.work_dir : runDir;

  const agentContext = readAgentBaseContext();
  fs.writeFileSync(path.join(runDir, "CLAUDE.md"), [
    `# Work Session: ${card?.title ?? row.card_id}`,
    `Card: ${row.card_id} (${row.col})`,
    `State dir: ${STATE_DIR}`,
    agentCwd !== runDir ? `Working directory: ${agentCwd}` : "",
    project ? `Project: ${project.name}${project.description ? ` — ${project.description}` : ""}` : "",
    project?.github_repo ? `GitHub repo: ${project.github_repo}` : "",
    agentContext,
    `Log progress to: ${path.join(STATE_DIR, "logs", "cards", row.card_id + ".log")}`,
    `# currentDate`,
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
  ].filter(Boolean).join("\n"));

  // Pickup the card now — only mark active when runner actually starts the agent.
  // Issue #2: If pickup fails, do NOT spawn agent — mark queue entry failed.
  try {
    runBoard("pickup", row.card_id, "--worker", row.worker);
  } catch (err) {
    log(`ERROR: pickup failed for ${row.card_id}: ${err.message} — aborting agent spawn`);
    const fdb = getDb();
    markFailed(fdb, row.id);
    fdb.close();
    logStream.end();
    return;
  }

  writeFile(`card:  ${row.card_id} — ${card?.title ?? "(unknown)"}\n`);
  writeFile(`log:   ${logFile}\n`);
  writeFile(`[${ts()}] spawning claude (full agent) cwd=${agentCwd}\n`);

  const { CLAUDECODE: _cc, ...env } = process.env;
  if (!env.TMPDIR) env.TMPDIR = os.tmpdir();
  // Ensure SYSTEM/bin and USER/bin are on PATH so agents can find mc-smoke, mc-vault, etc.
  const systemBin = path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin");
  const userBin = path.join(STATE_DIR, "USER", "bin");
  if (env.PATH && !env.PATH.includes(systemBin)) {
    env.PATH = `${systemBin}:${userBin}:${env.PATH}`;
  }

  fs.writeFileSync(debugFile, "");

  // Pre-open file descriptors so child can write after runner restarts.
  // Using FDs (not pipes) means no SIGPIPE when the runner's read-end closes.
  const rawJsonlFile = path.join(logDir, `${ts0}-${row.card_id}.raw.jsonl`);
  const stderrFile   = path.join(logDir, `${ts0}-${row.card_id}.stderr.log`);
  const stdoutFd = fs.openSync(rawJsonlFile, "a");
  const stderrFd = fs.openSync(stderrFile, "a");

  const proc = spawn("stdbuf", [
    "-oL",
    CLAUDE_BIN,
    "--system-prompt", systemPrompt,
    "-p", userPrompt,
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--debug-file", debugFile,
    "--dangerously-skip-permissions",
  ], { env, cwd: agentCwd, stdio: ["ignore", stdoutFd, stderrFd], detached: true });

  // Parent closes its copies of the FDs — child holds its own references.
  fs.closeSync(stdoutFd);
  fs.closeSync(stderrFd);
  // Detach from runner event loop — child survives runner restart.
  proc.unref();

  writeFile(`[${ts()}] pid ${proc.pid}\n`);
  log(`spawned full agent for ${row.card_id} pid=${proc.pid} log=${logFile}`);

  // Store PID immediately so resetStaleRunning can check liveness on restart.
  try {
    const pidDb = getDb();
    pidDb.prepare(`UPDATE agent_queue SET pid = ? WHERE id = ?`).run(proc.pid, row.id);
    pidDb.close();
  } catch { /* non-fatal */ }

  let buf = "";
  let currentTool = "";
  let currentToolInput = "";
  const toolCallsAccum = [];
  const usageAccum = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, costUsd: 0 };
  const NOISE = /ENOENT|Broken symlink|detectFileEncoding|managed-settings|settings\.local|\[DEBUG\]/;

  // Tail debug file (unref so it doesn't block runner exit)
  const tail = spawn("tail", ["-f", debugFile]);
  tail.unref();
  tail.stdout.on("data", (chunk) => {
    for (const line of chunk.toString().split("\n").filter(l => l.trim())) {
      if (NOISE.test(line)) continue;
      try {
        const entry = JSON.parse(line);
        const msg = entry.message ?? entry.msg ?? line;
        if (!NOISE.test(msg)) logDbg(msg);
      } catch { logDbg(line); }
    }
  });

  // Tail the raw jsonl file for real-time JSON parsing (replaces proc.stdout pipe)
  const tailOut = spawn("tail", ["-f", rawJsonlFile]);
  tailOut.unref();
  tailOut.stdout.on("data", (chunk) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        const ev = msg.type === "stream_event" ? (msg.event ?? {}) : msg;
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") writeFile(ev.delta.text);
        if (ev.type === "content_block_start" && ev.content_block?.type === "tool_use") { currentTool = ev.content_block.name ?? "tool"; currentToolInput = ""; }
        if (ev.type === "content_block_delta" && ev.delta?.type === "input_json_delta") currentToolInput += ev.delta.partial_json ?? "";
        if (ev.type === "content_block_stop" && currentTool) {
          let detail = "";
          try { const input = JSON.parse(currentToolInput); detail = String(input.command ?? input.path ?? input.file_path ?? input.query ?? input.id ?? "").split("\n")[0].slice(0, 120); } catch {}
          toolCallsAccum.push({ name: currentTool, detail });
          writeFile(`  [→ ${currentTool}${detail ? ` ${detail}` : ""}]\n`);
          currentTool = ""; currentToolInput = "";
        }
        if (msg.type === "result" && typeof msg.result === "string") writeFile(msg.result);
        // Grab final usage from the result event (most accurate)
        if (msg.type === "result" && msg.usage) {
          usageAccum.input = msg.usage.input_tokens ?? msg.usage.inputTokens ?? 0;
          usageAccum.output = msg.usage.output_tokens ?? msg.usage.outputTokens ?? 0;
          usageAccum.cacheRead = msg.usage.cache_read_input_tokens ?? msg.usage.cacheReadInputTokens ?? 0;
          usageAccum.cacheWrite = msg.usage.cache_creation_input_tokens ?? msg.usage.cacheCreationInputTokens ?? 0;
          usageAccum.totalTokens = usageAccum.input + usageAccum.output + usageAccum.cacheRead + usageAccum.cacheWrite;
          usageAccum.costUsd = msg.total_cost_usd ?? 0;
        }
      } catch {}
    }
  });

  // Note: proc.on('close') only fires if this runner process is still alive when claude exits.
  // If the runner restarts first, the audit row is not written — acceptable tradeoff.
  proc.on("close", (code) => {
    running.delete(row.id);
    setTimeout(() => { tail.kill(); tailOut.kill(); }, 300);
    writeFile(`\n[${ts()}] done (exit ${code})\n`);
    log(`agent done for ${row.card_id} exit=${code}`);

    // Clean up the ephemeral run dir (CLAUDE.md + any scratch files the agent wrote there).
    // Logs are kept separately in logDir — only the tmp runDir is removed.
    try { fs.rmSync(runDir, { recursive: true, force: true }); } catch { /* non-fatal */ }

    const endedAt = new Date().toISOString();
    const durationMs = Date.now() - t0;
    let peakTokens = null;
    try {
      const debugContent = fs.readFileSync(debugFile, "utf8");
      const matches = [...debugContent.matchAll(/autocompact: tokens=(\d+)/g)];
      if (matches.length > 0) peakTokens = Math.max(...matches.map(m => parseInt(m[1], 10)));
    } catch {}

    try {
      const wdb = getDb();
      wdb.prepare(
        `INSERT OR REPLACE INTO agent_runs
          (id, card_id, column, started_at, ended_at, duration_ms, exit_code, peak_tokens,
           tool_call_count, tool_calls, log_file, debug_log_file,
           input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens, cost_usd)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        `${ts0}-${row.card_id}`, row.card_id, row.col,
        new Date(t0).toISOString(), endedAt, durationMs,
        code, peakTokens,
        toolCallsAccum.length, JSON.stringify(toolCallsAccum),
        logFile, debugFile,
        usageAccum.input, usageAccum.output, usageAccum.cacheRead, usageAccum.cacheWrite,
        usageAccum.totalTokens, usageAccum.costUsd,
      );
      markDone(wdb, row.id, code, proc.pid);
      wdb.close();
    } catch (err) {
      log(`agent_runs write failed for ${row.card_id}: ${err.message}`);
    }

    try { runBoard("release", row.card_id, "--worker", row.worker); } catch (relErr) { log(`ERROR: release failed for ${row.card_id} after agent close: ${relErr.message}`); }
    logStream.end();
  });

  proc.on("error", (err) => {
    running.delete(row.id);
    tail.kill();
    tailOut.kill();
    log(`spawn error for ${row.card_id}: ${err.message}`);
    const db = getDb();
    markFailed(db, row.id);
    db.close();
    try { runBoard("release", row.card_id, "--worker", row.worker); } catch (relErr) { log(`ERROR: release failed for ${row.card_id} after spawn error: ${relErr.message}`); }
    logStream.end();
  });

  running.set(row.id, { proc, cardId: row.card_id, col: row.col });
}

function spawnTriage(row) {
  const ts0 = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const runDir = path.join(STATE_DIR, "tmp", `${ts0}-${row.card_id}`);
  fs.mkdirSync(runDir, { recursive: true });
  const logDir = path.join(STATE_DIR, "logs", "backlog-triage");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `${ts0}-${row.card_id}.log`);

  const { CLAUDECODE: _cc, ...env } = process.env;

  try {
    runBoard("pickup", row.card_id, "--worker", row.worker);
  } catch (err) {
    log(`ERROR: triage pickup failed for ${row.card_id}: ${err.message} — aborting triage spawn`);
    const fdb = getDb();
    markFailed(fdb, row.id);
    fdb.close();
    return;
  }

  const proc = spawn(OPENCLAW_BIN, [
    "mc-board", "triage", row.card_id,
    "--worker", row.worker,
    "--log", logFile,
  ], { env, cwd: runDir, stdio: "ignore", detached: true });
  proc.unref();

  log(`spawned triage for ${row.card_id} pid=${proc.pid}`);

  proc.on("close", (code) => {
    running.delete(row.id);
    log(`triage done for ${row.card_id} exit=${code}`);
    const db = getDb();
    markDone(db, row.id, code, proc.pid);
    db.close();
  });

  proc.on("error", (err) => {
    running.delete(row.id);
    log(`triage spawn error for ${row.card_id}: ${err.message}`);
    const db = getDb();
    markFailed(db, row.id);
    db.close();
  });

  running.set(row.id, { proc, cardId: row.card_id, col: row.col });
}

// ---- Poll loop ----

async function poll() {
  // Clean up stale running entries every poll, not just at startup
  resetStaleRunning();

  // Per-column check: skip poll only if every column is at its limit
  const limits = getMaxConcurrentPerColumn();
  const allFull = Object.entries(limits).every(([col, max]) => runningCountForCol(col) >= max);
  if (allFull) return;

  let db;
  try {
    db = getDb();
    const rows = claimPending(db);
    const card_ids = rows.map(r => r.card_id);
    if (rows.length > 0) log(`claimed ${rows.length} pending row(s): ${card_ids.join(", ")}`);

    // Pre-fetch all card/project data while DB is open, then spawn all at once
    const work = rows.map(row => ({
      row,
      card: FULL_AGENT_COLUMNS.has(row.col) ? getCard(db, row.card_id) : null,
      project: null,
    }));
    for (const w of work) {
      if (w.card?.project_id) w.project = getProject(db, w.card.project_id);
    }
    db.close(); db = null;

    for (const { row, card, project } of work) {
      if (FULL_AGENT_COLUMNS.has(row.col)) {
        spawnFullAgent(row, card, project);
      } else {
        spawnTriage(row);
      }
    }
  } catch (err) {
    log(`poll error: ${err.message}`);
  } finally {
    if (db) try { db.close(); } catch {}
  }
}

// ---- Startup ----

// Issue #5: Validate DB path exists at startup — do not silently create empty DB
if (!fs.existsSync(DB_PATH)) {
  const msg = `FATAL: DB_PATH does not exist: ${DB_PATH} — refusing to start with empty database`;
  process.stderr.write(msg + "\n");
  try { fs.appendFileSync(runnerLog, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
  process.exit(1);
}

const startLimits = getMaxConcurrentPerColumn();
log(`agent-runner starting — db=${DB_PATH} poll=${POLL_MS}ms limits=${JSON.stringify(startLimits)} (per-column, dynamic)`);
resetStaleRunning();

setInterval(poll, POLL_MS);
poll(); // immediate first poll

// ---- Tick: periodically call /api/cron/tick to enqueue eligible cards ----

let tickFailCount = 0;

async function tick() {
  try {
    const res = await fetch(`http://127.0.0.1:${BOARD_PORT}/api/cron/tick`);
    if (!res.ok) { log(`tick: HTTP ${res.status}`); return; }
    const data = await res.json();
    tickFailCount = 0; // reset on success
    if (data.fired?.length > 0) log(`tick: enqueued ${data.fired.join(", ")}`);
    if (data.released?.length > 0) log(`tick: released stale ${data.released.join(", ")}`);
    if (data.reactivelyFired?.length > 0) log(`tick: reactive ${data.reactivelyFired.join(", ")}`);
  } catch (err) {
    tickFailCount++;
    if (tickFailCount >= 3) {
      log(`ERROR: tick fetch failed ${tickFailCount} consecutive times — board web server may be down: ${err.message}`);
    } else {
      log(`tick: fetch failed (attempt ${tickFailCount}): ${err.message}`);
    }
  }
}

setInterval(tick, TICK_MS);
tick(); // immediate first tick

// Graceful shutdown
process.on("SIGTERM", () => { log("SIGTERM — shutting down"); process.exit(0); });
process.on("SIGINT",  () => { log("SIGINT — shutting down");  process.exit(0); });
