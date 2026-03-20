import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import type { EmailConfig } from "./config.js";
import { getAppPassword } from "./vault.js";
import type { EmailAttachment, EmailMessage, SendEmailOptions } from "./types.js";
import { formatPluginError, DOCTOR_SUGGESTION } from "../../shared/errors/format.js";

/** Map short folder aliases to Gmail IMAP folder paths */
export const FOLDER_ALIASES: Record<string, string> = {
  inbox: "INBOX",
  sent: "[Gmail]/Sent Mail",
  all: "[Gmail]/All Mail",
  drafts: "[Gmail]/Drafts",
  trash: "[Gmail]/Trash",
  spam: "[Gmail]/Spam",
};

/** Resolve a folder name: check aliases first, then use as-is */
export function resolveFolder(folder: string): string {
  return FOLDER_ALIASES[folder.toLowerCase()] ?? folder;
}

/**
 * Parse a Gmail-style query string.
 * Extracts 'in:<folder>' token and maps it via FOLDER_ALIASES.
 * Builds IMAP search criteria from remaining tokens (is:unread, is:read, from:<addr>).
 * Returns { folder: resolved folder or null, searchCriteria: IMAP search object, cleanedQuery: query without in: token }.
 */
export function parseQuery(query: string): {
  folder: string | null;
  searchCriteria: Record<string, unknown>;
  cleanedQuery: string;
} {
  let folder: string | null = null;
  const searchCriteria: Record<string, unknown> = {};
  const tokens = query.trim().split(/\s+/);
  const remaining: string[] = [];

  for (const token of tokens) {
    const inMatch = token.match(/^in:(.+)$/i);
    if (inMatch) {
      folder = resolveFolder(inMatch[1]);
      continue;
    }

    const isMatch = token.match(/^is:(.+)$/i);
    if (isMatch) {
      const flag = isMatch[1].toLowerCase();
      if (flag === "unread") {
        searchCriteria.seen = false;
      } else if (flag === "read") {
        searchCriteria.seen = true;
      } else if (flag === "starred") {
        searchCriteria.flagged = true;
      }
      remaining.push(token);
      continue;
    }

    const fromMatch = token.match(/^from:(.+)$/i);
    if (fromMatch) {
      searchCriteria.from = fromMatch[1];
      remaining.push(token);
      continue;
    }

    remaining.push(token);
  }

  // If no specific criteria were set, default to all
  if (Object.keys(searchCriteria).length === 0) {
    searchCriteria.all = true;
  }

  return {
    folder,
    searchCriteria,
    cleanedQuery: remaining.join(" "),
  };
}

const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&ndash;": "–",
  "&mdash;": "—",
  "&hellip;": "…",
  "&copy;": "©",
  "&reg;": "®",
  "&trade;": "™",
};

/**
 * Convert HTML to readable plain text.
 * 1. Strip <style> and <script> blocks (including contents)
 * 2. Strip remaining HTML tags
 * 3. Decode common HTML entities + numeric character references
 * 4. Collapse whitespace
 */
export function htmlToText(html: string): string {
  let text = html;
  // Remove style blocks
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  // Remove script blocks
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  // Strip all HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode named HTML entities
  text = text.replace(/&[a-z#0-9]+;/gi, (entity) => {
    const lower = entity.toLowerCase();
    if (HTML_ENTITY_MAP[lower]) return HTML_ENTITY_MAP[lower];
    // Numeric character references: &#123; or &#x1a;
    const numMatch = lower.match(/^&#x?([0-9a-f]+);$/);
    if (numMatch) {
      const code = lower.startsWith("&#x")
        ? parseInt(numMatch[1], 16)
        : parseInt(numMatch[1], 10);
      return String.fromCharCode(code);
    }
    return entity;
  });
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

function createImapClient(cfg: EmailConfig): ImapFlow {
  const password = getAppPassword(cfg.vaultBin);
  if (!password) {
    throw new Error("Email password not found in vault. Run: mc mc-email auth");
  }
  return new ImapFlow({
    host: cfg.imapHost,
    port: cfg.imapPort,
    secure: true,
    auth: {
      user: cfg.emailAddress,
      pass: password,
    },
    logger: false,
  });
}

export class GmailClient {
  private cfg: EmailConfig;

  constructor(cfg: EmailConfig) {
    this.cfg = cfg;
  }

  async listMessages(query = "in:inbox is:unread", maxResults = 20, folder?: string): Promise<EmailMessage[]> {
    const client = createImapClient(this.cfg);
    await client.connect();
    const messages: EmailMessage[] = [];
    try {
      const parsed = parseQuery(query);
      // Explicit folder param overrides query-derived folder; fall back to INBOX
      const effectiveFolder = folder ?? parsed.folder ?? "INBOX";
      await client.mailboxOpen(resolveFolder(effectiveFolder));
      const searchCriteria = parsed.searchCriteria;

      const uids = await client.search(searchCriteria, { uid: true });
      if (!uids.length) return [];

      const limited = uids.slice(-maxResults);

      for await (const msg of client.fetch(
        limited,
        { uid: true, envelope: true, flags: true, source: true },
        { uid: true }
      )) {
        let snippet = "";
        if (msg.source) {
          const parsed = await simpleParser(msg.source);
          const text =
            parsed.text ??
            (parsed.html
              ? parsed.html
                  .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                  .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                  .replace(/<[^>]+>/g, " ")
                  .replace(/\s+/g, " ")
                  .trim()
              : "");
          snippet = text.substring(0, 200);
        }
        messages.push({
          id: String(msg.uid),
          threadId: String(msg.uid),
          subject: msg.envelope?.subject ?? "(no subject)",
          from: msg.envelope?.from?.[0]
            ? `${msg.envelope.from[0].name ?? ""} <${msg.envelope.from[0].address ?? ""}>`.trim()
            : "",
          to: msg.envelope?.to?.[0]?.address ?? "",
          date: msg.envelope?.date?.toISOString() ?? "",
          snippet,
          labelIds: msg.flags ? Array.from(msg.flags) : [],
        });
      }
    } finally {
      await client.logout();
    }
    return messages;
  }

  async getMessage(id: string, folder = "INBOX"): Promise<EmailMessage | null> {
    const client = createImapClient(this.cfg);
    await client.connect();
    try {
      await client.mailboxOpen(resolveFolder(folder));
      let found: EmailMessage | null = null;

      for await (const msg of client.fetch(
        { uid: parseInt(id, 10) },
        {
          uid: true,
          envelope: true,
          flags: true,
          source: true,
        },
        { uid: true }
      )) {
        let body = "";
        let snippet = "";
        let attachments: EmailAttachment[] = [];

        if (msg.source) {
          const parsed = await simpleParser(msg.source);
          body = parsed.text ?? "";
          if (!body && parsed.html) {
            body = htmlToText(parsed.html);
          }
          snippet = body.substring(0, 500);

          if (parsed.attachments?.length) {
            attachments = parsed.attachments.map((att) => ({
              filename: att.filename ?? "untitled",
              contentType: att.contentType ?? "application/octet-stream",
              size: att.size,
              content: Buffer.from(att.content),
            }));
          }
        }

        found = {
          id: String(msg.uid),
          threadId: String(msg.uid),
          subject: msg.envelope?.subject ?? "(no subject)",
          from: msg.envelope?.from?.[0]
            ? `${msg.envelope.from[0].name ?? ""} <${msg.envelope.from[0].address ?? ""}>`.trim()
            : "",
          to: msg.envelope?.to?.[0]?.address ?? "",
          date: msg.envelope?.date?.toISOString() ?? "",
          snippet,
          body,
          attachments: attachments.length ? attachments : undefined,
          labelIds: msg.flags ? Array.from(msg.flags) : [],
        };
        break;
      }
      return found;
    } catch (err) {
      console.error(formatPluginError("mc-email", "fetch message", err, [
        "Run: openclaw mc-email check — to list available messages",
        "Check IMAP auth: openclaw mc-email auth",
        DOCTOR_SUGGESTION,
      ]));
      return null;
    } finally {
      await client.logout();
    }
  }

  async archiveMessage(id: string): Promise<void> {
    const client = createImapClient(this.cfg);
    await client.connect();
    try {
      await client.mailboxOpen("INBOX");
      // Archive: move to Archive or All Mail (provider-dependent)
      // Try standard "Archive" first, fall back to IMAP delete flag (mark as read + delete from INBOX)
      try {
        await client.messageMove({ uid: parseInt(id, 10) }, "Archive", { uid: true });
      } catch {
        try {
          await client.messageMove({ uid: parseInt(id, 10) }, "[Gmail]/All Mail", { uid: true });
        } catch {
          // Fallback: mark as read and flag for deletion from INBOX
          await client.messageFlagsAdd({ uid: parseInt(id, 10) }, ["\\Seen", "\\Deleted"], { uid: true });
        }
      }
    } finally {
      await client.logout();
    }
  }

  async sendMessage(opts: SendEmailOptions): Promise<string> {
    const password = getAppPassword(this.cfg.vaultBin);
    if (!password) {
      throw new Error("Email password not found in vault. Run: mc mc-email auth");
    }
    const transport = nodemailer.createTransport({
      host: this.cfg.smtpHost,
      port: this.cfg.smtpPort,
      secure: this.cfg.smtpPort === 465,
      auth: {
        user: this.cfg.emailAddress,
        pass: password,
      },
    });
    const body = `${opts.body}\n\n--\n${this.cfg.signature}`;
    const mailOpts: Record<string, unknown> = {
      from: opts.from ?? this.cfg.emailAddress,
      to: opts.to,
      subject: opts.subject,
      text: body,
    };
    if (opts.attachments?.length) {
      mailOpts.attachments = opts.attachments.map((a) => ({
        filename: a.filename,
        path: a.path,
      }));
    }
    const info = await transport.sendMail(mailOpts);
    return info.messageId ?? "";
  }

  async replyToMessage(messageId: string, body: string): Promise<string> {
    const original = await this.getMessage(messageId);
    if (!original) throw new Error(`Message ${messageId} not found`);
    const subject = original.subject.startsWith("Re:")
      ? original.subject
      : `Re: ${original.subject}`;
    return this.sendMessage({ to: original.from, subject, body });
  }

  /**
   * Search for messages across one or more folders using IMAP SEARCH.
   * Opens each folder sequentially, searches with text criteria, and returns combined results.
   */
  async searchMessages(
    query: string,
    folders: string[] = ["INBOX", "[Gmail]/Sent Mail"],
    maxResults = 20
  ): Promise<(EmailMessage & { folder: string })[]> {
    const client = createImapClient(this.cfg);
    await client.connect();
    const results: (EmailMessage & { folder: string })[] = [];
    try {
      for (const rawFolder of folders) {
        const folder = resolveFolder(rawFolder);
        try {
          await client.mailboxOpen(folder);
        } catch {
          // Folder may not exist — skip silently
          continue;
        }

        // Use IMAP TEXT search which searches headers + body
        const searchCriteria = { body: query };
        let uids: number[];
        try {
          uids = await client.search(searchCriteria, { uid: true });
        } catch {
          // Search failed for this folder — skip
          continue;
        }
        if (!uids.length) continue;

        // Take the most recent UIDs up to remaining budget
        const remaining = maxResults - results.length;
        if (remaining <= 0) break;
        const limited = uids.slice(-remaining);

        for await (const msg of client.fetch(
          limited,
          { uid: true, envelope: true, flags: true, source: true },
          { uid: true }
        )) {
          let snippet = "";
          if (msg.source) {
            const parsed = await simpleParser(msg.source);
            const text =
              parsed.text ??
              (parsed.html
                ? parsed.html
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
                    .replace(/<[^>]+>/g, " ")
                    .replace(/\s+/g, " ")
                    .trim()
                : "");
            snippet = text.substring(0, 200);
          }
          results.push({
            id: String(msg.uid),
            threadId: String(msg.uid),
            subject: msg.envelope?.subject ?? "(no subject)",
            from: msg.envelope?.from?.[0]
              ? `${msg.envelope.from[0].name ?? ""} <${msg.envelope.from[0].address ?? ""}>`.trim()
              : "",
            to: msg.envelope?.to?.[0]?.address ?? "",
            date: msg.envelope?.date?.toISOString() ?? "",
            snippet,
            labelIds: msg.flags ? Array.from(msg.flags) : [],
            folder: rawFolder,
          });
        }
      }
    } finally {
      await client.logout();
    }
    return results;
  }
}
