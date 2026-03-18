/**
 * telegram-log-client.ts
 *
 * Reusable Telegram bot client for sending messages to a log/coordination channel.
 *
 * Used by: mc-queue plugin, potentially other plugins that need to log activity
 *
 * Features:
 * - Send log messages to a designated channel
 * - HTML formatting support
 * - Error handling and retry (best-effort)
 * - Logging via openclaw logger
 */

export interface TelegramLogClientConfig {
  botToken: string;
  chatId: string; // Log channel ID (negative number for groups)
  logger?: {
    info?: (msg: string) => void;
    warn?: (msg: string) => void;
    error?: (msg: string) => void;
  };
}

export interface SendOptions {
  parseMode?: "HTML" | "Markdown" | "MarkdownV2";
  disablePreview?: boolean;
  replyToMessageId?: number;
  threadId?: number;
}

export class TelegramLogClient {
  private botToken: string;
  private chatId: string;
  private logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
    error: (msg: string) => void;
  };

  constructor(cfg: TelegramLogClientConfig) {
    this.botToken = cfg.botToken;
    this.chatId = cfg.chatId;

    // Provide default no-op logger if not supplied
    this.logger = cfg.logger || {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  /**
   * Send a message to the log channel.
   * Best-effort — logs errors but doesn't throw.
   */
  async send(text: string, opts: SendOptions = {}): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      this.logger.warn("TelegramLogClient: botToken or chatId not configured");
      return false;
    }

    if (!text) {
      this.logger.warn("TelegramLogClient: empty message text");
      return false;
    }

    try {
      const parseMode = opts.parseMode || "HTML";
      const body = {
        chat_id: this.chatId,
        text: text,
        parse_mode: parseMode,
        disable_web_page_preview: opts.disablePreview ?? true,
        ...(opts.replyToMessageId && { reply_to_message_id: opts.replyToMessageId }),
        ...(opts.threadId && { message_thread_id: opts.threadId }),
      };

      const res = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        this.logger.error(
          `TelegramLogClient: sendMessage failed (${res.status}): ${errorBody.slice(0, 200)}`,
        );
        return false;
      }

      const data = await res.json() as {ok?: boolean; result?: {message_id: number}};
      if (data.ok && data.result?.message_id) {
        this.logger.info(`TelegramLogClient: message sent (msg_id=${data.result.message_id})`);
        return true;
      }

      this.logger.warn(`TelegramLogClient: unexpected response: ${JSON.stringify(data).slice(0, 200)}`);
      return false;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.logger.error(`TelegramLogClient: send failed: ${err}`);
      return false;
    }
  }

  /**
   * Send a message with an inline button.
   * Example use: escalation with "Approve" / "Deny" buttons
   */
  async sendWithButton(
    text: string,
    buttonLabel: string,
    buttonUrl: string,
    opts: SendOptions = {},
  ): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      this.logger.warn("TelegramLogClient: botToken or chatId not configured");
      return false;
    }

    try {
      const parseMode = opts.parseMode || "HTML";
      const body = {
        chat_id: this.chatId,
        text: text,
        parse_mode: parseMode,
        disable_web_page_preview: opts.disablePreview ?? true,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: buttonLabel,
                url: buttonUrl,
              },
            ],
          ],
        },
        ...(opts.replyToMessageId && { reply_to_message_id: opts.replyToMessageId }),
        ...(opts.threadId && { message_thread_id: opts.threadId }),
      };

      const res = await fetch(
        `https://api.telegram.org/bot${this.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        const errorBody = await res.text().catch(() => "");
        this.logger.error(
          `TelegramLogClient: sendWithButton failed (${res.status}): ${errorBody.slice(0, 200)}`,
        );
        return false;
      }

      return true;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.logger.error(`TelegramLogClient: sendWithButton failed: ${err}`);
      return false;
    }
  }

  /**
   * Send multiple messages as a batch.
   * Useful for session summaries or bulk notifications.
   */
  async sendBatch(messages: string[]): Promise<number> {
    let sent = 0;
    for (const msg of messages) {
      if (await this.send(msg)) {
        sent++;
      }
    }
    return sent;
  }

  /**
   * Validate configuration (useful for startup checks).
   */
  isConfigured(): boolean {
    return !!(this.botToken && this.chatId);
  }

  /**
   * Get configuration status string (for logging/debugging).
   */
  getStatus(): string {
    if (!this.botToken) return "botToken not configured";
    if (!this.chatId) return "chatId not configured";
    return `configured (chat=${this.chatId})`;
  }
}

/**
 * Factory: create a log client from environment variables.
 * Useful for plugin startup.
 */
export function createLogClientFromEnv(
  logger?: { info?: (m: string) => void; warn?: (m: string) => void; error?: (m: string) => void },
): TelegramLogClient | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN_AM || process.env.TELEGRAM_BOT_TOKEN || "";
  const chatId = process.env.TELEGRAM_LOG_CHAT_ID || "";

  if (!botToken || !chatId) {
    return null;
  }

  return new TelegramLogClient({ botToken, chatId, logger });
}
