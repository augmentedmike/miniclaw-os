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
 *
 * Classification (done by Haiku at runtime, not hardcoded):
 *   IMMEDIATE  — answer from history/knowledge directly
 *   QUICK      — one-tool lookup (KB/QMD/memory), natural "let me check..."
 *   TASK       — multi-step work → board card + natural ack → cron executes
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

// ---- Load workspace soul files at startup ----

function readWorkspaceFile(filename: string): string {
  try {
    return fs.readFileSync(
      path.join(os.homedir(), ".openclaw", "workspace", filename),
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

// ---- Plugin registration ----

export default function register(api: OpenClawPluginApi) {
  const cfg = (api.pluginConfig ?? {}) as {
    enabled?: boolean;
    haikuModel?: string;
    maxToolCallsPerTurn?: number;
    applyToChannels?: boolean;
    applyToDMs?: boolean;
  };

  const enabled = cfg.enabled ?? true;
  const haikuModel = cfg.haikuModel ?? "claude-haiku-4-5-20251001";
  const maxToolCallsPerTurn = cfg.maxToolCallsPerTurn ?? 3;
  const applyToChannels = cfg.applyToChannels ?? true;
  const applyToDMs = cfg.applyToDMs ?? true;

  if (!enabled) {
    api.logger.info("mc-queue loaded (disabled)");
    return;
  }

  api.logger.info(
    `mc-queue loaded (model=${haikuModel}, maxTools=${maxToolCallsPerTurn}, channels=${applyToChannels}, dms=${applyToDMs})`,
  );

  // Per-turn tool call counter keyed by runId
  const toolCallCounts = new Map<string, number>();

  // ---- 1. Switch messaging sessions to Haiku ----
  api.on("before_model_resolve", async (_event, ctx) => {
    const sessionKey = ctx.sessionKey ?? "";
    if (!isMessagingSession(sessionKey)) return;

    const isDM = sessionKey.includes(":direct:");
    const isGroup =
      sessionKey.includes(":group:") || sessionKey.includes(":channel:");
    if (isDM && !applyToDMs) return;
    if (isGroup && !applyToChannels) return;

    return { modelOverride: haikuModel };
  });

  // ---- 2. Inject triage instructions into system prompt ----
  api.on("before_prompt_build", async (_event, ctx) => {
    const sessionKey = ctx.sessionKey ?? "";
    if (!isMessagingSession(sessionKey)) return;

    const isDM = sessionKey.includes(":direct:");
    const isGroup =
      sessionKey.includes(":group:") || sessionKey.includes(":channel:");
    if (isDM && !applyToDMs) return;
    if (isGroup && !applyToChannels) return;

    const soulSection = SOUL_CONTEXT
      ? `[WHO YOU ARE]\n${SOUL_CONTEXT}\n\n`
      : "";

    return {
      prependContext: `${soulSection}[QUEUE TRIAGE — mc-queue plugin]
You are handling an incoming message from your human. Classify it, then respond naturally. Do not announce the classification.

IMMEDIATE — answerable from conversation history or general knowledge, no tools needed:
→ Just answer. No preamble.

QUICK LOOKUP — needs memory/KB search or a simple single-tool check:
→ Say something natural first ("Let me think..." or "One sec...")
→ Do ONE tool call to look it up
→ Reply with what you found ("Ok, found it — ...")

TASK — research, building, writing, deploying, anything multi-step:
→ Use brain_create_card to create a HIGH priority board card with the full task context
→ Acknowledge naturally ("Ok, let me put that on the board and queue it" or similar)
→ Stop. Don't do the work here. The cron workers pick it up within 5 minutes.

You are running as Haiku — fast, responsive. Long work goes to cron. Your job is to be quick and human.`,
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
        `Apply to DMs: ${applyToDMs}`,
    }),
  });
}
