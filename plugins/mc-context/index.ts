/**
 * mc-context — miniclaw plugin
 * Engineered context windows for channel sessions.
 *
 * Phase 1: prependContext only (QMD injection + context summary).
 * Phase 2: messages return (requires openclaw fork with messages? in hook result).
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import {
  isChannelSession,
  messageHasImage,
  stripImages,
  pruneImages,
} from "./src/context.js";

// ---- Time filter ----

function getMessageTimestamp(msg: unknown): number | null {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;
  if (typeof m.createdAt === "number") return m.createdAt;
  if (typeof m.timestamp === "number") return m.timestamp;
  if (typeof m.ts === "number") return m.ts;
  return null;
}

function filterByTimeWindow(
  messages: unknown[],
  windowMinutes: number,
  minMessages: number,
): unknown[] {
  const cutoff = Date.now() - windowMinutes * 60 * 1000;
  // Always keep the last minMessages regardless of age
  const alwaysKeep = messages.slice(-minMessages);
  const alwaysKeepStart = messages.length - alwaysKeep.length;

  return messages.filter((msg, idx) => {
    if (idx >= alwaysKeepStart) return true; // always keep recent N
    const ts = getMessageTimestamp(msg);
    if (ts === null) return true; // no timestamp = keep (can't filter)
    return ts >= cutoff;
  });
}

// ---- Tool-pair integrity repair ----
// Anthropic requires every tool_result to have a corresponding tool_use in the
// immediately preceding assistant message. Time-window filtering can orphan them.
//
// Messages arrive in pi-agent-core's INTERNAL format (not Anthropic API format):
//   - tool call:   role="assistant", content[].type === "toolCall", content[].id
//   - tool result: role="toolResult", toolCallId (top-level field)

function getAssistantToolCallIds(msg: unknown): Set<string> {
  if (!msg || typeof msg !== "object") return new Set();
  const m = msg as Record<string, unknown>;
  if (m.role !== "assistant" || !Array.isArray(m.content)) return new Set();
  const ids = new Set<string>();
  for (const block of m.content) {
    if (
      block &&
      typeof block === "object" &&
      (block as Record<string, unknown>).type === "toolCall"
    ) {
      const id = (block as Record<string, unknown>).id;
      if (typeof id === "string") ids.add(id);
    }
  }
  return ids;
}

function getToolResultCallId(msg: unknown): string | null {
  if (!msg || typeof msg !== "object") return null;
  const m = msg as Record<string, unknown>;
  if (m.role !== "toolResult") return null;
  return typeof m.toolCallId === "string" ? m.toolCallId : null;
}

/**
 * Remove orphaned toolResult messages whose corresponding assistant toolCall was
 * filtered out. Returns [repairedMessages, droppedCount].
 */
function repairToolPairs(messages: unknown[]): [unknown[], number] {
  const result: unknown[] = [];
  let dropped = 0;
  // Track tool call IDs from the most recently seen assistant message
  let lastAssistantCallIds = new Set<string>();

  for (const msg of messages) {
    const toolResultCallId = getToolResultCallId(msg);

    if (toolResultCallId === null) {
      // Not a toolResult — pass through and update assistant call ID tracking
      result.push(msg);
      const callIds = getAssistantToolCallIds(msg);
      if (callIds.size > 0) lastAssistantCallIds = callIds;
      continue;
    }

    // This is a toolResult — verify its toolCallId was in the last assistant message
    if (lastAssistantCallIds.has(toolResultCallId)) {
      result.push(msg);
      lastAssistantCallIds.delete(toolResultCallId); // consume so duplicates are caught
    } else {
      // Orphaned toolResult — drop it to avoid API rejection
      dropped++;
    }
  }
  return [result, dropped];
}

// ---- Token estimator (rough: ~4 chars per token) ----

function estimateTokens(msg: unknown): number {
  if (!msg || typeof msg !== "object") return 0;
  const m = msg as Record<string, unknown>;
  let chars = 0;
  if (Array.isArray(m.content)) {
    for (const block of m.content) {
      if (block && typeof block === "object") {
        const b = block as Record<string, unknown>;
        if (typeof b.text === "string") chars += b.text.length;
        // Images: rough estimate of ~1000 tokens each
        if (b.type === "image") chars += 4000;
      }
    }
  } else if (typeof m.content === "string") {
    chars += m.content.length;
  }
  return Math.ceil(chars / 4);
}

// ---- Stats tracker ----

const TTFR_WINDOW = 20; // keep last N response times

interface SessionStats {
  invocations: number;
  messagesDroppedByAge: number;
  imagesPruned: number;
  // Estimated tokens pruned (from dropped messages, ~4 chars/token)
  tokensDroppedByAge: number;
  tokensSavedByImagePrune: number;
  // Real token counts from llm_output usage
  realInputTokensTotal: number;
  realInputTokensWithoutPrune: number;
  llmRuns: number;
  // Time-to-first-response (wall clock: message_received → message_sent)
  ttfrSamples: number[];  // last TTFR_WINDOW values in seconds
  startedAt: Date;
  lastInvokedAt: Date | null;
  lastLlmAt: Date | null;
}

// ---- Plugin registration ----

export default function register(api: OpenClawPluginApi) {
  const cfg = (api.pluginConfig ?? {}) as {
    windowMinutes?: number;
    windowMinMessages?: number;
    maxImagesInHistory?: number;
    imagePlaceholder?: string;
    applyToChannels?: boolean;
    applyToDMs?: boolean;
    replaceMessages?: boolean;
  };

  const windowMinutes = cfg.windowMinutes ?? 60;
  const windowMinMessages = cfg.windowMinMessages ?? 10;
  const maxImagesInHistory = cfg.maxImagesInHistory ?? 2;
  const imagePlaceholder = cfg.imagePlaceholder ?? "[image removed from history]";
  const applyToChannels = cfg.applyToChannels ?? true;
  const applyToDMs = cfg.applyToDMs ?? false;
  const replaceMessages = cfg.replaceMessages ?? false;

  // Cumulative stats (in-memory, resets on restart)
  const stats: SessionStats = {
    invocations: 0,
    messagesDroppedByAge: 0,
    imagesPruned: 0,
    tokensDroppedByAge: 0,
    tokensSavedByImagePrune: 0,
    realInputTokensTotal: 0,
    realInputTokensWithoutPrune: 0,
    llmRuns: 0,
    ttfrSamples: [],
    startedAt: new Date(),
    lastInvokedAt: null,
    lastLlmAt: null,
  };

  // Per-run scratch: track what we dropped so we can credit it when llm_output fires
  const pendingPrunedTokens = new Map<string, number>(); // sessionKey → estimated pruned tokens

  // TTFR: wall-clock recv time keyed by "channelId:conversationId"
  const recvTimes = new Map<string, number>();

  api.logger.info(
    `mc-context loaded (replaceMessages=${replaceMessages}, window=${windowMinutes}m, maxImages=${maxImagesInHistory})`,
  );

  api.on("before_prompt_build", async (event, ctx) => {
    const isChannel = isChannelSession(ctx.sessionKey);

    if (isChannel && !applyToChannels) return;
    if (!isChannel && !applyToDMs) return;

    const messages = event.messages as unknown[];
    const totalBefore = messages.length;

    // 1. Apply time window
    const windowed = filterByTimeWindow(messages, windowMinutes, windowMinMessages);

    // 2. Strip old images
    const afterImagePrune = pruneImages(windowed, maxImagesInHistory, imagePlaceholder);

    // 3. Repair tool_use/tool_result pairs broken by time-window filtering.
    // Must run AFTER time filter but BEFORE returning messages to avoid API rejection.
    const [pruned, droppedByToolRepair] = repairToolPairs(afterImagePrune);

    const droppedByAge = totalBefore - windowed.length;
    const imagesBefore = messages.filter(messageHasImage).length;
    const imagesAfter = pruned.filter(messageHasImage).length;
    const imagesPruned = imagesBefore - imagesAfter;

    // Estimate tokens pruned this run (for crediting when llm_output fires)
    const droppedMessages = messages.slice(0, totalBefore - windowed.length);
    const tokensDropped = droppedMessages.reduce((sum, m) => sum + estimateTokens(m), 0);
    const tokensSavedImages = imagesPruned * 1000;
    const totalEstPruned = tokensDropped + tokensSavedImages;

    // Stash under sessionKey so llm_output can credit it
    if (ctx.sessionKey && totalEstPruned > 0) {
      pendingPrunedTokens.set(ctx.sessionKey, totalEstPruned);
    }

    // Update cumulative stats
    stats.invocations++;
    stats.messagesDroppedByAge += droppedByAge;
    stats.imagesPruned += imagesPruned;
    stats.tokensDroppedByAge += tokensDropped;
    stats.tokensSavedByImagePrune += tokensSavedImages;
    stats.lastInvokedAt = new Date();

    api.logger.info(
      `mc-context: channel=${isChannel} messages=${totalBefore}→${pruned.length} ` +
        `(dropped by age: ${droppedByAge}, tool-pair repair: ${droppedByToolRepair}, ` +
        `images pruned: ${imagesPruned}, ~${tokensDropped} tokens saved)`,
    );

    // 3. Build context summary for prependContext
    const contextParts: string[] = [];

    if (droppedByAge > 0 || imagesPruned > 0 || droppedByToolRepair > 0) {
      let summary = `[Context window: showing ${pruned.length} of ${totalBefore} messages`;
      if (droppedByAge > 0) summary += `, ${droppedByAge} older than ${windowMinutes}min dropped`;
      if (droppedByToolRepair > 0) summary += `, ${droppedByToolRepair} orphaned tool-result messages removed`;
      if (imagesPruned > 0) summary += `, ${imagesPruned} old images replaced with placeholders`;
      summary += `]`;
      contextParts.push(summary);
    }

    // Inject TTFR hint so AM has visibility into its own response latency
    if (stats.ttfrSamples.length > 0) {
      const s = stats.ttfrSamples;
      const last = s[s.length - 1].toFixed(1);
      const avg = (s.reduce((a, b) => a + b, 0) / s.length).toFixed(1);
      const min = Math.min(...s).toFixed(1);
      const max = Math.max(...s).toFixed(1);
      contextParts.push(
        `[Response latency: last=${last}s, avg=${avg}s, min=${min}s, max=${max}s over ${s.length} runs]`,
      );
    }

    const result: {
      prependContext?: string;
      messages?: unknown[];
    } = {};

    if (contextParts.length > 0) {
      result.prependContext = contextParts.join(" ");
    }

    // 4. Return engineered messages only when something actually changed.
    // CRITICAL: if nothing was trimmed, do NOT return messages — returning the
    // same-length array still busts Anthropic's prefix cache because the object
    // reference changes. Only replace when we've genuinely shortened the history.
    if (replaceMessages && (droppedByAge > 0 || imagesPruned > 0 || droppedByToolRepair > 0)) {
      result.messages = pruned as never;
    }

    return result;
  });

  // Track real token usage from LLM responses
  api.on("llm_output", async (event, ctx) => {
    const inputTokens = event.usage?.input ?? 0;
    if (inputTokens === 0) return;

    const pruned = ctx.sessionKey ? (pendingPrunedTokens.get(ctx.sessionKey) ?? 0) : 0;
    if (ctx.sessionKey) pendingPrunedTokens.delete(ctx.sessionKey);

    stats.llmRuns++;
    stats.realInputTokensTotal += inputTokens;
    stats.realInputTokensWithoutPrune += inputTokens + pruned;
    stats.lastLlmAt = new Date();

    api.logger.info(
      `mc-context: real input=${inputTokens} tokens, est pruned=${pruned}, ` +
      `cumulative sent=${stats.realInputTokensTotal} vs without-prune=${stats.realInputTokensWithoutPrune}`,
    );
  });

  // Track wall-clock time from message received → message sent (TTFR)
  api.on("message_received", (_event, ctx) => {
    const key = `${ctx.channelId}:${ctx.conversationId ?? "default"}`;
    recvTimes.set(key, Date.now());
  });

  api.on("message_sent", (event, ctx) => {
    if (!event.success) return;
    const key = `${ctx.channelId}:${ctx.conversationId ?? "default"}`;
    const recvAt = recvTimes.get(key);
    if (recvAt === undefined) return;
    recvTimes.delete(key);
    const elapsedSec = (Date.now() - recvAt) / 1000;
    stats.ttfrSamples.push(elapsedSec);
    if (stats.ttfrSamples.length > TTFR_WINDOW) {
      stats.ttfrSamples.shift();
    }
    api.logger.info(`mc-context: TTFR=${elapsedSec.toFixed(1)}s (${stats.ttfrSamples.length} samples)`);
  });

  // Stats command
  api.registerCommand({
    name: "context_stats",
    description: "Show mc-context pruning stats for this session",
    acceptsArgs: false,
    handler: () => {
      const uptimeMs = Date.now() - stats.startedAt.getTime();
      const uptimeMin = Math.round(uptimeMs / 60000);
      const lastSeen = stats.lastInvokedAt
        ? `${Math.round((Date.now() - stats.lastInvokedAt.getTime()) / 1000)}s ago`
        : "never";

      const hasRealData = stats.llmRuns > 0;
      const realSaved = stats.realInputTokensWithoutPrune - stats.realInputTokensTotal;
      const realSavePct = stats.realInputTokensWithoutPrune > 0
        ? Math.round((realSaved / stats.realInputTokensWithoutPrune) * 100)
        : 0;

      const realSection = hasRealData
        ? `📊 *Real token data* (${stats.llmRuns} LLM runs)\n` +
          `  • Sent to model: ${stats.realInputTokensTotal.toLocaleString()}\n` +
          `  • Est. without pruning: ${stats.realInputTokensWithoutPrune.toLocaleString()}\n` +
          `  • Saved: ~${realSaved.toLocaleString()} (${realSavePct}%)\n`
        : `📊 Real token data: no LLM runs yet this session\n`;

      const s = stats.ttfrSamples;
      const ttfrSection =
        s.length > 0
          ? `⏱️ *Response latency* (${s.length} samples)\n` +
            `  • Last: ${s[s.length - 1].toFixed(1)}s\n` +
            `  • Avg: ${(s.reduce((a, b) => a + b, 0) / s.length).toFixed(1)}s\n` +
            `  • Min: ${Math.min(...s).toFixed(1)}s  Max: ${Math.max(...s).toFixed(1)}s\n`
          : `⏱️ Response latency: no samples yet\n`;

      return {
        text:
          `*mc-context stats* (since restart, ~${uptimeMin}min ago)\n\n` +
          realSection +
          `\n` +
          ttfrSection +
          `\n✂️ Messages dropped (age): ${stats.messagesDroppedByAge}\n` +
          `🖼️ Images pruned: ${stats.imagesPruned}\n` +
          `🔁 Hook invocations: ${stats.invocations}\n` +
          `⏱️ Last invoked: ${lastSeen}`,
      };
    },
  });

  // Config status command
  api.registerCommand({
    name: "context_status",
    description: "Show mc-context window configuration",
    acceptsArgs: false,
    handler: () => ({
      text:
        `*mc-context config*\n` +
        `Window: ${windowMinutes}min (min ${windowMinMessages} messages)\n` +
        `Max images: ${maxImagesInHistory}\n` +
        `Apply to channels: ${applyToChannels}\n` +
        `Apply to DMs: ${applyToDMs}\n` +
        `Replace messages (fork): ${replaceMessages}`,
    }),
  });
}
