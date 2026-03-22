import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ChatDatabase } from "./chat-db.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("ChatDatabase", () => {
  let db: ChatDatabase;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "mc-web-chat-test-"));
    db = new ChatDatabase(tempDir);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  const sampleMessages = [
    { role: "user", content: "Hello, how are you?", hasImage: false, timestamp: 1000 },
    { role: "assistant", content: "I'm doing well! How can I help?", hasImage: false, timestamp: 2000 },
    { role: "user", content: "Tell me about TypeScript", hasImage: false, timestamp: 3000 },
    { role: "assistant", content: "TypeScript is a typed superset of JavaScript...", hasImage: false, timestamp: 4000 },
  ];

  // ---------- archiveSession ----------
  describe("archiveSession", () => {
    it("persists messages and extracts title from first user message", () => {
      db.archiveSession("sess-1", sampleMessages, 0.05);

      const result = db.getChat("sess-1");
      expect(result.session).not.toBeNull();
      expect(result.session!.title).toBe("Hello, how are you?");
      expect(result.session!.message_count).toBe(4);
      expect(result.session!.total_cost).toBeCloseTo(0.05);
      expect(result.messages).toHaveLength(4);
    });

    it("extracts preview from last message", () => {
      db.archiveSession("sess-1", sampleMessages, 0);
      const result = db.getChat("sess-1");
      expect(result.session!.preview).toContain("TypeScript is a typed superset");
    });

    it("handles empty messages array", () => {
      db.archiveSession("sess-empty", [], 0);
      const result = db.getChat("sess-empty");
      expect(result.session).toBeNull();
    });

    it("uses 'Untitled chat' when no user message exists", () => {
      const msgs = [
        { role: "assistant", content: "Starting up...", hasImage: false, timestamp: 1000 },
      ];
      db.archiveSession("sess-no-user", msgs, 0);
      const result = db.getChat("sess-no-user");
      expect(result.session!.title).toBe("Untitled chat");
    });

    it("stores hasImage flag correctly", () => {
      const msgs = [
        { role: "user", content: "Look at this", hasImage: true, timestamp: 1000 },
        { role: "assistant", content: "I see", hasImage: false, timestamp: 2000 },
      ];
      db.archiveSession("sess-img", msgs, 0);
      const result = db.getChat("sess-img");
      expect(result.messages[0].has_image).toBe(1);
      expect(result.messages[1].has_image).toBe(0);
    });
  });

  // ---------- listChats ----------
  describe("listChats", () => {
    it("returns empty list when no chats exist", () => {
      const result = db.listChats();
      expect(result.chats).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it("paginates correctly", () => {
      // Archive 5 sessions
      for (let i = 0; i < 5; i++) {
        const msgs = [
          { role: "user", content: `Chat ${i}`, hasImage: false, timestamp: 1000 + i * 1000 },
          { role: "assistant", content: `Reply ${i}`, hasImage: false, timestamp: 2000 + i * 1000 },
        ];
        db.archiveSession(`sess-${i}`, msgs, 0);
      }

      const page1 = db.listChats(2, 0);
      expect(page1.total).toBe(5);
      expect(page1.chats).toHaveLength(2);

      const page2 = db.listChats(2, 2);
      expect(page2.total).toBe(5);
      expect(page2.chats).toHaveLength(2);

      const page3 = db.listChats(2, 4);
      expect(page3.total).toBe(5);
      expect(page3.chats).toHaveLength(1);
    });

    it("orders by updated_at DESC", () => {
      // Create sessions with different timestamps
      db.archiveSession("old", [
        { role: "user", content: "old", hasImage: false, timestamp: 1000 },
        { role: "assistant", content: "old reply", hasImage: false, timestamp: 2000 },
      ], 0);
      db.archiveSession("new", [
        { role: "user", content: "new", hasImage: false, timestamp: 5000 },
        { role: "assistant", content: "new reply", hasImage: false, timestamp: 6000 },
      ], 0);

      const result = db.listChats();
      expect(result.chats[0].id).toBe("new");
      expect(result.chats[1].id).toBe("old");
    });
  });

  // ---------- getChat ----------
  describe("getChat", () => {
    it("returns full message history in timestamp order", () => {
      db.archiveSession("sess-1", sampleMessages, 0.05);
      const result = db.getChat("sess-1");
      expect(result.messages).toHaveLength(4);
      // Verify timestamp ascending order
      for (let i = 1; i < result.messages.length; i++) {
        expect(result.messages[i].timestamp).toBeGreaterThan(result.messages[i - 1].timestamp);
      }
    });

    it("returns null session for nonexistent chat", () => {
      const result = db.getChat("nonexistent");
      expect(result.session).toBeNull();
      expect(result.messages).toHaveLength(0);
    });

    it("returns correct role and content", () => {
      db.archiveSession("sess-1", sampleMessages, 0);
      const result = db.getChat("sess-1");
      expect(result.messages[0].role).toBe("user");
      expect(result.messages[0].content).toBe("Hello, how are you?");
      expect(result.messages[1].role).toBe("assistant");
    });
  });

  // ---------- deleteChat ----------
  describe("deleteChat", () => {
    it("removes session and messages (cascade)", () => {
      db.archiveSession("sess-del", sampleMessages, 0);
      expect(db.getChat("sess-del").session).not.toBeNull();

      const deleted = db.deleteChat("sess-del");
      expect(deleted).toBe(true);

      const result = db.getChat("sess-del");
      expect(result.session).toBeNull();
      expect(result.messages).toHaveLength(0);
    });

    it("returns false for nonexistent session", () => {
      expect(db.deleteChat("nonexistent")).toBe(false);
    });
  });

  // ---------- re-archive ----------
  describe("re-archive same session", () => {
    it("replaces old messages with new ones", () => {
      db.archiveSession("sess-1", sampleMessages, 0.05);
      expect(db.getChat("sess-1").messages).toHaveLength(4);

      // Re-archive with different messages
      const newMsgs = [
        { role: "user", content: "Updated first msg", hasImage: false, timestamp: 5000 },
        { role: "assistant", content: "Updated reply", hasImage: false, timestamp: 6000 },
      ];
      db.archiveSession("sess-1", newMsgs, 0.10);

      const result = db.getChat("sess-1");
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content).toBe("Updated first msg");
      expect(result.session!.total_cost).toBeCloseTo(0.10);
      expect(result.session!.message_count).toBe(2);
    });
  });
});
