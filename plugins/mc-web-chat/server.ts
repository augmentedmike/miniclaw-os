import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface ChatServerOptions {
  port: number;
  claudeBin: string;
  workspaceDir: string;
}

export function startChatServer(opts: ChatServerOptions) {
  const { port, claudeBin, workspaceDir } = opts;

  function loadWorkspacePrompt(): string {
    try {
      const files = readdirSync(workspaceDir).filter((f) => f.endsWith(".md")).sort();
      const parts = files.map((f) => {
        const content = readFileSync(join(workspaceDir, f), "utf-8");
        return `# ${f}\n${content}`;
      });
      console.log(`[mc-web-chat] workspace loaded ${files.length} files`);
      return parts.join("\n\n");
    } catch (e) {
      console.log(`[mc-web-chat] workspace not found: ${e}`);
      return "";
    }
  }

  function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  interface ChatSession {
    id: string;
    proc: ChildProcess | null;
    buffer: string;
    ws: WebSocket | null;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheRead: number;
    totalCacheCreate: number;
    totalCost: number;
    contextWindow: number;
    turnCount: number;
    awaitingResult: boolean;
    messageQueue: string[];
    procHasContext: boolean;
  }

  const chatSessions = new Map<string, ChatSession>();

  function newSession(ws: WebSocket): ChatSession {
    return {
      id: randomUUID(), proc: null, buffer: "", ws,
      totalInputTokens: 0, totalOutputTokens: 0, totalCacheRead: 0, totalCacheCreate: 0,
      totalCost: 0, contextWindow: 1_000_000, turnCount: 0,
      awaitingResult: false, messageQueue: [], procHasContext: false,
    };
  }

  function sendToClient(session: ChatSession, data: Record<string, unknown>) {
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify(data));
    }
  }

  function ensureProcess(session: ChatSession): ChildProcess {
    if (session.proc && session.proc.exitCode === null) return session.proc;

    const proc = spawn(claudeBin, [
      "-p", "--input-format", "stream-json", "--output-format", "stream-json",
      "--verbose", "--dangerously-skip-permissions",
    ], { stdio: ["pipe", "pipe", "pipe"] });

    console.log(`[mc-web-chat] spawning claude for session ${session.id}`);

    proc.stdout!.on("data", (chunk: Buffer) => {
      session.buffer += chunk.toString();
      const lines = session.buffer.split("\n");
      session.buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const ev = JSON.parse(line);
          if (ev.type === "assistant") {
            const text = ev.message?.content?.filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("") || "";
            const tools = ev.message?.content?.filter((b: { type: string }) => b.type === "tool_use").map((b: { name: string }) => ({ name: b.name })) || [];
            sendToClient(session, { type: "streaming", text, tools });
          }
          if (ev.type === "result") {
            const u = ev.usage || {};
            session.totalInputTokens += (u.input_tokens || 0);
            session.totalOutputTokens += (u.output_tokens || 0);
            session.totalCacheRead += (u.cache_read_input_tokens || 0);
            session.totalCacheCreate += (u.cache_creation_input_tokens || 0);
            session.totalCost += (ev.total_cost_usd || 0);
            sendToClient(session, {
              type: "result", text: ev.result || "",
              tokens: {
                contextUsed: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0),
                contextWindow: session.contextWindow,
                totalInput: session.totalInputTokens, totalOutput: session.totalOutputTokens,
                totalCost: session.totalCost,
              },
            });
            session.awaitingResult = false;
            if (session.messageQueue.length > 0) {
              sendMessageToProcess(session, session.messageQueue.shift()!);
            }
          }
        } catch { /* partial */ }
      }
    });

    proc.stderr!.on("data", (chunk: Buffer) => {
      const msg = chunk.toString().trim();
      if (msg) console.log(`[mc-web-chat stderr] ${msg}`);
    });

    proc.on("exit", (code) => {
      console.log(`[mc-web-chat] claude exited: ${code}`);
      session.proc = null;
      session.awaitingResult = false;
      session.procHasContext = false;
      sendToClient(session, { type: "process_exit", code });
    });

    session.proc = proc;
    session.buffer = "";
    session.procHasContext = false;
    return proc;
  }

  function sendMessageToProcess(session: ChatSession, content: string) {
    const proc = ensureProcess(session);
    session.turnCount++;
    session.awaitingResult = true;

    let msg = content;
    if (!session.procHasContext) {
      session.procHasContext = true;
      const wp = loadWorkspacePrompt();
      if (wp) {
        msg = `<workspace-context>\n${wp}\n</workspace-context>\n\n<tool-instructions>\nAll MiniClaw plugins (mc-*) listed in TOOLS.md are available as bash commands via: mc <plugin-id> <command> [args]\nExamples: mc mc-board list, mc mc-calendar list, mc mc-email list, mc mc-kb search "query"\nThese are YOUR tools. Use them directly.\n</tool-instructions>\n\nInternalize the above silently. Now respond to:\n\n${content}`;
      }
    }

    console.log(`[mc-web-chat] turn ${session.turnCount}: sending message`);
    proc.stdin!.write(JSON.stringify({ type: "user", message: { role: "user", content: msg } }) + "\n");
  }

  function handleChat(session: ChatSession, content: string) {
    if (session.awaitingResult) {
      session.messageQueue.push(content);
      sendToClient(session, { type: "queued", position: session.messageQueue.length });
      return;
    }
    sendMessageToProcess(session, content);
  }

  // HTTP server just for health checks
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      res.end(JSON.stringify({ status: "ok", sessions: chatSessions.size }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    // Allow CORS for board web app
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    let session: ChatSession | null = null;

    ws.on("message", (raw) => {
      let msg: { type: string; content?: string; sessionId?: string };
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === "join") {
        const rid = msg.sessionId;
        if (rid && chatSessions.has(rid)) {
          session = chatSessions.get(rid)!;
          session.ws = ws;
          ws.send(JSON.stringify({
            type: "joined", sessionId: session.id, resumed: true,
            processing: session.awaitingResult,
            tokens: {
              totalInput: session.totalInputTokens, totalOutput: session.totalOutputTokens,
              contextUsed: session.totalInputTokens + session.totalCacheRead + session.totalCacheCreate,
              contextWindow: session.contextWindow, totalCost: session.totalCost,
            },
          }));
        } else {
          session = newSession(ws);
          chatSessions.set(session.id, session);
          const est = estimateTokens(loadWorkspacePrompt());
          ensureProcess(session);
          ws.send(JSON.stringify({
            type: "joined", sessionId: session.id, resumed: false,
            workspace: { estimatedTokens: est },
            tokens: { contextUsed: est, contextWindow: session.contextWindow, totalInput: 0, totalOutput: 0, totalCost: 0 },
          }));
        }
        return;
      }

      if (!session) return;

      if (msg.type === "chat" && msg.content) handleChat(session, msg.content);

      if (msg.type === "stop" && session.proc) {
        session.proc.kill(); session.proc = null;
        session.awaitingResult = false; session.messageQueue = [];
        sendToClient(session, { type: "done" });
      }

      if (msg.type === "new_chat") {
        if (session.proc) session.proc.kill();
        chatSessions.delete(session.id);
        session = newSession(ws);
        chatSessions.set(session.id, session);
        const est = estimateTokens(loadWorkspacePrompt());
        ensureProcess(session);
        ws.send(JSON.stringify({
          type: "joined", sessionId: session.id, resumed: false,
          workspace: { estimatedTokens: est },
          tokens: { contextUsed: est, contextWindow: session.contextWindow, totalInput: 0, totalOutput: 0, totalCost: 0 },
        }));
      }
    });

    ws.on("close", () => { if (session) { session.ws = null; } });
  });

  server.listen(port, () => {
    console.log(`[mc-web-chat] WebSocket server on ws://127.0.0.1:${port}`);
  });

  return { server, wss };
}
