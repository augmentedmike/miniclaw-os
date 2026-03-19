import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";

export interface ChatServerOptions {
  port: number;
  claudeBin: string;
  workspaceDir: string;
}

interface ContextPruneConfig {
  windowMinutes: number;
  windowMinMessages: number;
  contextThresholdPercent: number;
}

const PRUNE_CONFIG: ContextPruneConfig = {
  windowMinutes: 60,
  windowMinMessages: 10,
  contextThresholdPercent: 75,
};

interface PruneStats {
  totalPrunes: number;
  messagesDropped: number;
  lastPruneAt: string | null;
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

  interface StoredMessage {
    role: "user" | "assistant" | "system";
    content: string;
    hasImages?: boolean;
    imageCount?: number;
    error?: boolean;
    timestamp: string;
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
    messages: StoredMessage[];
    lastContextUsed: number;
    needsPrune: boolean;
    pruneStats: PruneStats;
    replayHistory?: string;
  }

  const chatSessions = new Map<string, ChatSession>();

  const historyDir = join(
    process.env.OPENCLAW_STATE_DIR ?? join(homedir(), ".openclaw"),
    "USER", "brain", "chat-history",
  );
  mkdirSync(historyDir, { recursive: true });

  function historyPath(sessionId: string): string {
    return join(historyDir, `${sessionId}.json`);
  }

  function loadHistory(sessionId: string): StoredMessage[] {
    const p = historyPath(sessionId);
    if (!existsSync(p)) return [];
    try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return []; }
  }

  function saveHistory(session: ChatSession) {
    try { writeFileSync(historyPath(session.id), JSON.stringify(session.messages)); } catch {}
  }

  function addMessage(session: ChatSession, msg: Omit<StoredMessage, "timestamp">) {
    session.messages.push({ ...msg, timestamp: new Date().toISOString() });
    saveHistory(session);
  }

  function newSession(ws: WebSocket): ChatSession {
    return {
      id: randomUUID(), proc: null, buffer: "", ws,
      totalInputTokens: 0, totalOutputTokens: 0, totalCacheRead: 0, totalCacheCreate: 0,
      totalCost: 0, contextWindow: 1_000_000, turnCount: 0,
      awaitingResult: false, messageQueue: [], procHasContext: false,
      messages: [], lastContextUsed: 0, needsPrune: false,
      pruneStats: { totalPrunes: 0, messagesDropped: 0, lastPruneAt: null },
    };
  }

  /** Return only recent messages within the time window, always keeping at least minMessages. */
  function pruneMessages(messages: StoredMessage[], config: ContextPruneConfig): { kept: StoredMessage[]; dropped: number } {
    if (messages.length <= config.windowMinMessages) {
      return { kept: messages, dropped: 0 };
    }
    const cutoff = Date.now() - config.windowMinutes * 60 * 1000;
    const guaranteed = messages.slice(-config.windowMinMessages);
    const older = messages.slice(0, -config.windowMinMessages);
    const survivingOlder = older.filter((m) => {
      const ts = new Date(m.timestamp).getTime();
      return !isNaN(ts) && ts >= cutoff;
    });
    const kept = [...survivingOlder, ...guaranteed];
    return { kept, dropped: messages.length - kept.length };
  }

  /** Format pruned history as text for injection into the first message after respawn. */
  function formatHistoryForReplay(messages: StoredMessage[]): string {
    if (messages.length === 0) return "";
    const lines = messages.map((m) => {
      const ts = m.timestamp ? ` ${m.timestamp}` : "";
      const prefix = m.role === "user" ? "[user" : "[assistant";
      const imgNote = m.hasImages ? ` (${m.imageCount || 1} image${(m.imageCount || 1) > 1 ? "s" : ""} — no longer available)` : "";
      return `${prefix}${ts}]:${imgNote}\n${m.content}`;
    });
    return lines.join("\n\n");
  }

  /** Check if context usage exceeds threshold — schedule prune before next turn. */
  function checkContextThreshold(session: ChatSession) {
    const threshold = session.contextWindow * (PRUNE_CONFIG.contextThresholdPercent / 100);
    if (session.lastContextUsed >= threshold && session.messages.length > PRUNE_CONFIG.windowMinMessages) {
      session.needsPrune = true;
      console.log(`[mc-web-chat] context at ${session.lastContextUsed}/${session.contextWindow} (${Math.round(session.lastContextUsed / session.contextWindow * 100)}%) — prune scheduled`);
    }
  }

  /** Kill the process and respawn. Next message will include pruned history. */
  function pruneAndRespawn(session: ChatSession) {
    const { kept, dropped } = pruneMessages(session.messages, PRUNE_CONFIG);
    if (dropped === 0) {
      session.needsPrune = false;
      return;
    }

    console.log(`[mc-web-chat] pruning: dropping ${dropped} messages, keeping ${kept.length}`);

    // Kill the old process
    if (session.proc) {
      session.proc.kill();
      session.proc = null;
    }

    // Store replay history for injection on next message
    session.replayHistory = formatHistoryForReplay(kept);
    session.procHasContext = false;
    session.needsPrune = false;
    session.lastContextUsed = 0;

    // Update stats
    session.pruneStats.totalPrunes++;
    session.pruneStats.messagesDropped += dropped;
    session.pruneStats.lastPruneAt = new Date().toISOString();

    sendToClient(session, {
      type: "context_pruned",
      dropped,
      kept: kept.length,
      stats: session.pruneStats,
    });
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

            // Track context size for pruning decisions
            session.lastContextUsed = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
            checkContextThreshold(session);

            const resultText = ev.result || "";
            if (resultText) {
              addMessage(session, { role: "assistant", content: resultText });
            }
            sendToClient(session, {
              type: "result", text: resultText,
              tokens: {
                contextUsed: session.lastContextUsed,
                contextWindow: session.contextWindow,
                totalInput: session.totalInputTokens, totalOutput: session.totalOutputTokens,
                totalCost: session.totalCost,
              },
              pruneStats: session.pruneStats,
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

  interface ImageAttachment {
    base64: string;
    mediaType: string;
  }

  function buildMessageContent(text: string, images?: ImageAttachment[]): string {
    if (!images || images.length === 0) return text;
    // Save images to temp files so Claude Code can read them with the Read tool
    const imagePaths: string[] = [];
    for (const img of images) {
      const ext = img.mediaType.split("/")[1] || "png";
      const tmpPath = join(tmpdir(), `mc-chat-img-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
      writeFileSync(tmpPath, Buffer.from(img.base64, "base64"));
      imagePaths.push(tmpPath);
    }
    const imageNote = imagePaths.map(p => `[Attached image: ${p}]`).join("\n");
    return `${imageNote}\n\n${text}`;
  }

  function sendMessageToProcess(session: ChatSession, content: string, images?: ImageAttachment[]) {
    // Prune before sending if threshold was crossed
    if (session.needsPrune) {
      pruneAndRespawn(session);
    }

    const proc = ensureProcess(session);
    session.turnCount++;
    session.awaitingResult = true;

    let msg = content;
    if (!session.procHasContext) {
      session.procHasContext = true;
      const wp = loadWorkspacePrompt();
      if (wp) {
        let chatPersona = "";
        try {
          chatPersona = readFileSync(join(workspaceDir, "refs", "chat-persona.md"), "utf-8");
        } catch {}
        const context = chatPersona
          ? `${wp}\n\n# refs/chat-persona.md\n${chatPersona}`
          : wp;

        // Include pruned history if respawning after a prune
        const historyBlock = session.replayHistory
          ? `\n\n<conversation-history>\n${session.replayHistory}\n</conversation-history>\n\nThe above is your recent conversation history — older messages were pruned. Continue naturally.`
          : "";
        session.replayHistory = undefined;

        msg = `<workspace-context>\n${context}\n</workspace-context>${historyBlock}\n\nInternalize the above silently. Now respond to:\n\n${content}`;
      }
    }

    const messageContent = buildMessageContent(msg, images);
    console.log(`[mc-web-chat] turn ${session.turnCount}: sending message${images?.length ? ` (${images.length} image${images.length > 1 ? "s" : ""})` : ""}`);
    proc.stdin!.write(JSON.stringify({ type: "user", message: { role: "user", content: messageContent } }) + "\n");
  }

  function handleChat(session: ChatSession, content: string, images?: ImageAttachment[]) {
    addMessage(session, {
      role: "user",
      content,
      ...(images?.length ? { hasImages: true, imageCount: images.length } : {}),
    });
    if (session.awaitingResult) {
      session.messageQueue.push(content);
      sendToClient(session, { type: "queued", position: session.messageQueue.length });
      return;
    }
    sendMessageToProcess(session, content, images);
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
      let msg: { type: string; content?: string; sessionId?: string; images?: ImageAttachment[] };
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === "join") {
        const rid = msg.sessionId;
        if (rid && chatSessions.has(rid)) {
          session = chatSessions.get(rid)!;
          session.ws = ws;
          ws.send(JSON.stringify({
            type: "joined", sessionId: session.id, resumed: true,
            processing: session.awaitingResult,
            messages: session.messages,
            tokens: {
              totalInput: session.totalInputTokens, totalOutput: session.totalOutputTokens,
              contextUsed: session.totalInputTokens + session.totalCacheRead + session.totalCacheCreate,
              contextWindow: session.contextWindow, totalCost: session.totalCost,
            },
          }));
        } else if (rid) {
          // Session not in memory — try loading from disk
          const history = loadHistory(rid);
          if (history.length > 0) {
            session = newSession(ws);
            session.id = rid;
            session.messages = history;
            chatSessions.set(session.id, session);
            const est = estimateTokens(loadWorkspacePrompt());
            ensureProcess(session);
            ws.send(JSON.stringify({
              type: "joined", sessionId: session.id, resumed: true,
              messages: session.messages,
              workspace: { estimatedTokens: est },
              tokens: { contextUsed: est, contextWindow: session.contextWindow, totalInput: 0, totalOutput: 0, totalCost: 0 },
            }));
          } else {
            session = newSession(ws);
            chatSessions.set(session.id, session);
            const est = estimateTokens(loadWorkspacePrompt());
            ensureProcess(session);
            ws.send(JSON.stringify({
              type: "joined", sessionId: session.id, resumed: false,
              messages: [],
              workspace: { estimatedTokens: est },
              tokens: { contextUsed: est, contextWindow: session.contextWindow, totalInput: 0, totalOutput: 0, totalCost: 0 },
            }));
          }
        } else {
          session = newSession(ws);
          chatSessions.set(session.id, session);
          const est = estimateTokens(loadWorkspacePrompt());
          ensureProcess(session);
          ws.send(JSON.stringify({
            type: "joined", sessionId: session.id, resumed: false,
            messages: [],
            workspace: { estimatedTokens: est },
            tokens: { contextUsed: est, contextWindow: session.contextWindow, totalInput: 0, totalOutput: 0, totalCost: 0 },
          }));
        }
        return;
      }

      if (!session) return;

      if (msg.type === "chat" && msg.content) {
        // Normalize client field names (data/mimeType) → server names (base64/mediaType)
        const images = msg.images?.map((img: Record<string, unknown>) => ({
          base64: (img as any).base64 ?? (img as any).data,
          mediaType: (img as any).mediaType ?? (img as any).mimeType,
        })).filter((img: ImageAttachment) => img.base64 && img.mediaType);
        handleChat(session, msg.content, images?.length ? images : undefined);
      }

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
