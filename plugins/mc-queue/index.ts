/**
 * mc-queue — miniclaw plugin
 *
 * Enforces queue-based triage for all messaging channel sessions (TG DM,
 * TG group, Discord, Slack, etc.).
 *
 * Architecture:
 *   1. before_model_resolve  → Switch messaging sessions to Haiku (fast, cheap).
 *   2. before_prompt_build   → Inject triage instructions so Haiku classifies
 *                               the incoming message and responds naturally.
 *   3. before_tool_call      → Enforce max tool calls per turn so Haiku can't
 *                               accidentally do long-running inline work.
 *   4. after_tool_call       → Log brain/board events to TG log channel.
 *
 * Classification (done by Haiku at runtime, not hardcoded):
 *   IMMEDIATE  — answer from history/knowledge directly
 *   QUICK      — one-tool lookup (KB/QMD/memory), natural "let me check..."
 *   TASK       — multi-step work → board card + natural ack → cron executes
 *
 * TG channel split:
 *   DM  (allowFrom)   — conversational replies to Michael, clean
 *   Log channel        — brain notifications: ship + human-blocked cards only
 *                        Set tgLogChatId + boardUrl in mc-queue config to enable.
 *
 * Session key format examples:
 *   TG DM:    agent:main:telegram:direct:8755232806
 *   TG group: agent:main:telegram:group:-5144217613
 *   Cron:     agent:main:cron:71130727-...
 *   Main:     agent:main:main
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

// Resolve the active OpenClaw state directory from env var (set by LaunchAgent)
const OPENCLAW_STATE_DIR = (process.env.OPENCLAW_STATE_DIR ?? "").trim()
  || path.join(os.homedir(), ".openclaw");

// ---- Load workspace soul files at startup ----

function readWorkspaceFile(filename: string): string {
  try {
    return fs.readFileSync(
      path.join(OPENCLAW_STATE_DIR, "workspace", filename),
      "utf8",
    ).trim();
  } catch {
    return "";
  }
}

const SOUL_CONTEXT = [
  readWorkspaceFile("IDENTITY.md"),
  readWorkspaceFile("SOUL.md"),
]
  .filter(Boolean)
  .join("\n\n");

const TELEGRAM_INSTRUCTIONS = readWorkspaceFile("refs/telegram.md");

// ---- Session classifier ----

function isMessagingSession(sessionKey?: string): boolean {
  if (!sessionKey) return false;
  if (sessionKey.includes(":cron:")) return false;
  if (sessionKey.endsWith(":main")) return false;
  if (sessionKey.includes(":heartbeat:")) return false;
  return (
    sessionKey.includes(":telegram:") ||
    sessionKey.includes(":discord:") ||
    sessionKey.includes(":slack:") ||
    sessionKey.includes(":whatsapp:") ||
    sessionKey.includes(":signal:") ||
    sessionKey.includes(":imessage:")
  );
}

function isCronSession(sessionKey?: string): boolean {
  if (!sessionKey) return false;
  return sessionKey.includes(":cron:");
}

function isLogChannelSession(sessionKey: string, logChatId: string): boolean {
  if (!logChatId) return false;
  return sessionKey.includes(logChatId);
}

// ---- Telegram log helper ----

async function sendTgLog(
  botToken: string,
  chatId: string,
  text: string,
  logger: { warn: (m: string) => void },
): Promise<void> {
  if (!botToken || !chatId) return;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn(`mc-queue: tg log failed ${res.status}: ${body.slice(0, 200)}`);
    }
  } catch (e) {
    logger.warn(`mc-queue: tg log error: ${e}`);
  }
}

// ---- Board event detection ----

type BoardEvent =
  | { kind: "ship"; cardId: string; title: string; projectId?: string }
  | { kind: "human_needed"; cardId: string; title: string; reason: string; projectId?: string };

/** Look up a card's project_id from the brain cards directory. Best-effort, returns "" if not found. */
function lookupCardProjectId(cardId: string): string {
  try {
    const cardsDir = path.join(OPENCLAW_STATE_DIR, "USER", "brain", "cards");
    const files = fs.readdirSync(cardsDir).filter(f => f.startsWith(cardId) && f.endsWith(".md"));
    if (!files.length) return "";
    const content = fs.readFileSync(path.join(cardsDir, files[0]), "utf8");
    const m = content.match(/^project_id:\s*(.+)$/m);
    return m ? m[1].trim() : "";
  } catch {
    return "";
  }
}

function formatBoardEvent(ev: BoardEvent, boardUrl: string): string {
  const projectId = ev.projectId || lookupCardProjectId(ev.cardId);
  const cardPath = projectId
    ? `/board/${projectId}/${ev.cardId}`
    : `/board/${ev.cardId}`;
  const fullUrl = boardUrl ? boardUrl.replace(/\/$/, "") + cardPath : "";
  const link = fullUrl ? ` — <a href="${fullUrl}">${ev.cardId}</a>` : "";
  switch (ev.kind) {
    case "ship":
      return `🚀 Shipped: <b>${ev.title || ev.cardId}</b>${link}`;
    case "human_needed":
      return `🚨 <b>Human needed:</b> <code>${ev.cardId}</code> ${ev.title ? "— " + ev.title : ""}\n${ev.reason}${link}`;
  }
}

// BLOCKER_PATTERNS — if any match in the notes field, it's human-needed
const BLOCKER_PATTERNS = [
  /\bBLOCKED\b/i,
  /\bneeds? human\b/i,
  /\bhuman (review|decision|input|approval|needed)\b/i,
  /\bawaiting (human|michael|approval)\b/i,
  /\bescalat/i,
];

function parseBrainTool(
  toolName: string,
  params: Record<string, unknown>,
): BoardEvent | null {
  // Only care about ship events and human-needed updates
  if (toolName === "brain_move_card") {
    const col = String(params.column ?? "");
    if (col === "shipped") {
      const id = String(params.id ?? params.card_id ?? "");
      const title = String(params.title ?? "");
      return { kind: "ship", cardId: id, title };
    }
    return null;
  }
  if (toolName === "brain_update_card") {
    const notes = String(params.notes ?? "");
    const id = String(params.id ?? params.card_id ?? "");
    const title = String(params.title ?? "");
    if (notes && BLOCKER_PATTERNS.some(p => p.test(notes))) {
      // Extract first line of notes as reason
      const reason = notes.split("\n")[0].slice(0, 200);
      return { kind: "human_needed", cardId: id, title, reason };
    }
    return null;
  }
  return null;
}

function parseBashBoardCommand(cmd: string): BoardEvent | null {
  // mc-board move <id> shipped
  const shipM = cmd.match(/mc-board move\s+(\S+)\s+shipped/);
  if (shipM) return { kind: "ship", cardId: shipM[1], title: "" };
  return null;
}

// ---- Plugin registration ----

export default function register(api: OpenClawPluginApi) {
  const cfg = (api.pluginConfig ?? {}) as {
    enabled?: boolean;
    haikuModel?: string;
    maxToolCallsPerTurn?: number;
    applyToChannels?: boolean;
    applyToDMs?: boolean;
    tgLogChatId?: string;
    tgBotName?: string;
    boardUrl?: string;
  };

  const enabled = cfg.enabled ?? true;
  const haikuModel = cfg.haikuModel ?? "claude-haiku-4-5-20251001";
  const maxToolCallsPerTurn = cfg.maxToolCallsPerTurn ?? 3;
  const applyToChannels = cfg.applyToChannels ?? true;
  const applyToDMs = cfg.applyToDMs ?? true;
  const tgLogChatId = cfg.tgLogChatId ?? "";
  const tgBotName = cfg.tgBotName ?? "";

  // Board URL: env var → plugin config → miniclaw.externalUrl from openclaw.json
  const minclawExternalUrl =
    (api.config as Record<string, unknown> & {
      miniclaw?: { externalUrl?: string };
    })?.miniclaw?.externalUrl ?? "";
  const boardUrl = process.env.MINICLAW_BOARD_URL ?? cfg.boardUrl ?? minclawExternalUrl;

  // Read bot token from OpenClaw's telegram channel config
  const tgBotToken =
    (api.config as Record<string, unknown> & {
      channels?: { telegram?: { botToken?: string } };
    })?.channels?.telegram?.botToken ?? "";

  if (!enabled) {
    api.logger.info("mc-queue loaded (disabled)");
    return;
  }

  api.logger.info(
    `mc-queue loaded (model=${haikuModel}, maxTools=${maxToolCallsPerTurn}, channels=${applyToChannels}, dms=${applyToDMs}, tgLog=${tgLogChatId ? "enabled" : "disabled"})`,
  );

  // Per-turn tool call counter keyed by runId
  const toolCallCounts = new Map<string, number>();

  // ---- 1. Switch messaging sessions to Haiku ----
  api.on("before_model_resolve", async (_event, ctx) => {
    const sessionKey = ctx.sessionKey ?? "";
    if (!isMessagingSession(sessionKey)) return;

    return { model: haikuModel };
  });

  // ---- 2. Inject triage instructions into system prompt ----
  api.on("before_prompt_build", async (_event, ctx) => {
    const sessionKey = ctx.sessionKey ?? "";
    if (!isMessagingSession(sessionKey)) return;

    // Log channel — readonly redirect, no agent triage
    if (isLogChannelSession(sessionKey, tgLogChatId)) {
      return {
        prependContext: `This is a readonly queue log channel. You must respond to any message with exactly this text and nothing else:\n\nChat with ${tgBotName} directly. This is a readonly view of the queue work.`,
      };
    }

    const isDM = sessionKey.includes(":direct:");
    const isGroup =
      sessionKey.includes(":group:") || sessionKey.includes(":channel:");
    if (isDM && !applyToDMs) return;
    if (isGroup && !applyToChannels) return;

    const soulSection = SOUL_CONTEXT
      ? `[WHO YOU ARE]\n${SOUL_CONTEXT}\n\n`
      : "";

    let telegramInstructions = TELEGRAM_INSTRUCTIONS
      || "You are a helpful assistant handling Telegram messages. Be direct, concise, and honest.";

    // Inject dynamic board URL so the agent constructs clickable card deep links.
    // Replaces any hardcoded localhost URL in the workspace template.
    if (boardUrl) {
      const baseUrl = boardUrl.replace(/\/$/, "");
      telegramInstructions = telegramInstructions
        .replace(/http:\/\/myam\.localhost:4220/g, baseUrl)
        .replace(/\{board_url\}/g, baseUrl);
      telegramInstructions +=
        `\n\n## Card links\n` +
        `When referencing a board card, always include a clickable link.\n` +
        `Format: ${baseUrl}/board/{project_id}/{card_id}\n` +
        `If you don't know the project_id, use: ${baseUrl}/board/{card_id}`;
    }

    return {
      prependContext: `${soulSection}[TELEGRAM — mc-queue plugin]\n${telegramInstructions}`,
    };
  });

  // ---- 3. Enforce tool call limit per turn ----
  api.on("before_tool_call", async (event, ctx) => {
    const sessionKey = ctx.sessionKey ?? "";
    if (!isMessagingSession(sessionKey)) return;

    const isDM = sessionKey.includes(":direct:");
    const isGroup =
      sessionKey.includes(":group:") || sessionKey.includes(":channel:");
    if (isDM && !applyToDMs) return;
    if (isGroup && !applyToChannels) return;

    const runId = ctx.runId ?? "unknown";
    const count = (toolCallCounts.get(runId) ?? 0) + 1;
    toolCallCounts.set(runId, count);

    if (count > maxToolCallsPerTurn) {
      api.logger.warn(
        `mc-queue: blocking tool call ${event.toolName} (run ${runId}, call ${count}/${maxToolCallsPerTurn})`,
      );
      return {
        block: true,
        blockReason: `mc-queue: max ${maxToolCallsPerTurn} tool calls per turn in messaging sessions. Create a board card for multi-step work instead.`,
      };
    }

    api.logger.info(
      `mc-queue: tool call ${event.toolName} (run ${runId}, call ${count}/${maxToolCallsPerTurn})`,
    );
  });

  // ---- 4. Log ship/blocked events from cron workers to TG log channel ----
  api.on("after_tool_call", async (event, ctx) => {
    if (!tgLogChatId || !tgBotToken) return;

    const sessionKey = ctx.sessionKey ?? "";
    if (!isCronSession(sessionKey)) return;

    const { toolName, params } = event;

    // brain_* agent tools — only ship + human_needed
    const brainEv = parseBrainTool(toolName, params);
    if (brainEv) {
      await sendTgLog(tgBotToken, tgLogChatId, formatBoardEvent(brainEv, boardUrl), api.logger);
      return;
    }

    // bash/exec/computer: only mc-board ship (board workers use exec, not bash)
    if (toolName === "bash" || toolName === "exec" || toolName === "computer") {
      const cmd = String(params.command ?? params.input ?? "");
      if (cmd.includes("mc-board")) {
        const bashEv = parseBashBoardCommand(cmd);
        if (bashEv) {
          await sendTgLog(tgBotToken, tgLogChatId, formatBoardEvent(bashEv, boardUrl), api.logger);
        }
      }
    }
  });

  // ---- Clean up run tracking on agent end ----
  api.on("agent_end", async (_event, ctx) => {
    const sessionKey = ctx.sessionKey ?? "";
    if (!isMessagingSession(sessionKey)) return;
    if (ctx.sessionId) {
      toolCallCounts.delete(ctx.sessionId);
    }
  });

  // ---- Status command ----
  api.registerCommand({
    name: "queue_status",
    description: "Show mc-queue triage mode configuration",
    acceptsArgs: false,
    handler: () => ({
      text:
        `*mc-queue status*\n` +
        `Enabled: ${enabled}\n` +
        `Model: ${haikuModel}\n` +
        `Max tool calls/turn: ${maxToolCallsPerTurn}\n` +
        `Apply to channels: ${applyToChannels}\n` +
        `Apply to DMs: ${applyToDMs}\n` +
        `TG log channel: ${tgLogChatId || "not configured"}`,
    }),
  });
}
