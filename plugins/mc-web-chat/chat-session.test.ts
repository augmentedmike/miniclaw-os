import { describe, it, expect } from "vitest";
import {
  trimHistory,
  pruneImageFlags,
  buildHistoryReplay,
  MAX_HISTORY,
  type HistoryMessage,
  type TrimTarget,
} from "./chat-utils.js";

// ---------------------------------------------------------------------------
// Message ordering — rapid sequential messages maintain correct order
// ---------------------------------------------------------------------------
describe("message ordering", () => {
  it("rapid sequential messages maintain insertion order", () => {
    const session: TrimTarget = { messages: [] };
    const baseTime = Date.now();

    // Simulate rapid-fire message pushes (same millisecond possible)
    for (let i = 0; i < 20; i++) {
      session.messages.push({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `msg-${i}`,
        timestamp: baseTime + i, // ascending — but even if same ms, array order matters
      });
    }

    // Verify insertion order is preserved
    for (let i = 0; i < session.messages.length; i++) {
      expect(session.messages[i].content).toBe(`msg-${i}`);
    }
  });

  it("messages with same timestamp maintain array insertion order", () => {
    const session: TrimTarget = { messages: [] };
    const sameTime = 1700000000000;

    session.messages.push({ role: "user", content: "first", timestamp: sameTime });
    session.messages.push({ role: "assistant", content: "second", timestamp: sameTime });
    session.messages.push({ role: "user", content: "third", timestamp: sameTime });

    expect(session.messages[0].content).toBe("first");
    expect(session.messages[1].content).toBe("second");
    expect(session.messages[2].content).toBe("third");
  });

  it("trimHistory preserves order of remaining messages", () => {
    const session: TrimTarget = { messages: [] };
    for (let i = 0; i < MAX_HISTORY + 10; i++) {
      session.messages.push({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `msg-${i}`,
        timestamp: 1000 + i,
      });
    }

    trimHistory(session);

    // After trim, remaining messages should still be in order
    for (let i = 1; i < session.messages.length; i++) {
      expect(session.messages[i].timestamp).toBeGreaterThan(session.messages[i - 1].timestamp);
    }

    // First remaining message should be msg-10 (since we had 40, trim to 30, drop first 10)
    expect(session.messages[0].content).toBe("msg-10");
  });

  it("buildHistoryReplay preserves chronological order in output", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", content: "alpha", timestamp: 100 },
      { role: "assistant", content: "beta", timestamp: 200 },
      { role: "user", content: "gamma", timestamp: 300 },
      { role: "assistant", content: "delta", timestamp: 400 },
    ];
    const replay = buildHistoryReplay(msgs);
    const alphaIdx = replay.indexOf("alpha");
    const betaIdx = replay.indexOf("beta");
    const gammaIdx = replay.indexOf("gamma");
    const deltaIdx = replay.indexOf("delta");

    expect(alphaIdx).toBeLessThan(betaIdx);
    expect(betaIdx).toBeLessThan(gammaIdx);
    expect(gammaIdx).toBeLessThan(deltaIdx);
  });
});

// ---------------------------------------------------------------------------
// Connection state — join/close/rejoin session simulation
// ---------------------------------------------------------------------------
describe("connection state simulation", () => {
  // We simulate session state transitions without a real WebSocket server.
  // The key invariant: session.ws = null on close, session restored on rejoin.

  interface MockSession {
    id: string;
    ws: { readyState: number } | null;
    messages: HistoryMessage[];
    awaitingResult: boolean;
    lastActivity: number;
    totalCost: number;
  }

  function newMockSession(): MockSession {
    return {
      id: "test-session-id",
      ws: { readyState: 1 }, // WebSocket.OPEN = 1
      messages: [],
      awaitingResult: false,
      lastActivity: Date.now(),
      totalCost: 0,
    };
  }

  it("join creates session with active websocket", () => {
    const session = newMockSession();
    expect(session.ws).not.toBeNull();
    expect(session.id).toBeTruthy();
    expect(session.messages).toHaveLength(0);
  });

  it("close sets ws to null but preserves session", () => {
    const session = newMockSession();
    session.messages.push({ role: "user", content: "hello", timestamp: 1 });
    session.messages.push({ role: "assistant", content: "hi", timestamp: 2 });

    // Simulate close
    session.ws = null;

    expect(session.ws).toBeNull();
    expect(session.messages).toHaveLength(2);
    expect(session.id).toBe("test-session-id");
  });

  it("rejoin with sessionId restores ws and replays history", () => {
    const sessions = new Map<string, MockSession>();
    const session = newMockSession();
    sessions.set(session.id, session);

    // Add some history
    session.messages.push({ role: "user", content: "hello", timestamp: 1 });
    session.messages.push({ role: "assistant", content: "hi", timestamp: 2 });

    // Simulate close
    session.ws = null;

    // Simulate rejoin
    const rid = "test-session-id";
    const existingSession = sessions.get(rid);
    expect(existingSession).toBeDefined();

    existingSession!.ws = { readyState: 1 };
    existingSession!.lastActivity = Date.now();

    // Verify resumed state
    expect(existingSession!.ws).not.toBeNull();
    expect(existingSession!.messages).toHaveLength(2);
    expect(existingSession!.messages[0].content).toBe("hello");

    // Would send: { type: "joined", resumed: true, history: session.messages }
    const joinResponse = {
      type: "joined",
      sessionId: existingSession!.id,
      resumed: true,
      history: existingSession!.messages,
    };
    expect(joinResponse.resumed).toBe(true);
    expect(joinResponse.history).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Message queuing — messages queued when awaitingResult=true
// ---------------------------------------------------------------------------
describe("message queuing", () => {
  interface QueueSession {
    messages: HistoryMessage[];
    awaitingResult: boolean;
    messageQueue: string[];
    lastActivity: number;
  }

  function handleChat(session: QueueSession, content: string, msgId?: string, replyTo?: string) {
    session.messages.push({
      id: msgId,
      role: "user",
      content,
      timestamp: Date.now(),
      ...(replyTo ? { replyTo } : {}),
    });
    trimHistory(session);
    pruneImageFlags(session.messages);
    session.lastActivity = Date.now();

    if (session.awaitingResult) {
      session.messageQueue.push(content);
      return { type: "queued", position: session.messageQueue.length };
    }
    session.awaitingResult = true;
    return { type: "sent" };
  }

  it("first message is sent directly", () => {
    const session: QueueSession = {
      messages: [], awaitingResult: false, messageQueue: [], lastActivity: 0,
    };
    const result = handleChat(session, "hello");
    expect(result.type).toBe("sent");
    expect(session.awaitingResult).toBe(true);
    expect(session.messageQueue).toHaveLength(0);
  });

  it("second message while awaiting is queued", () => {
    const session: QueueSession = {
      messages: [], awaitingResult: false, messageQueue: [], lastActivity: 0,
    };
    handleChat(session, "first");
    const result = handleChat(session, "second");
    expect(result.type).toBe("queued");
    expect(result).toHaveProperty("position", 1);
    expect(session.messageQueue).toHaveLength(1);
    expect(session.messageQueue[0]).toBe("second");
  });

  it("multiple queued messages have ascending positions", () => {
    const session: QueueSession = {
      messages: [], awaitingResult: false, messageQueue: [], lastActivity: 0,
    };
    handleChat(session, "first");
    const r1 = handleChat(session, "second");
    const r2 = handleChat(session, "third");
    expect(r1).toHaveProperty("position", 1);
    expect(r2).toHaveProperty("position", 2);
    expect(session.messageQueue).toEqual(["second", "third"]);
  });

  it("dequeue on result processes next message", () => {
    const session: QueueSession = {
      messages: [], awaitingResult: false, messageQueue: [], lastActivity: 0,
    };
    handleChat(session, "first");
    handleChat(session, "second");
    handleChat(session, "third");

    // Simulate result received — dequeue next
    session.awaitingResult = false;
    if (session.messageQueue.length > 0) {
      const next = session.messageQueue.shift()!;
      expect(next).toBe("second");
      session.awaitingResult = true;
    }
    expect(session.messageQueue).toEqual(["third"]);
  });
});

// ---------------------------------------------------------------------------
// Edit message — truncates history and replays with new content
// ---------------------------------------------------------------------------
describe("edit message", () => {
  function simulateEdit(messages: HistoryMessage[], newContent: string): {
    truncatedMessages: HistoryMessage[];
    truncatedAt: number;
    newMessage: HistoryMessage;
  } {
    // Find the last user message index
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") { lastUserIdx = i; break; }
    }

    if (lastUserIdx < 0) throw new Error("No user message to edit");

    // Truncate: remove the last user message and everything after it
    const truncatedMessages = messages.slice(0, lastUserIdx);
    const newMessage: HistoryMessage = {
      role: "user",
      content: newContent,
      timestamp: Date.now(),
    };

    return { truncatedMessages, truncatedAt: lastUserIdx, newMessage };
  }

  it("truncates at last user message", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", content: "hello", timestamp: 1 },
      { role: "assistant", content: "hi", timestamp: 2 },
      { role: "user", content: "wrong message", timestamp: 3 },
      { role: "assistant", content: "reply to wrong", timestamp: 4 },
    ];

    const result = simulateEdit(msgs, "corrected message");
    expect(result.truncatedAt).toBe(2); // index of "wrong message"
    expect(result.truncatedMessages).toHaveLength(2);
    expect(result.truncatedMessages[0].content).toBe("hello");
    expect(result.truncatedMessages[1].content).toBe("hi");
    expect(result.newMessage.content).toBe("corrected message");
  });

  it("handles edit when only one user message exists", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", content: "only message", timestamp: 1 },
      { role: "assistant", content: "only reply", timestamp: 2 },
    ];

    const result = simulateEdit(msgs, "edited only message");
    expect(result.truncatedAt).toBe(0);
    expect(result.truncatedMessages).toHaveLength(0);
    expect(result.newMessage.content).toBe("edited only message");
  });

  it("preserves earlier conversation when editing last message", () => {
    const msgs: HistoryMessage[] = [
      { role: "user", content: "first", timestamp: 1 },
      { role: "assistant", content: "first reply", timestamp: 2 },
      { role: "user", content: "second", timestamp: 3 },
      { role: "assistant", content: "second reply", timestamp: 4 },
      { role: "user", content: "third (to edit)", timestamp: 5 },
    ];

    const result = simulateEdit(msgs, "third (edited)");
    expect(result.truncatedMessages).toHaveLength(4);
    expect(result.truncatedMessages[3].content).toBe("second reply");
  });
});

// ---------------------------------------------------------------------------
// Reply reference — replyTo resolves to correct parent
// ---------------------------------------------------------------------------
describe("reply references", () => {
  it("replyTo resolves to correct parent in buildHistoryReplay", () => {
    const msgs: HistoryMessage[] = [
      { id: "a", role: "user", content: "What is TypeScript?", timestamp: 1 },
      { id: "b", role: "assistant", content: "TypeScript is a typed superset of JavaScript", timestamp: 2 },
      { id: "c", role: "user", content: "Can you elaborate?", timestamp: 3, replyTo: "b" },
    ];

    const result = buildHistoryReplay(msgs);
    expect(result).toContain('replying to assistant: "TypeScript is a typed superset of JavaScript"');
  });

  it("handles missing parent gracefully", () => {
    const msgs: HistoryMessage[] = [
      { id: "x", role: "user", content: "reply to deleted", timestamp: 1, replyTo: "deleted-id" },
    ];

    const result = buildHistoryReplay(msgs);
    expect(result).toContain("replying to a pruned message");
    expect(result).toContain("reply to deleted");
  });

  it("long parent content is truncated to 60 chars in snippet", () => {
    const longContent = "A".repeat(100);
    const msgs: HistoryMessage[] = [
      { id: "long", role: "assistant", content: longContent, timestamp: 1 },
      { id: "reply", role: "user", content: "my reply", timestamp: 2, replyTo: "long" },
    ];

    const result = buildHistoryReplay(msgs);
    // Snippet should be 60 chars + "..."
    expect(result).toContain("A".repeat(60) + "...");
  });
});

// ---------------------------------------------------------------------------
// resume_chat — archived session restored with correct message history
// ---------------------------------------------------------------------------
describe("resume_chat simulation", () => {
  it("restores archived messages into session in correct order", () => {
    // Simulate what resume_chat does: load archived messages, map to HistoryMessage[]
    const archivedMessages = [
      { id: 1, session_id: "sess-1", role: "user", content: "hi", has_image: 0, timestamp: 1000 },
      { id: 2, session_id: "sess-1", role: "assistant", content: "hello", has_image: 0, timestamp: 2000 },
      { id: 3, session_id: "sess-1", role: "user", content: "help", has_image: 1, timestamp: 3000 },
    ];

    const restoredMessages: HistoryMessage[] = archivedMessages.map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      hasImage: m.has_image === 1,
      timestamp: m.timestamp,
    }));

    expect(restoredMessages).toHaveLength(3);
    expect(restoredMessages[0].content).toBe("hi");
    expect(restoredMessages[1].content).toBe("hello");
    expect(restoredMessages[2].hasImage).toBe(true);

    // Verify timestamps are ascending (from SQLite ORDER BY timestamp ASC)
    for (let i = 1; i < restoredMessages.length; i++) {
      expect(restoredMessages[i].timestamp).toBeGreaterThan(restoredMessages[i - 1].timestamp);
    }
  });

  it("buildHistoryReplay works correctly with restored messages", () => {
    const restored: HistoryMessage[] = [
      { role: "user", content: "original question", timestamp: 1000 },
      { role: "assistant", content: "original answer", timestamp: 2000 },
      { role: "user", content: "follow-up", timestamp: 3000 },
      { role: "assistant", content: "follow-up answer", timestamp: 4000 },
    ];

    const replay = buildHistoryReplay(restored);
    expect(replay).toContain("<conversation-history>");
    expect(replay).toContain("original question");
    expect(replay).toContain("follow-up answer");

    // Verify order preserved
    const q = replay.indexOf("original question");
    const a = replay.indexOf("follow-up answer");
    expect(q).toBeLessThan(a);
  });

  it("session ID is reassigned to match archived session", () => {
    // Simulate the resume_chat session ID swap
    const newSessionId = "new-random-uuid";
    const archivedSessionId = "archived-session-uuid";

    const sessions = new Map<string, { id: string; messages: HistoryMessage[] }>();
    sessions.set(newSessionId, { id: newSessionId, messages: [] });

    // Delete new session from map
    sessions.delete(newSessionId);
    // Re-insert with archived ID
    const session = { id: archivedSessionId, messages: [] };
    sessions.set(archivedSessionId, session);

    expect(sessions.has(archivedSessionId)).toBe(true);
    expect(sessions.has(newSessionId)).toBe(false);
    expect(sessions.get(archivedSessionId)!.id).toBe(archivedSessionId);
  });
});
