/**
 * chat-session.ts — Claude Code chat via `claude -p`.
 *
 * Each message spawns `claude -p` with the last N messages as context.
 * Full Claude Code with tools. Not persistent, but functional.
 */

import { spawn } from "node:child_process";
import * as os from "node:os";
import { EventEmitter } from "node:events";

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const CONTEXT_MESSAGES = 5;

interface ChatEvent {
  type: "delta" | "tool" | "system" | "done" | "error";
  text?: string;
  name?: string;
  detail?: string;
}

interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

export class ChatSession extends EventEmitter {
  private history: HistoryEntry[] = [];
  private systemPrompt: string;
  private cwd: string;

  constructor(systemPrompt: string, cwd: string = os.homedir()) {
    super();
    this.systemPrompt = systemPrompt;
    this.cwd = cwd;
  }

  async send(message: string): Promise<void> {
    this.history.push({ role: "user", content: message });

    // Build prompt with recent history
    const recent = this.history.slice(-CONTEXT_MESSAGES * 2);
    const parts: string[] = [];
    for (const entry of recent.slice(0, -1)) {
      parts.push(`[${entry.role.toUpperCase()}]: ${entry.content}`);
    }
    parts.push(message);
    const fullPrompt = parts.join("\n\n");

    const { CLAUDECODE: _cc, ...env } = process.env;

    const proc = spawn(CLAUDE_BIN, [
      "-p", fullPrompt,
      "--output-format", "stream-json",
      "--system-prompt", this.systemPrompt,
      "--dangerously-skip-permissions",
      "--verbose",
    ], {
      env,
      cwd: this.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let buf = "";
    let lastText = "";
    let fullResponse = "";

    const processLine = (line: string) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line);

        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text" && block.text && block.text.length > lastText.length) {
              const delta = block.text.slice(lastText.length);
              lastText = block.text;
              fullResponse = block.text;
              this.emit("event", { type: "delta", text: delta } as ChatEvent);
            }
            if (block.type === "tool_use") {
              const name = block.name ?? "tool";
              let detail = "";
              try {
                const input = block.input ?? {};
                detail = String(input.command ?? input.path ?? input.file_path ?? input.query ?? input.pattern ?? "")
                  .split("\n")[0].slice(0, 100);
              } catch {}
              this.emit("event", { type: "tool", name, detail } as ChatEvent);
            }
          }
        }

        if (msg.type === "result") {
          if (typeof msg.result === "string" && msg.result.length > fullResponse.length) {
            fullResponse = msg.result;
          }
          this.emit("event", { type: "done" } as ChatEvent);
        }

        if (msg.type === "system" && msg.subtype !== "init") {
          const text = msg.message ?? msg.text ?? "";
          if (text) this.emit("event", { type: "system", text } as ChatEvent);
        }
      } catch {}
    };

    proc.stdout.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text && /login|auth|compact|warning|limit|quota/i.test(text)) {
        this.emit("event", { type: "system", text } as ChatEvent);
      }
    });

    return new Promise<void>((resolve) => {
      proc.on("close", (code) => {
        if (buf.trim()) processLine(buf);
        // Save response to history
        if (fullResponse) {
          this.history.push({ role: "assistant", content: fullResponse });
        }
        if (code && code !== 0) {
          this.emit("event", { type: "system", text: `Session ended (code ${code})` } as ChatEvent);
        }
        this.emit("event", { type: "done" } as ChatEvent);
        resolve();
      });

      proc.on("error", (err) => {
        this.emit("event", { type: "error", text: err.message } as ChatEvent);
        resolve();
      });
    });
  }

  clear() {
    this.history = [];
  }

  get alive(): boolean { return true; }
  kill() { this.history = []; }
}

const sessions = new Map<string, ChatSession>();
const sessionTimers = new Map<string, ReturnType<typeof setTimeout>>();
const SESSION_TTL_MS = 30 * 60 * 1000;

function touchSession(id: string) {
  if (sessionTimers.has(id)) clearTimeout(sessionTimers.get(id)!);
  sessionTimers.set(id, setTimeout(() => {
    sessions.delete(id);
    sessionTimers.delete(id);
  }, SESSION_TTL_MS));
}

export function getOrCreateSession(id: string, systemPrompt: string, cwd?: string): ChatSession {
  let session = sessions.get(id);
  if (session) {
    touchSession(id);
    return session;
  }
  session = new ChatSession(systemPrompt, cwd);
  sessions.set(id, session);
  touchSession(id);
  return session;
}

export function destroySession(id: string) {
  const s = sessions.get(id);
  if (s) s.kill();
  sessions.delete(id);
  if (sessionTimers.has(id)) {
    clearTimeout(sessionTimers.get(id)!);
    sessionTimers.delete(id);
  }
}
