#!/usr/bin/env node
/**
 * chat-daemon.mjs — Interactive Claude Code session over Unix socket.
 *
 * Spawns `claude` in a PTY (real terminal). Web server connects via Unix socket
 * to send messages and receive streaming responses.
 *
 * Protocol (newline-delimited JSON):
 *   Client → Daemon: { "type": "message", "text": "..." }
 *   Client → Daemon: { "type": "clear" }
 *   Daemon → Client: { "type": "delta", "text": "..." }
 *   Daemon → Client: { "type": "tool", "name": "...", "detail": "..." }
 *   Daemon → Client: { "type": "done" }
 *   Daemon → Client: { "type": "system", "text": "..." }
 */

import * as pty from "node-pty";
import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const SOCKET_PATH = process.env.CHAT_SOCKET ?? path.join(STATE_DIR, "chat.sock");
const SYSTEM_PROMPT = process.env.CHAT_SYSTEM_PROMPT ?? "";

// ---- ANSI stripping ----

function stripAnsi(s) {
  return s.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g,
    ""
  );
}

// ---- PTY session ----

let term = null;
let activeClient = null;
let buf = "";
let idle = null;
let waitingForPrompt = true;

function spawnClaude() {
  if (term) return;

  const env = { ...process.env };
  delete env.CLAUDECODE;
  env.TERM = "dumb";
  env.NO_COLOR = "1";
  env.FORCE_COLOR = "0";
  env.COLUMNS = "120";
  env.LINES = "50";

  const args = ["--dangerously-skip-permissions"];
  if (SYSTEM_PROMPT) args.push("--system-prompt", SYSTEM_PROMPT);

  term = pty.spawn(CLAUDE_BIN, args, {
    name: "dumb",
    cols: 120,
    rows: 50,
    cwd: os.homedir(),
    env,
  });

  console.log(`[chat-daemon] claude spawned pid=${term.pid}`);

  term.onData((data) => {
    const clean = stripAnsi(data);
    if (!clean.trim()) return;

    // If waiting for initial prompt, skip
    if (waitingForPrompt) {
      if (clean.includes(">") || clean.includes("❯")) {
        waitingForPrompt = false;
        console.log("[chat-daemon] claude ready");
      }
      return;
    }

    buf += clean;

    // Reset idle timer — flush when output stops for 300ms
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => flush(), 300);
  });

  term.onExit(({ exitCode }) => {
    console.log(`[chat-daemon] claude exited code=${exitCode}`);
    sendToClient({ type: "system", text: `Claude Code exited (${exitCode})` });
    sendToClient({ type: "done" });
    term = null;
    waitingForPrompt = true;
  });
}

function flush() {
  const text = buf.trim();
  buf = "";
  if (!text) return;

  const lines = text.split("\n");
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    // Skip prompt indicators
    if (/^[>❯]\s*$/.test(t)) {
      // Prompt appeared — turn is done
      sendToClient({ type: "done" });
      continue;
    }
    // Tool use markers
    if (t.startsWith("⏺") || t.startsWith("→")) {
      sendToClient({ type: "tool", name: t.replace(/^[⏺→]\s*/, "").slice(0, 80) });
    } else {
      sendToClient({ type: "delta", text: t + "\n" });
    }
  }
}

function sendToClient(msg) {
  if (!activeClient || activeClient.destroyed) return;
  try {
    activeClient.write(JSON.stringify(msg) + "\n");
  } catch {}
}

function sendMessage(text) {
  if (!term) {
    spawnClaude();
    // Wait for prompt
    setTimeout(() => sendMessage(text), 2000);
    return;
  }
  if (waitingForPrompt) {
    setTimeout(() => sendMessage(text), 500);
    return;
  }
  buf = "";
  term.write(text + "\r");
}

function clearSession() {
  if (term) {
    term.kill();
    term = null;
  }
  waitingForPrompt = true;
  buf = "";
  spawnClaude();
  sendToClient({ type: "system", text: "Session cleared" });
  sendToClient({ type: "done" });
}

// ---- Unix socket server ----

// Clean up stale socket
if (fs.existsSync(SOCKET_PATH)) {
  try { fs.unlinkSync(SOCKET_PATH); } catch {}
}

const server = net.createServer((conn) => {
  activeClient = conn;
  let recvBuf = "";

  conn.on("data", (chunk) => {
    recvBuf += chunk.toString();
    const lines = recvBuf.split("\n");
    recvBuf = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === "message" && msg.text) {
          sendMessage(msg.text);
        } else if (msg.type === "clear") {
          clearSession();
        }
      } catch {}
    }
  });

  conn.on("close", () => {
    if (activeClient === conn) activeClient = null;
  });

  conn.on("error", () => {
    if (activeClient === conn) activeClient = null;
  });
});

server.listen(SOCKET_PATH, () => {
  // Make socket accessible
  fs.chmodSync(SOCKET_PATH, 0o700);
  console.log(`[chat-daemon] listening on ${SOCKET_PATH}`);
});

// Start claude immediately
spawnClaude();

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("[chat-daemon] SIGTERM");
  if (term) term.kill();
  server.close();
  try { fs.unlinkSync(SOCKET_PATH); } catch {}
  process.exit(0);
});
process.on("SIGINT", () => {
  if (term) term.kill();
  server.close();
  try { fs.unlinkSync(SOCKET_PATH); } catch {}
  process.exit(0);
});
