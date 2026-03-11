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
 * Usage: node ~/am/miniclaw/plugins/mc-board/agent-runner/runner.mjs
 */

import Database from "better-sqlite3";
import { spawn, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// ---- Config ----

const STATE_DIR = process.env.MINICLAW_STATE_DIR ?? process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".miniclaw");
const DB_PATH   = process.env.BOARD_DB_PATH ?? path.join(STATE_DIR, "user/augmentedmike_bot/brain/board.db");
const CLAUDE_BIN    = process.env.CLAUDE_BIN ?? "claude";
const OPENCLAW_BIN  = process.env.OPENCLAW_BIN ?? "openclaw";
const POLL_MS       = parseInt(process.env.AGENT_RUNNER_POLL_MS ?? "5000", 10);
const MAX_CONCURRENT = parseInt(process.env.AGENT_RUNNER_MAX_CONCURRENT ?? "3", 10);

// Full-agent columns run claude directly. Other columns delegate to openclaw triage CLI.
const FULL_AGENT_COLUMNS = new Set(["backlog", "in-progress", "in-review"]);

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
      debug_log_file   TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_agent_runs_card ON agent_runs(card_id);

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY
    ) WITHOUT ROWID;
  `);
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
  const rows = db.prepare(
    `SELECT * FROM agent_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`,
  ).all(MAX_CONCURRENT - running.size);

  for (const row of rows) {
    const changed = db.prepare(
      `UPDATE agent_queue SET status = 'running', started_at = ? WHERE id = ? AND status = 'pending'`,
    ).run(new Date().toISOString(), row.id).changes;
    if (changed === 0) rows.splice(rows.indexOf(row), 1); // race: someone else claimed it
  }
  return rows;
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

function resetStaleRunning() {
  const db = getDb();
  const n = db.prepare(`UPDATE agent_queue SET status = 'pending', started_at = NULL WHERE status = 'running'`).run().changes;
  db.close();
  if (n > 0) log(`reset ${n} stale 'running' rows to 'pending'`);
}

// ---- openclaw CLI helpers ----

function runBoard(...args) {
  try {
    execFileSync(OPENCLAW_BIN, ["mc-board", ...args], {
      encoding: "utf-8",
      timeout: 30_000,
      env: { ...process.env, OPENCLAW_STATE_DIR: process.env.MINICLAW_STATE_DIR ?? process.env.OPENCLAW_STATE_DIR ?? "" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    log(`board cmd failed [${args.join(" ")}]: ${err.message}`);
  }
}

// ---- Agent spawning ----

const running = new Map(); // queueId -> { proc, cardId }

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
  const fullPrompt = row.prompt.replace("{{CARD}}", cardMd).replace(/\{\{CARD_ID\}\}/g, row.card_id);
  const agentCwd = (project?.work_dir && fs.existsSync(project.work_dir)) ? project.work_dir : runDir;

  fs.writeFileSync(path.join(runDir, "CLAUDE.md"), [
    `# Work Session: ${card?.title ?? row.card_id}`,
    "",
    `Card: ${row.card_id} (${row.col})`,
    `State dir: ${STATE_DIR}`,
    agentCwd !== runDir ? `Working directory: ${agentCwd}` : "",
    project ? `Project: ${project.name}${project.description ? ` — ${project.description}` : ""}` : "",
    project?.github_repo ? `GitHub repo: ${project.github_repo}` : "",
    "",
    "## Ecosystem",
    "You are building MiniClaw — a plugin ecosystem for an Agentic OS built on top of OpenClaw.",
    "OpenClaw is the underlying agent runtime. Fork repo: ~/am/projects/openclaw/",
    "All MiniClaw plugins live in ~/am/miniclaw/plugins/ — each is an openclaw plugin package.",
    "New features must be implemented as MiniClaw plugins in ~/am/miniclaw/plugins/, not standalone scripts.",
    "Plugin repo (public, backport target): ~/am/projects/miniclaw-os/",
    "Live state dir: ~/am/ (MINICLAW_STATE_DIR=$HOME/am, with OPENCLAW_STATE_DIR fallback)",
    "",
    "You are a full autonomous agent. Use tools freely to do the actual work.",
    "Update the card via: openclaw mc-board update / move / release",
    `Log progress to: ${path.join(STATE_DIR, "logs", "cards", row.card_id + ".log")}`,
  ].filter(Boolean).join("\n"));

  writeFile(`card:  ${row.card_id} — ${card?.title ?? "(unknown)"}\n`);
  writeFile(`log:   ${logFile}\n`);
  writeFile(`[${ts()}] spawning claude (full agent) cwd=${agentCwd}\n`);

  const { CLAUDECODE: _cc, ...env } = process.env;
  if (!env.TMPDIR) env.TMPDIR = os.tmpdir();

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
    "-p", fullPrompt,
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

  let buf = "";
  let currentTool = "";
  let currentToolInput = "";
  const toolCallsAccum = [];
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
          (id, card_id, column, started_at, ended_at, duration_ms, exit_code, peak_tokens, tool_call_count, tool_calls, log_file, debug_log_file)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        `${ts0}-${row.card_id}`, row.card_id, row.col,
        new Date(t0).toISOString(), endedAt, durationMs,
        code, peakTokens,
        toolCallsAccum.length, JSON.stringify(toolCallsAccum),
        logFile, debugFile,
      );
      markDone(wdb, row.id, code, proc.pid);
      wdb.close();
    } catch (err) {
      log(`agent_runs write failed for ${row.card_id}: ${err.message}`);
    }

    try { runBoard("release", row.card_id, "--worker", row.worker); } catch {}
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
    try { runBoard("release", row.card_id, "--worker", row.worker); } catch {}
    logStream.end();
  });

  running.set(row.id, { proc, cardId: row.card_id });
}

function spawnTriage(row) {
  const ts0 = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const runDir = path.join(STATE_DIR, "tmp", `${ts0}-${row.card_id}`);
  fs.mkdirSync(runDir, { recursive: true });
  const logDir = path.join(STATE_DIR, "logs", "backlog-triage");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `${ts0}-${row.card_id}.log`);

  const { CLAUDECODE: _cc, ...env } = process.env;

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

  running.set(row.id, { proc, cardId: row.card_id });
}

// ---- Poll loop ----

async function poll() {
  if (running.size >= MAX_CONCURRENT) return;

  let db;
  try {
    db = getDb();
    const rows = claimPending(db);
    const card_ids = rows.map(r => r.card_id);
    if (rows.length > 0) log(`claimed ${rows.length} pending row(s): ${card_ids.join(", ")}`);

    for (const row of rows) {
      if (FULL_AGENT_COLUMNS.has(row.col)) {
        const card = getCard(db, row.card_id);
        const project = card?.project_id ? getProject(db, card.project_id) : null;
        db.close(); db = null;
        spawnFullAgent(row, card, project);
      } else {
        db.close(); db = null;
        spawnTriage(row);
      }
      if (db === null) break; // re-open needed if we loop again
    }
  } catch (err) {
    log(`poll error: ${err.message}`);
  } finally {
    if (db) try { db.close(); } catch {}
  }
}

// ---- Startup ----

log(`agent-runner starting — db=${DB_PATH} poll=${POLL_MS}ms max=${MAX_CONCURRENT}`);
resetStaleRunning();

setInterval(poll, POLL_MS);
poll(); // immediate first poll

// Graceful shutdown
process.on("SIGTERM", () => { log("SIGTERM — shutting down"); process.exit(0); });
process.on("SIGINT",  () => { log("SIGINT — shutting down");  process.exit(0); });
