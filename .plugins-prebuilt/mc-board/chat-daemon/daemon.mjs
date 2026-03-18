#!/usr/bin/env node
/**
 * chat-daemon.mjs — Interactive Claude Code over Unix socket.
 *
 * Uses `script` to allocate a PTY for claude (no node-pty dependency).
 * Web server connects via Unix socket, sends messages, receives streamed text.
 *
 * Protocol (newline-delimited JSON):
 *   Client → Daemon: { "type": "message", "text": "..." }
 *   Client → Daemon: { "type": "clear" }
 *   Daemon → Client: { "type": "delta", "text": "..." }
 *   Daemon → Client: { "type": "done" }
 *   Daemon → Client: { "type": "ready" }
 *   Daemon → Client: { "type": "system", "text": "..." }
 */

import { spawn } from "node:child_process";
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const SOCKET_PATH = process.env.CHAT_SOCKET ?? path.join(STATE_DIR, "chat.sock");

// ---- ANSI stripping ----

function stripAnsi(s) {
  return s
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b[()][0-9A-B]/g, "")
    .replace(/\x1b\[[\?]?[0-9;]*[a-zA-Z]/g, "")
    .replace(/\x1b[>=<]/g, "")
    .replace(/\x1b\[[0-9]*[a-zA-Z]/g, "")
    .replace(/\x04/g, "")  // ^D
    .replace(/\r/g, "");
}

// ---- Claude session ----

let proc = null;
let activeClient = null;
let buf = "";
let idle = null;
let ready = false;
let turning = false;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
}

function sendToClient(msg) {
  if (!activeClient || activeClient.destroyed) return;
  try { activeClient.write(JSON.stringify(msg) + "\n"); } catch {}
}

function spawnClaude() {
  if (proc) return;
  ready = false;
  turning = false;
  buf = "";

  const env = { ...process.env };
  delete env.CLAUDECODE;
  env.TERM = "xterm-256color";
  env.COLUMNS = "120";
  env.LINES = "50";

  // Use `script` to allocate a real PTY
  proc = spawn("script", [
    "-q", "/dev/null",
    CLAUDE_BIN,
    "--dangerously-skip-permissions",
  ], {
    env,
    cwd: os.homedir(),
    stdio: ["pipe", "pipe", "pipe"],
  });

  log(`claude spawned via script, pid=${proc.pid}`);

  proc.stdout.on("data", (chunk) => {
    const raw = chunk.toString();
    const clean = stripAnsi(raw);

    // Detect ready state (prompt character appears)
    if (!ready) {
      // Claude Code shows a prompt like "> " or "❯ " when ready
      if (clean.includes(">") || clean.includes("❯") || clean.includes("Claude Code")) {
        ready = true;
        log("claude ready");
        sendToClient({ type: "ready" });
      }
      return;
    }

    if (!turning) return;

    buf += clean;

    // Reset idle timer — when output stops for 400ms, flush
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => flushOutput(), 400);
  });

  proc.stderr.on("data", (chunk) => {
    const text = chunk.toString().trim();
    if (text && /login|auth|compact|warning|error|limit|quota/i.test(text)) {
      sendToClient({ type: "system", text: stripAnsi(text) });
    }
  });

  proc.on("close", (code) => {
    log(`claude exited code=${code}`);
    sendToClient({ type: "system", text: `Claude Code exited (${code})` });
    sendToClient({ type: "done" });
    proc = null;
    ready = false;
  });

  proc.on("error", (err) => {
    log(`spawn error: ${err.message}`);
    proc = null;
    ready = false;
  });
}

function flushOutput() {
  const text = buf.trim();
  buf = "";
  if (!text) return;

  // Check if prompt reappeared (turn complete)
  const lines = text.split("\n");
  let turnDone = false;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    // Skip box-drawing chrome
    if (/^[╭╰│├┌└─┐┘┤┬┴┼]+$/.test(t)) continue;
    if (/^[>❯]\s*$/.test(t)) {
      turnDone = true;
      continue;
    }

    sendToClient({ type: "delta", text: t + "\n" });
  }

  if (turnDone) {
    turning = false;
    sendToClient({ type: "done" });
  }
}

function sendMessage(text) {
  if (!proc || !ready) {
    sendToClient({ type: "system", text: "Claude Code not ready yet, please wait..." });
    sendToClient({ type: "done" });
    return;
  }

  buf = "";
  turning = true;
  proc.stdin.write(text + "\n");
}

function clearSession() {
  if (proc) {
    proc.stdin.end();
    proc.kill("SIGTERM");
    proc = null;
  }
  ready = false;
  turning = false;
  buf = "";
  sendToClient({ type: "system", text: "Session cleared" });
  sendToClient({ type: "done" });
  setTimeout(() => spawnClaude(), 500);
}

// ---- Unix socket server ----

if (fs.existsSync(SOCKET_PATH)) {
  try { fs.unlinkSync(SOCKET_PATH); } catch {}
}

const server = net.createServer((conn) => {
  activeClient = conn;
  let recvBuf = "";

  // Tell client if claude is ready
  if (ready) sendToClient({ type: "ready" });

  conn.on("data", (chunk) => {
    recvBuf += chunk.toString();
    const lines = recvBuf.split("\n");
    recvBuf = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === "message" && msg.text) sendMessage(msg.text);
        else if (msg.type === "clear") clearSession();
      } catch {}
    }
  });

  conn.on("close", () => { if (activeClient === conn) activeClient = null; });
  conn.on("error", () => { if (activeClient === conn) activeClient = null; });
});

server.listen(SOCKET_PATH, () => {
  fs.chmodSync(SOCKET_PATH, 0o700);
  log(`listening on ${SOCKET_PATH}`);
});

spawnClaude();

process.on("SIGTERM", () => {
  log("SIGTERM");
  if (proc) proc.kill("SIGTERM");
  server.close();
  try { fs.unlinkSync(SOCKET_PATH); } catch {}
  process.exit(0);
});
process.on("SIGINT", () => {
  if (proc) proc.kill("SIGTERM");
  server.close();
  try { fs.unlinkSync(SOCKET_PATH); } catch {}
  process.exit(0);
});
