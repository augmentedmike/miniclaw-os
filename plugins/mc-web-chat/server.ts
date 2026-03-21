import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ChatDatabase } from "./chat-db.js";

export interface ChatServerOptions {
  port: number;
  claudeBin: string;
  workspaceDir: string;
  stateDir?: string;
}

// ---- Context management config ----
const MAX_HISTORY = 30;          // rolling window of messages kept server-side
const MAX_IMAGES_IN_HISTORY = 2; // only keep last N images; older ones get placeholder
const IMAGE_PLACEHOLDER = "[image was shared earlier in conversation]";
const CONTEXT_PRESSURE_PCT = 80; // at 80% usage, proactively restart with summary
const TOKEN_BUDGET = 800_000;    // Claude Code uses 1M context; leave 200k headroom
const MIN_TURNS_BEFORE_RESTART = 4; // don't check pressure until Nth turn (avoids restart loop from replay)

// ---- Token estimator (~4 chars per token, images ~1000 tokens) ----
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface HistoryMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  hasImage?: boolean; // flag — actual image data is never stored
  timestamp: number;
  replyTo?: string; // ID of the message being replied to
}

export function startChatServer(opts: ChatServerOptions) {
  const { port, claudeBin, workspaceDir, stateDir } = opts;

  // ---- Chat history database ----
  const chatDb = new ChatDatabase(stateDir || join(process.env.HOME || "", ".openclaw"));

  /** Archive a session to SQLite before discarding */
  function archiveSession(session: ChatSession) {
    if (session.messages.length === 0) return;
    try {
      chatDb.archiveSession(session.id, session.messages, session.totalCost);
    } catch (err) {
      console.log(`[mc-web-chat] failed to archive session ${session.id}: ${err}`);
    }
  }

  // ---- Workspace loader ----
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

  let cachedWorkspace: string | null = null;
  let workspaceCacheTime = 0;
  const WORKSPACE_CACHE_TTL = 60_000; // re-read workspace files every 60s

  function getWorkspacePrompt(): string {
    const now = Date.now();
    if (!cachedWorkspace || (now - workspaceCacheTime) > WORKSPACE_CACHE_TTL) {
      cachedWorkspace = loadWorkspacePrompt();
      workspaceCacheTime = now;
    }
    return cachedWorkspace;
  }

  // ---- Session types ----
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
    lastReportedContextUsed: number; // from most recent result event
    turnCount: number;
    awaitingResult: boolean;
    messageQueue: string[];
    procHasContext: boolean;
    lastActivity: number;
    messages: HistoryMessage[];
    currentTopic: string | null; // tracks the current conversation topic
    pendingSeedMessage: string | null; // message to auto-send after new_chat from topic shift
  }

  const chatSessions = new Map<string, ChatSession>();

  function newSession(ws: WebSocket): ChatSession {
    return {
      id: randomUUID(), proc: null, buffer: "", ws,
      totalInputTokens: 0, totalOutputTokens: 0, totalCacheRead: 0, totalCacheCreate: 0,
      totalCost: 0, contextWindow: TOKEN_BUDGET, lastReportedContextUsed: 0,
      turnCount: 0, awaitingResult: false, messageQueue: [], procHasContext: false,
      lastActivity: Date.now(), messages: [],
      currentTopic: null, pendingSeedMessage: null,
    };
  }

  // ---- Context management functions ----

  function trimHistory(session: ChatSession) {
    if (session.messages.length > MAX_HISTORY) {
      const dropped = session.messages.length - MAX_HISTORY;
      session.messages = session.messages.slice(-MAX_HISTORY);
      console.log(`[mc-web-chat] trimmed ${dropped} old messages, keeping ${MAX_HISTORY}`);
    }
  }

  /**
   * Prune image flags from older messages.
   * We never store actual image data — but we track which messages HAD images
   * so we can tell Claude "an image was shared here" vs nothing.
   * Only the last MAX_IMAGES_IN_HISTORY messages keep their hasImage flag.
   */
  function pruneImageFlags(messages: HistoryMessage[]): void {
    let imagesKept = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].hasImage) {
        if (imagesKept >= MAX_IMAGES_IN_HISTORY) {
          messages[i].hasImage = false; // strip flag from old ones
        } else {
          imagesKept++;
        }
      }
    }
  }

  /**
   * Build conversation history for replay when process restarts.
   * This is the key function — it creates a condensed summary that fits
   * in a single first-turn message without blowing context.
   */
  function buildHistoryReplay(messages: HistoryMessage[]): string {
    if (messages.length === 0) return "";

    // Estimate total tokens for full replay
    let totalTokens = 0;
    for (const m of messages) {
      totalTokens += estimateTokens(m.content) + 10; // +10 for role prefix overhead
    }

    // If full replay fits in ~40k tokens, use it verbatim
    const MAX_REPLAY_TOKENS = 40_000;
    let replayMessages = messages;

    if (totalTokens > MAX_REPLAY_TOKENS) {
      // Too big — keep first 2 (establishes topic) + last N that fit
      const first = messages.slice(0, 2);
      const firstTokens = first.reduce((sum, m) => sum + estimateTokens(m.content) + 10, 0);
      const budget = MAX_REPLAY_TOKENS - firstTokens - 200; // 200 for separator

      const recent: HistoryMessage[] = [];
      let used = 0;
      for (let i = messages.length - 1; i >= 2; i--) {
        const cost = estimateTokens(messages[i].content) + 10;
        if (used + cost > budget) break;
        recent.unshift(messages[i]);
        used += cost;
      }

      const dropped = messages.length - first.length - recent.length;
      replayMessages = [
        ...first,
        { role: "assistant" as const, content: `[...${dropped} earlier messages omitted...]`, timestamp: 0 },
        ...recent,
      ];
    }

    const lines = replayMessages.map((m) => {
      let line = `[${m.role}]: ${m.content}`;
      if (m.hasImage) line += ` ${IMAGE_PLACEHOLDER}`;
      if (m.replyTo) {
        const target = messages.find(t => t.id === m.replyTo);
        if (target) {
          const snippet = target.content.slice(0, 60) + (target.content.length > 60 ? "..." : "");
          line = `[${m.role} replying to ${target.role}: "${snippet}"]: ${m.content}`;
        } else {
          line = `[${m.role} replying to a pruned message]: ${m.content}`;
        }
      }
      return line;
    });

    return `<conversation-history>\n${lines.join("\n\n")}\n</conversation-history>`;
  }

  /**
   * Check if context pressure is high enough to warrant a proactive restart.
   * Returns true if we should kill the process and replay history on next message.
   */
  function shouldRestartForContext(session: ChatSession): boolean {
    if (!session.proc || session.lastReportedContextUsed === 0) return false;
    // Don't restart on early turns — the history replay inflates the first few results
    if (session.turnCount <= MIN_TURNS_BEFORE_RESTART) return false;
    const pct = (session.lastReportedContextUsed / session.contextWindow) * 100;
    if (pct >= CONTEXT_PRESSURE_PCT) {
      console.log(`[mc-web-chat] context pressure ${pct.toFixed(0)}% >= ${CONTEXT_PRESSURE_PCT}% — scheduling restart (turn ${session.turnCount})`);
      return true;
    }
    return false;
  }

  /**
   * Proactively restart the Claude process with a clean context.
   * Kills the current process; next sendMessageToProcess will spawn fresh + replay.
   */
  function proactiveRestart(session: ChatSession) {
    console.log(`[mc-web-chat] context full — killing session ${session.id} (${session.messages.length} messages, turn ${session.turnCount})`);
    if (session.proc) {
      session.proc.kill();
      session.proc = null;
    }
    // Wipe everything — start clean, no replay
    session.procHasContext = false;
    session.lastReportedContextUsed = 0;
    session.turnCount = 0;
    session.messages = [];
    session.messageQueue = [];
    sendToClient(session, {
      type: "context_reset",
      reason: "Context window was full. Starting a fresh conversation.",
    });
  }

  // ---- Client communication ----

  function sendToClient(session: ChatSession, data: Record<string, unknown>) {
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify(data));
    }
  }

  // ---- Process management ----

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
            // Forward raw content blocks for modal expansion
            const blocks = (ev.message?.content || []).map((b: Record<string, unknown>) => {
              if (b.type === "thinking") return { type: "thinking", text: b.thinking || b.text || "" };
              if (b.type === "text") return { type: "text", text: b.text || "" };
              if (b.type === "tool_use") return { type: "tool_use", name: b.name, input: b.input };
              if (b.type === "tool_result") return { type: "tool_result", content: typeof b.content === "string" ? b.content : JSON.stringify(b.content || "") };
              return { type: b.type, text: String(b.text || "") };
            });
            sendToClient(session, { type: "streaming", text, tools, blocks });
          }
          if (ev.type === "result") {
            const u = ev.usage || {};
            const inputTokens = u.input_tokens || 0;
            const cacheRead = u.cache_read_input_tokens || 0;
            const cacheCreate = u.cache_creation_input_tokens || 0;

            session.totalInputTokens += inputTokens;
            session.totalOutputTokens += (u.output_tokens || 0);
            session.totalCacheRead += cacheRead;
            session.totalCacheCreate += cacheCreate;
            session.totalCost += (ev.total_cost_usd || 0);
            session.lastReportedContextUsed = inputTokens + cacheRead + cacheCreate;

            let resultText = ev.result || "";

            // --- Topic shift detection ---
            const topicShiftRegex = /<topic_shift\s+detected="true"\s+new_topic="([^"]+)"\s*\/>/;
            const topicMatch = resultText.match(topicShiftRegex);
            let detectedTopicShift: string | null = null;

            if (topicMatch) {
              detectedTopicShift = topicMatch[1];
              // Strip the tag from the result text
              resultText = resultText.replace(topicShiftRegex, "").trimEnd();
              console.log(`[mc-web-chat] topic shift detected: "${detectedTopicShift}" (was: "${session.currentTopic}")`);
            }

            // Extract topic label from first response if not set yet
            if (!session.currentTopic && resultText && session.turnCount <= 2) {
              // Use first 60 chars as a rough topic label for the session
              const firstLine = resultText.split("\n")[0].slice(0, 60).trim();
              if (firstLine) session.currentTopic = firstLine;
            }

            if (resultText) {
              session.messages.push({
                role: "assistant",
                content: resultText,
                timestamp: Date.now(),
              });
              trimHistory(session);
              pruneImageFlags(session.messages);
            }

            // Collect content blocks from the result for modal expansion
            const resultBlocks = (ev.result_blocks || ev.message?.content || []).map((b: Record<string, unknown>) => {
              if (b.type === "thinking") return { type: "thinking", text: b.thinking || b.text || "" };
              if (b.type === "text") return { type: "text", text: b.text || "" };
              if (b.type === "tool_use") return { type: "tool_use", name: b.name, input: b.input };
              if (b.type === "tool_result") return { type: "tool_result", content: typeof b.content === "string" ? b.content : JSON.stringify(b.content || "") };
              return { type: b.type, text: String(b.text || "") };
            });

            // Strip topic_shift tags from text blocks sent to client
            const cleanBlocks = resultBlocks.map((b: Record<string, unknown>) => {
              if (b.type === "text" && typeof b.text === "string") {
                return { ...b, text: (b.text as string).replace(topicShiftRegex, "").trimEnd() };
              }
              return b;
            });

            sendToClient(session, {
              type: "result", text: resultText,
              blocks: cleanBlocks.length > 0 ? cleanBlocks : undefined,
              tokens: {
                contextUsed: session.lastReportedContextUsed,
                contextWindow: session.contextWindow,
                totalInput: session.totalInputTokens,
                totalOutput: session.totalOutputTokens,
                totalCost: session.totalCost,
              },
            });

            // Send topic_shift event AFTER the result so client has the response text first
            if (detectedTopicShift) {
              // Find the last user message that triggered this shift
              const lastUserMsg = [...session.messages].reverse().find(m => m.role === "user");
              sendToClient(session, {
                type: "topic_shift",
                suggestedTopic: detectedTopicShift,
                currentSessionId: session.id,
                seedMessage: lastUserMsg?.content || "",
              });
            }

            session.awaitingResult = false;

            // Check context pressure AFTER sending result
            if (shouldRestartForContext(session)) {
              proactiveRestart(session);
            }

            if (session.messageQueue.length > 0) {
              sendMessageToProcess(session, session.messageQueue.shift()!);
            }
          }
        } catch { /* partial JSON line */ }
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

  // ---- Message building ----

  interface ImageAttachment {
    base64: string;
    mediaType: string;
  }

  function buildMessageContent(text: string, images?: ImageAttachment[]): string | Array<Record<string, unknown>> {
    if (!images || images.length === 0) return text;
    const blocks: Record<string, unknown>[] = [];
    for (const img of images) {
      blocks.push({
        type: "image",
        source: { type: "base64", media_type: img.mediaType, data: img.base64 },
      });
    }
    if (text) blocks.push({ type: "text", text });
    return blocks;
  }

  function sendMessageToProcess(session: ChatSession, content: string, images?: ImageAttachment[]) {
    const proc = ensureProcess(session);
    session.turnCount++;
    session.awaitingResult = true;

    let msg = content;
    if (!session.procHasContext) {
      session.procHasContext = true;
      const wp = getWorkspacePrompt();

      let preamble = "";
      if (wp) {
        let chatPersona = "";
        try {
          chatPersona = readFileSync(join(workspaceDir, "refs", "chat-persona.md"), "utf-8");
        } catch {}
        const currentDate = new Date().toISOString().slice(0, 10);
        const dateLine = `# currentDate\nToday's date is ${currentDate}.`;
        const topicDetection = `# Topic Shift Detection
When the user's message is clearly about a completely different task or subject than the current conversation (e.g. switching from debugging code to scheduling a meeting, or from discussing a recipe to asking about car repair), append this tag at the very end of your response on its own line:
<topic_shift detected="true" new_topic="SHORT_LABEL_HERE"/>
Replace SHORT_LABEL_HERE with a 2-5 word label for the new topic.
IMPORTANT: Do NOT trigger this for natural subtopic evolution, follow-up questions, or related topics within the same domain. Only flag clear, unambiguous task/subject changes.
${session.currentTopic ? `Current conversation topic: ${session.currentTopic}` : "This is a new conversation — set the topic naturally."}`;
        const context = chatPersona
          ? `${wp}\n\n# refs/chat-persona.md\n${chatPersona}\n\n${topicDetection}\n\n${dateLine}`
          : `${wp}\n\n${topicDetection}\n\n${dateLine}`;
        preamble = `<workspace-context>\n${context}\n</workspace-context>\n\n`;
      }

      // Replay conversation history (excludes the current message — last entry is current user msg)
      const historyMessages = session.messages.slice(0, -1);
      const historyReplay = buildHistoryReplay(historyMessages);

      const contextNote = historyMessages.length > 0
        ? `[Context window: replaying ${historyMessages.length} of ${session.messages.length - 1} previous messages. Continue the conversation naturally.]\n\n`
        : "";

      if (preamble || historyReplay) {
        const instruction = historyMessages.length > 0
          ? "You are resuming a conversation. The history above is what was discussed. Continue naturally.\n\n"
          : "Internalize the above silently. Now respond to:\n\n";
        msg = `${preamble}${historyReplay ? historyReplay + "\n\n" : ""}${contextNote}${instruction}${content}`;
      }
    }

    // Images only for current turn — never persisted in history
    const messageContent = buildMessageContent(msg, images);
    const hasImages = images && images.length > 0;
    console.log(
      `[mc-web-chat] turn ${session.turnCount}: sending message` +
      `${hasImages ? ` (${images.length} image${images.length > 1 ? "s" : ""})` : ""}` +
      ` [history: ${session.messages.length}, ctx: ${session.lastReportedContextUsed}/${session.contextWindow}]`
    );
    proc.stdin!.write(JSON.stringify({ type: "user", message: { role: "user", content: messageContent } }) + "\n");
  }

  // ---- Chat handler ----

  function handleChat(session: ChatSession, content: string, images?: ImageAttachment[], msgId?: string, replyTo?: string) {
    session.messages.push({
      id: msgId,
      role: "user",
      content,
      hasImage: !!(images && images.length > 0),
      timestamp: Date.now(),
      ...(replyTo ? { replyTo } : {}),
    });
    trimHistory(session);
    pruneImageFlags(session.messages);
    session.lastActivity = Date.now();

    if (session.awaitingResult) {
      session.messageQueue.push(content);
      sendToClient(session, { type: "queued", position: session.messageQueue.length });
      return;
    }
    sendMessageToProcess(session, content, images);
  }

  // ---- HTTP server (health + stats + chat history API) ----

  function jsonResponse(res: ServerResponse, status: number, data: unknown) {
    res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify(data));
  }

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const path = url.pathname;

    // CORS preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();
      return;
    }

    if (path === "/health") {
      jsonResponse(res, 200, { status: "ok", sessions: chatSessions.size });
    } else if (path === "/stats") {
      const sessionStats = Array.from(chatSessions.values()).map(s => ({
        id: s.id.slice(0, 8),
        turns: s.turnCount,
        history: s.messages.length,
        contextUsed: s.lastReportedContextUsed,
        contextWindow: s.contextWindow,
        contextPct: s.contextWindow > 0 ? Math.round((s.lastReportedContextUsed / s.contextWindow) * 100) : 0,
        totalCost: s.totalCost,
        alive: !!(s.proc && s.proc.exitCode === null),
        connected: !!(s.ws && s.ws.readyState === WebSocket.OPEN),
        idleMin: Math.round((Date.now() - s.lastActivity) / 60000),
      }));
      jsonResponse(res, 200, { sessions: sessionStats });
    } else if (path === "/chats" && req.method === "GET") {
      // GET /chats — list archived chats with pagination
      const limit = parseInt(url.searchParams.get("limit") || "20", 10);
      const offset = parseInt(url.searchParams.get("offset") || "0", 10);
      const result = chatDb.listChats(limit, offset);
      jsonResponse(res, 200, result);
    } else if (path.startsWith("/chats/") && req.method === "GET") {
      // GET /chats/:id — fetch full message history
      const chatId = path.slice("/chats/".length);
      const result = chatDb.getChat(chatId);
      if (!result.session) {
        jsonResponse(res, 404, { error: "Chat not found" });
      } else {
        jsonResponse(res, 200, result);
      }
    } else if (path.startsWith("/chats/") && req.method === "DELETE") {
      // DELETE /chats/:id — remove an archived chat
      const chatId = path.slice("/chats/".length);
      const deleted = chatDb.deleteChat(chatId);
      if (deleted) {
        jsonResponse(res, 200, { ok: true });
      } else {
        jsonResponse(res, 404, { error: "Chat not found" });
      }
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  // ---- WebSocket server ----

  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws) => {
    let session: ChatSession | null = null;

    ws.on("message", (raw) => {
      let msg: { type: string; content?: string; sessionId?: string; images?: ImageAttachment[]; chatId?: string; id?: string; replyTo?: string; seedMessage?: string };
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (msg.type === "join") {
        const rid = msg.sessionId;
        if (rid && chatSessions.has(rid)) {
          session = chatSessions.get(rid)!;
          session.ws = ws;
          session.lastActivity = Date.now();
          ws.send(JSON.stringify({
            type: "joined", sessionId: session.id, resumed: true,
            processing: session.awaitingResult,
            history: session.messages,
            tokens: {
              totalInput: session.totalInputTokens, totalOutput: session.totalOutputTokens,
              contextUsed: session.lastReportedContextUsed,
              contextWindow: session.contextWindow, totalCost: session.totalCost,
            },
          }));
        } else {
          session = newSession(ws);
          chatSessions.set(session.id, session);
          const est = estimateTokens(getWorkspacePrompt());
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

      if (msg.type === "chat" && msg.content) handleChat(session, msg.content, msg.images, msg.id, msg.replyTo);

      if (msg.type === "stop" && session.proc) {
        session.proc.kill(); session.proc = null;
        session.awaitingResult = false; session.messageQueue = [];
        sendToClient(session, { type: "done" });
      }

      if (msg.type === "new_chat") {
        archiveSession(session);
        if (session.proc) session.proc.kill();
        chatSessions.delete(session.id);
        session = newSession(ws);
        chatSessions.set(session.id, session);
        const est = estimateTokens(getWorkspacePrompt());
        ensureProcess(session);
        // Store seed message if provided (from topic shift)
        const seedMsg = msg.seedMessage || null;
        ws.send(JSON.stringify({
          type: "joined", sessionId: session.id, resumed: false,
          workspace: { estimatedTokens: est },
          tokens: { contextUsed: est, contextWindow: session.contextWindow, totalInput: 0, totalOutput: 0, totalCost: 0 },
          seedMessage: seedMsg,
        }));
        // Auto-send the seed message if provided
        if (seedMsg) {
          handleChat(session, seedMsg);
        }
      }

      if (msg.type === "resume_chat" && msg.sessionId) {
        // Load an archived chat from SQLite and start a new session with its history
        const archived = chatDb.getChat(msg.sessionId);
        if (archived.session && archived.messages.length > 0) {
          // Archive the current session first (if it has messages)
          if (session) archiveSession(session);
          if (session?.proc) session.proc.kill();
          if (session) chatSessions.delete(session.id);

          session = newSession(ws);
          // Restore the original session ID so it matches the archive
          chatSessions.delete(session.id);
          session.id = msg.sessionId;
          chatSessions.set(session.id, session);

          // Restore message history
          session.messages = archived.messages.map(m => ({
            role: m.role as "user" | "assistant",
            content: m.content,
            hasImage: m.has_image === 1,
            timestamp: m.timestamp,
          }));
          session.totalCost = archived.session.total_cost;

          ensureProcess(session);
          ws.send(JSON.stringify({
            type: "joined", sessionId: session.id, resumed: true,
            processing: false,
            history: session.messages,
            tokens: {
              totalInput: 0, totalOutput: 0,
              contextUsed: 0, contextWindow: session.contextWindow,
              totalCost: session.totalCost,
            },
          }));
        } else {
          ws.send(JSON.stringify({ type: "error", message: "Chat not found in archive" }));
        }
      }
    });

    ws.on("close", () => { if (session) { session.ws = null; } });
  });

  // ---- Heartbeat ----
  const PING_INTERVAL = 30_000;
  const PONG_TIMEOUT = 10_000;

  const pingInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      const alive = { value: true };
      (client as any).__pongAlive = alive;
      client.ping();
      setTimeout(() => {
        if (alive.value === true && (client as any).__pongAlive === alive) {
          console.log("[mc-web-chat] terminating unresponsive client (no pong)");
          client.terminate();
        }
      }, PONG_TIMEOUT);
    }
  }, PING_INTERVAL);

  wss.on("connection", (ws2) => {
    ws2.on("pong", () => {
      (ws2 as any).__pongAlive = null;
    });
  });

  // ---- Session cleanup ----
  const SESSION_TTL = 15 * 60 * 1000;
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, sess] of chatSessions) {
      if (!sess.ws && !sess.proc && (now - sess.lastActivity) > SESSION_TTL) {
        console.log(`[mc-web-chat] cleaning up stale session ${id} (idle ${Math.round((now - sess.lastActivity) / 60000)}min)`);
        archiveSession(sess);
        chatSessions.delete(id);
      }
    }
  }, 5 * 60 * 1000);

  server.listen(port, () => {
    console.log(`[mc-web-chat] WebSocket server on ws://127.0.0.1:${port}`);
  });

  server.on("close", () => {
    clearInterval(pingInterval);
    clearInterval(cleanupInterval);
  });

  return { server, wss };
}
