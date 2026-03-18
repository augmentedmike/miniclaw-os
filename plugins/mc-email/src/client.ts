import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { simpleParser } from "mailparser";
import type { EmailConfig } from "./config.js";
import { getAppPassword } from "./vault.js";
import type { EmailAttachment, EmailMessage, SendEmailOptions } from "./types.js";

export function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

  async listMessages(query = "in:inbox is:unread", maxResults = 20): Promise<EmailMessage[]> {
    const client = createImapClient(this.cfg);
    await client.connect();
    const messages: EmailMessage[] = [];
    try {
      await client.mailboxOpen("INBOX");
      // Map Gmail-style query to IMAP search criteria
      const searchCriteria: Record<string, unknown> = query.includes("is:unread")
        ? { seen: false }
        : { all: true };

      const uids = await client.search(searchCriteria, { uid: true });
      if (!uids.length) return [];

      const limited = uids.slice(-maxResults);

      for await (const msg of client.fetch(
        limited,
        { uid: true, envelope: true, flags: true },
        { uid: true }
      )) {
        messages.push({
          id: String(msg.uid),
          threadId: String(msg.uid),
          subject: msg.envelope?.subject ?? "(no subject)",
          from: msg.envelope?.from?.[0]
            ? `${msg.envelope.from[0].name ?? ""} <${msg.envelope.from[0].address ?? ""}>`.trim()
            : "",
          to: msg.envelope?.to?.[0]?.address ?? "",
          date: msg.envelope?.date?.toISOString() ?? "",
          snippet: "",
          labelIds: msg.flags ? Array.from(msg.flags) : [],
        });
      }
    } finally {
      await client.logout();
    }
    return messages;
  }

  async getMessage(id: string): Promise<EmailMessage | null> {
    const client = createImapClient(this.cfg);
    await client.connect();
    try {
      await client.mailboxOpen("INBOX");
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
            // Strip HTML as fallback when no plain-text part exists
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
      console.error("Error fetching message:", err);
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
    const info = await transport.sendMail({
      from: opts.from ?? this.cfg.emailAddress,
      to: opts.to,
      subject: opts.subject,
      text: body,
    });
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
}
