/**
 * telegram-log-client.test.ts
 *
 * Unit tests for TelegramLogClient.
 * Run with: npx vitest run lib/__tests__/telegram-log-client.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TelegramLogClient, createLogClientFromEnv } from "../telegram-log-client";

describe("TelegramLogClient", () => {
  const botToken = "123:ABC-XYZ";
  const chatId = "-1001234567890";

  let mockLogger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    global.fetch = vi.fn() as any;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("constructor", () => {
    it("creates a client with configuration", () => {
      const client = new TelegramLogClient({ botToken, chatId, logger: mockLogger });
      expect(client).toBeDefined();
    });

    it("handles missing logger gracefully", () => {
      const client = new TelegramLogClient({ botToken, chatId });
      expect(client).toBeDefined();
    });
  });

  describe("send", () => {
    it("sends a message with HTML parse mode", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 123 } }),
      });

      const client = new TelegramLogClient({ botToken, chatId, logger: mockLogger });
      const result = await client.send("Test message", { parseMode: "HTML" });

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const call = mockFetch.mock.calls[0];
      expect(call[0]).toContain("sendMessage");
      const body = JSON.parse(call[1].body);
      expect(body.chat_id).toBe(chatId);
      expect(body.text).toBe("Test message");
      expect(body.parse_mode).toBe("HTML");
    });

    it("defaults to HTML parse mode", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 123 } }),
      });

      const client = new TelegramLogClient({ botToken, chatId, logger: mockLogger });
      await client.send("Test");

      const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
      expect(body.parse_mode).toBe("HTML");
    });

    it("disables web page preview by default", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 123 } }),
      });

      const client = new TelegramLogClient({ botToken, chatId, logger: mockLogger });
      await client.send("Test");

      const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
      expect(body.disable_web_page_preview).toBe(true);
    });

    it("allows enabling web page preview", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 123 } }),
      });

      const client = new TelegramLogClient({ botToken, chatId, logger: mockLogger });
      await client.send("Test", { disablePreview: false });

      const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
      expect(body.disable_web_page_preview).toBe(false);
    });

    it("returns false on API error", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      const client = new TelegramLogClient({ botToken, chatId, logger: mockLogger });
      const result = await client.send("Test");

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("returns false on network error", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      const client = new TelegramLogClient({ botToken, chatId, logger: mockLogger });
      const result = await client.send("Test");

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it("returns false on missing configuration", async () => {
      const client = new TelegramLogClient({ botToken: "", chatId, logger: mockLogger });
      const result = await client.send("Test");

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("returns false on empty message", async () => {
      const client = new TelegramLogClient({ botToken, chatId, logger: mockLogger });
      const result = await client.send("", { parseMode: "HTML" });

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it("includes replyToMessageId when provided", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 123 } }),
      });

      const client = new TelegramLogClient({ botToken, chatId, logger: mockLogger });
      await client.send("Test", { replyToMessageId: 42 });

      const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
      expect(body.reply_to_message_id).toBe(42);
    });

    it("includes threadId when provided", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 123 } }),
      });

      const client = new TelegramLogClient({ botToken, chatId, logger: mockLogger });
      await client.send("Test", { threadId: 999 });

      const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
      expect(body.message_thread_id).toBe(999);
    });
  });

  describe("sendBatch", () => {
    it("sends multiple messages", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 123 } }),
      });

      const client = new TelegramLogClient({ botToken, chatId, logger: mockLogger });
      const count = await client.sendBatch(["Message 1", "Message 2", "Message 3"]);

      expect(count).toBe(3);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("counts successful sends only", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, result: { message_id: 123 } }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          text: async () => "Bad request",
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, result: { message_id: 124 } }),
        });

      const client = new TelegramLogClient({ botToken, chatId, logger: mockLogger });
      const count = await client.sendBatch(["M1", "M2", "M3"]);

      expect(count).toBe(2);
    });
  });

  describe("isConfigured", () => {
    it("returns true when both token and chatId are set", () => {
      const client = new TelegramLogClient({ botToken, chatId, logger: mockLogger });
      expect(client.isConfigured()).toBe(true);
    });

    it("returns false when token is missing", () => {
      const client = new TelegramLogClient({ botToken: "", chatId, logger: mockLogger });
      expect(client.isConfigured()).toBe(false);
    });

    it("returns false when chatId is missing", () => {
      const client = new TelegramLogClient({ botToken, chatId: "", logger: mockLogger });
      expect(client.isConfigured()).toBe(false);
    });
  });

  describe("getStatus", () => {
    it("returns status when configured", () => {
      const client = new TelegramLogClient({ botToken, chatId, logger: mockLogger });
      const status = client.getStatus();
      expect(status).toContain("configured");
      expect(status).toContain(chatId);
    });

    it("returns status when botToken missing", () => {
      const client = new TelegramLogClient({ botToken: "", chatId, logger: mockLogger });
      const status = client.getStatus();
      expect(status).toContain("botToken not configured");
    });

    it("returns status when chatId missing", () => {
      const client = new TelegramLogClient({ botToken, chatId: "", logger: mockLogger });
      const status = client.getStatus();
      expect(status).toContain("chatId not configured");
    });
  });

  describe("sendWithButton", () => {
    it("sends a message with inline button", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, result: { message_id: 123 } }),
      });

      const client = new TelegramLogClient({ botToken, chatId, logger: mockLogger });
      const result = await client.sendWithButton(
        "Click me",
        "Go",
        "https://example.com",
      );

      expect(result).toBe(true);
      const body = JSON.parse((mockFetch.mock.calls[0][1] as any).body);
      expect(body.reply_markup.inline_keyboard).toHaveLength(1);
      expect(body.reply_markup.inline_keyboard[0][0].text).toBe("Go");
      expect(body.reply_markup.inline_keyboard[0][0].url).toBe("https://example.com");
    });

    it("returns false on error", async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      const client = new TelegramLogClient({ botToken, chatId, logger: mockLogger });
      const result = await client.sendWithButton("Text", "Button", "http://url");

      expect(result).toBe(false);
    });
  });
});

describe("createLogClientFromEnv", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("creates a client from environment variables", () => {
    process.env.TELEGRAM_BOT_TOKEN_AM = "123:ABC";
    process.env.TELEGRAM_LOG_CHAT_ID = "-999";

    const client = createLogClientFromEnv();
    expect(client).not.toBeNull();
    expect(client?.isConfigured()).toBe(true);
  });

  it("returns null when variables are missing", () => {
    delete process.env.TELEGRAM_BOT_TOKEN_AM;
    delete process.env.TELEGRAM_LOG_CHAT_ID;

    const client = createLogClientFromEnv();
    expect(client).toBeNull();
  });

  it("falls back to generic bot token env var", () => {
    delete process.env.TELEGRAM_BOT_TOKEN_AM;
    process.env.TELEGRAM_BOT_TOKEN = "456:DEF";
    process.env.TELEGRAM_LOG_CHAT_ID = "-999";

    const client = createLogClientFromEnv();
    expect(client).not.toBeNull();
  });
});
