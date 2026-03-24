import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  trimHistory,
  pruneImageFlags,
  buildHistoryReplay,
  shouldRestartForContext,
  MAX_HISTORY,
  MAX_IMAGES_IN_HISTORY,
  IMAGE_PLACEHOLDER,
  CONTEXT_PRESSURE_PCT,
  MIN_TURNS_BEFORE_RESTART,
  TOKEN_BUDGET,
  type HistoryMessage,
  type TrimTarget,
  type ContextCheckTarget,
} from "./chat-utils.js";

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------
describe("estimateTokens", () => {
  it("returns ~1 token per 4 characters", () => {
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2); // ceil(5/4) = 2
    expect(estimateTokens("a".repeat(100))).toBe(25);
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("handles single character", () => {
    expect(estimateTokens("x")).toBe(1); // ceil(1/4) = 1
  });
});

// ---------------------------------------------------------------------------
// trimHistory
// ---------------------------------------------------------------------------
describe("trimHistory", () => {
  function makeMessages(n: number): HistoryMessage[] {
    return Array.from({ length: n }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `msg-${i}`,
      timestamp: 1000 + i,
    }));
  }

  it("does nothing when under MAX_HISTORY", () => {
    const target: TrimTarget = { messages: makeMessages(10) };
    trimHistory(target);
    expect(target.messages).toHaveLength(10);
  });

  it("does nothing when exactly at MAX_HISTORY", () => {
    const target: TrimTarget = { messages: makeMessages(MAX_HISTORY) };
    trimHistory(target);
    expect(target.messages).toHaveLength(MAX_HISTORY);
  });

  it("trims to MAX_HISTORY keeping the most recent messages", () => {
    const target: TrimTarget = { messages: makeMessages(MAX_HISTORY + 5) };
    trimHistory(target);
    expect(target.messages).toHaveLength(MAX_HISTORY);
    // Should keep the last MAX_HISTORY messages (the newest)
    expect(target.messages[0].content).toBe(`msg-5`);
    expect(target.messages[MAX_HISTORY - 1].content).toBe(`msg-${MAX_HISTORY + 4}`);
  });

  it("trims correctly when well over limit", () => {
    const target: TrimTarget = { messages: makeMessages(50) };
    trimHistory(target);
    expect(target.messages).toHaveLength(MAX_HISTORY);
    expect(target.messages[0].content).toBe("msg-20"); // 50 - 30 = 20
  });
});

// ---------------------------------------------------------------------------
// pruneImageFlags
// ---------------------------------------------------------------------------
describe("pruneImageFlags", () => {
  it("keeps the last MAX_IMAGES_IN_HISTORY images flagged", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", content: "img1", hasImage: true, timestamp: 1 },
      { role: "user", content: "img2", hasImage: true, timestamp: 2 },
      { role: "user", content: "img3", hasImage: true, timestamp: 3 },
      { role: "user", content: "img4", hasImage: true, timestamp: 4 },
    ];
    pruneImageFlags(msgs);
    // Last MAX_IMAGES_IN_HISTORY (2) should keep hasImage=true
    expect(msgs[0].hasImage).toBe(false);
    expect(msgs[1].hasImage).toBe(false);
    expect(msgs[2].hasImage).toBe(true);
    expect(msgs[3].hasImage).toBe(true);
  });

  it("does nothing when fewer images than limit", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", content: "text", timestamp: 1 },
      { role: "user", content: "img1", hasImage: true, timestamp: 2 },
    ];
    pruneImageFlags(msgs);
    expect(msgs[0].hasImage).toBeUndefined();
    expect(msgs[1].hasImage).toBe(true);
  });

  it("handles no images", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", content: "text", timestamp: 1 },
      { role: "assistant", content: "reply", timestamp: 2 },
    ];
    pruneImageFlags(msgs);
    expect(msgs[0].hasImage).toBeUndefined();
    expect(msgs[1].hasImage).toBeUndefined();
  });

  it("handles empty array", () => {
    const msgs: HistoryMessage[] = [];
    pruneImageFlags(msgs);
    expect(msgs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// buildHistoryReplay
// ---------------------------------------------------------------------------
describe("buildHistoryReplay", () => {
  it("returns empty string for no messages", () => {
    expect(buildHistoryReplay([])).toBe("");
  });

  it("wraps messages in conversation-history tags", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", content: "hello", timestamp: 1 },
      { role: "assistant", content: "hi there", timestamp: 2 },
    ];
    const result = buildHistoryReplay(msgs);
    expect(result).toContain("<conversation-history>");
    expect(result).toContain("</conversation-history>");
    expect(result).toContain("[user]: hello");
    expect(result).toContain("[assistant]: hi there");
  });

  it("preserves message order", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", content: "first", timestamp: 1 },
      { role: "assistant", content: "second", timestamp: 2 },
      { role: "user", content: "third", timestamp: 3 },
      { role: "assistant", content: "fourth", timestamp: 4 },
    ];
    const result = buildHistoryReplay(msgs);
    const firstIdx = result.indexOf("[user]: first");
    const secondIdx = result.indexOf("[assistant]: second");
    const thirdIdx = result.indexOf("[user]: third");
    const fourthIdx = result.indexOf("[assistant]: fourth");
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
    expect(thirdIdx).toBeLessThan(fourthIdx);
  });

  it("appends image placeholder for messages with images", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", content: "see this", hasImage: true, timestamp: 1 },
    ];
    const result = buildHistoryReplay(msgs);
    expect(result).toContain(IMAGE_PLACEHOLDER);
  });

  it("resolves replyTo to correct parent message", () => {
    const msgs: HistoryMessage[] = [
      { id: "msg-1", role: "user", content: "original question", timestamp: 1 },
      { id: "msg-2", role: "assistant", content: "answer", timestamp: 2 },
      { id: "msg-3", role: "user", content: "followup", timestamp: 3, replyTo: "msg-1" },
    ];
    const result = buildHistoryReplay(msgs);
    expect(result).toContain('replying to user: "original question"');
    expect(result).toContain("followup");
  });

  it("handles replyTo with missing/pruned parent", () => {
    const msgs: HistoryMessage[] = [
      { id: "msg-5", role: "user", content: "reply to gone msg", timestamp: 1, replyTo: "msg-nonexistent" },
    ];
    const result = buildHistoryReplay(msgs);
    expect(result).toContain("replying to a pruned message");
  });

  it("truncates large history keeping first 2 and recent messages", () => {
    // Create messages that exceed 40k token budget
    // Each message ~4000 chars = ~1000 tokens + 10 overhead = 1010 tokens
    // 40+ messages at 1010 tokens each = ~40400 tokens — exceeds 40k
    const msgs: HistoryMessage[] = Array.from({ length: 50 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `message-${i}: ${"x".repeat(4000)}`,
      timestamp: 1000 + i,
    }));
    const result = buildHistoryReplay(msgs);
    // Should contain first 2 messages
    expect(result).toContain("message-0:");
    expect(result).toContain("message-1:");
    // Should contain "earlier messages omitted" separator
    expect(result).toContain("earlier messages omitted");
    // Should contain some recent messages (last ones)
    expect(result).toContain("message-49:");
  });
});

// ---------------------------------------------------------------------------
// shouldRestartForContext
// ---------------------------------------------------------------------------
describe("shouldRestartForContext", () => {
  it("returns false when no process", () => {
    const target: ContextCheckTarget = {
      proc: null,
      lastReportedContextUsed: 700000,
      turnCount: 10,
      contextWindow: TOKEN_BUDGET,
    };
    expect(shouldRestartForContext(target)).toBe(false);
  });

  it("returns false when lastReportedContextUsed is 0", () => {
    const target: ContextCheckTarget = {
      proc: {},
      lastReportedContextUsed: 0,
      turnCount: 10,
      contextWindow: TOKEN_BUDGET,
    };
    expect(shouldRestartForContext(target)).toBe(false);
  });

  it("returns false when turnCount <= MIN_TURNS_BEFORE_RESTART", () => {
    const target: ContextCheckTarget = {
      proc: {},
      lastReportedContextUsed: TOKEN_BUDGET * 0.9,
      turnCount: MIN_TURNS_BEFORE_RESTART,
      contextWindow: TOKEN_BUDGET,
    };
    expect(shouldRestartForContext(target)).toBe(false);
  });

  it("returns true when context usage >= CONTEXT_PRESSURE_PCT", () => {
    const target: ContextCheckTarget = {
      proc: {},
      lastReportedContextUsed: TOKEN_BUDGET * (CONTEXT_PRESSURE_PCT / 100),
      turnCount: MIN_TURNS_BEFORE_RESTART + 1,
      contextWindow: TOKEN_BUDGET,
    };
    expect(shouldRestartForContext(target)).toBe(true);
  });

  it("returns false when context usage below threshold", () => {
    const target: ContextCheckTarget = {
      proc: {},
      lastReportedContextUsed: TOKEN_BUDGET * 0.5,
      turnCount: MIN_TURNS_BEFORE_RESTART + 1,
      contextWindow: TOKEN_BUDGET,
    };
    expect(shouldRestartForContext(target)).toBe(false);
  });
});
