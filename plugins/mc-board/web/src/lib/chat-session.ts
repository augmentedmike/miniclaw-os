/**
 * chat-session.ts — Connects to the chat daemon via Unix socket.
 *
 * The daemon holds a persistent interactive Claude Code session in a PTY.
 * This module sends messages and streams responses back to the web client.
 */

import * as net from "node:net";
import * as path from "node:path";
import * as os from "node:os";
import { EventEmitter } from "node:events";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
const SOCKET_PATH = process.env.CHAT_SOCKET ?? path.join(STATE_DIR, "chat.sock");

interface ChatEvent {
  type: "delta" | "tool" | "system" | "done" | "error";
  text?: string;
  name?: string;
  detail?: string;
}

export class ChatSession extends EventEmitter {
  async send(message: string): Promise<void> {
    return new Promise<void>((resolve) => {
      const conn = net.createConnection(SOCKET_PATH);
      let buf = "";

      conn.on("connect", () => {
        conn.write(JSON.stringify({ type: "message", text: message }) + "\n");
      });

      conn.on("data", (chunk) => {
        buf += chunk.toString();
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line) as ChatEvent;
            this.emit("event", evt);
            if (evt.type === "done") {
              conn.end();
              resolve();
            }
          } catch {}
        }
      });

      conn.on("error", (err) => {
        this.emit("event", { type: "error", text: `Chat daemon not running: ${err.message}` } as ChatEvent);
        this.emit("event", { type: "done" } as ChatEvent);
        resolve();
      });

      conn.on("close", () => {
        resolve();
      });

      // Safety timeout
      setTimeout(() => {
        conn.end();
        resolve();
      }, 300_000);
    });
  }

  clear() {
    const conn = net.createConnection(SOCKET_PATH);
    conn.on("connect", () => {
      conn.write(JSON.stringify({ type: "clear" }) + "\n");
      setTimeout(() => conn.end(), 1000);
    });
    conn.on("error", () => {});
  }

  get alive(): boolean { return true; }
  kill() { this.clear(); }
}

// Single session — the daemon holds the state
let _session: ChatSession | null = null;

export function getOrCreateSession(_id: string, _systemPrompt: string, _cwd?: string): ChatSession {
  if (!_session) _session = new ChatSession();
  return _session;
}

export function destroySession(_id: string) {
  if (_session) _session.clear();
}
