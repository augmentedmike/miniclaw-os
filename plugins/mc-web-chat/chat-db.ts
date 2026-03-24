import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { log } from "./logger.js";

export interface ArchivedChat {
  id: string;
  title: string;
  preview: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  total_cost: number;
}

export interface ArchivedMessage {
  id: number;
  session_id: string;
  role: string;
  content: string;
  has_image: number;
  timestamp: number;
}

export class ChatDatabase {
  private db: Database.Database;

  constructor(stateDir: string) {
    const dbDir = join(stateDir, "data");
    mkdirSync(dbDir, { recursive: true });
    const dbPath = join(dbDir, "chat-history.db");
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        preview TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        message_count INTEGER NOT NULL DEFAULT 0,
        total_cost REAL NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        has_image INTEGER NOT NULL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_chat_messages_session
        ON chat_messages(session_id);
    `);
  }

  /** Archive a chat session's messages to SQLite */
  archiveSession(
    sessionId: string,
    messages: { role: string; content: string; hasImage?: boolean; timestamp: number }[],
    totalCost: number,
  ): void {
    if (messages.length === 0) return;

    const firstUserMsg = messages.find(m => m.role === "user");
    const title = firstUserMsg
      ? firstUserMsg.content.slice(0, 60).replace(/\n/g, " ").trim()
      : "Untitled chat";

    const lastMsg = messages[messages.length - 1];
    const preview = lastMsg.content.slice(0, 120).replace(/\n/g, " ").trim();

    const firstTs = messages[0].timestamp;
    const lastTs = lastMsg.timestamp;
    const createdAt = new Date(firstTs).toISOString();
    const updatedAt = new Date(lastTs).toISOString();

    const insertSession = this.db.prepare(`
      INSERT OR REPLACE INTO chat_sessions (id, title, preview, created_at, updated_at, message_count, total_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMessage = this.db.prepare(`
      INSERT INTO chat_messages (session_id, role, content, has_image, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Delete any existing messages for this session (in case of re-archive)
    this.db.prepare("DELETE FROM chat_messages WHERE session_id = ?").run(sessionId);

    const transaction = this.db.transaction(() => {
      insertSession.run(sessionId, title, preview, createdAt, updatedAt, messages.length, totalCost);
      for (const msg of messages) {
        insertMessage.run(sessionId, msg.role, msg.content, msg.hasImage ? 1 : 0, msg.timestamp);
      }
    });

    transaction();
    log.info(`archived session ${sessionId.slice(0, 8)} (${messages.length} messages, $${totalCost.toFixed(4)})`);
  }

  /** List archived chats with pagination */
  listChats(limit = 20, offset = 0): { chats: ArchivedChat[]; total: number } {
    const total = (this.db.prepare("SELECT COUNT(*) as count FROM chat_sessions").get() as { count: number }).count;
    const chats = this.db.prepare(`
      SELECT id, title, preview, created_at, updated_at, message_count, total_cost
      FROM chat_sessions
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as ArchivedChat[];
    return { chats, total };
  }

  /** Get full message history for a session */
  getChat(sessionId: string): { session: ArchivedChat | null; messages: ArchivedMessage[] } {
    const session = this.db.prepare(`
      SELECT id, title, preview, created_at, updated_at, message_count, total_cost
      FROM chat_sessions WHERE id = ?
    `).get(sessionId) as ArchivedChat | undefined;

    if (!session) return { session: null, messages: [] };

    const messages = this.db.prepare(`
      SELECT id, session_id, role, content, has_image, timestamp
      FROM chat_messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `).all(sessionId) as ArchivedMessage[];

    return { session, messages };
  }

  /** Delete an archived chat */
  deleteChat(sessionId: string): boolean {
    const result = this.db.prepare("DELETE FROM chat_sessions WHERE id = ?").run(sessionId);
    return result.changes > 0;
  }

  close() {
    this.db.close();
  }
}
