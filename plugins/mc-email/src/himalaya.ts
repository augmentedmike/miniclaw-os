import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { EmailConfig } from "./config.js";
import type { EmailAttachment, EmailMessage, SendEmailOptions } from "./types.js";
import { prepareEmailBody } from "./email-format.js";
import { isBlocked, extractEmail } from "./dnc-store.js";

/** Raw envelope from `himalaya envelope list -o json` */
interface HimalayaEnvelope {
  id: string;
  message_id?: string;
  from?: { name?: string; addr: string };
  to?: { name?: string; addr: string }[];
  subject: string;
  date: string;
  flags?: string[];
}

/** Raw message from `himalaya message read <id> -o json` */
interface HimalayaMessage {
  id: string;
  message_id?: string;
  from?: { name?: string; addr: string };
  to?: { name?: string; addr: string }[];
  subject: string;
  date: string;
  flags?: string[];
  text_bodies?: string[];
  html_bodies?: string[];
  attachments?: { filename: string; content_type: string; size: number }[];
}

function baseArgs(cfg: EmailConfig): string[] {
  const args: string[] = [];
  if (cfg.himalayaConfig) {
    args.push("-c", cfg.himalayaConfig);
  }
  if (cfg.himalayaAccount) {
    args.push("-a", cfg.himalayaAccount);
  }
  return args;
}

function run(cfg: EmailConfig, subArgs: string[], input?: string): string {
  const bin = cfg.himalayaBin;
  const args = [...baseArgs(cfg), ...subArgs];
  if (input !== undefined) {
    const result = spawnSync(bin, args, {
      input,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 60_000,
    });
    if (result.status !== 0) {
      throw new Error(`himalaya ${subArgs[0]} failed (exit ${result.status}): ${result.stderr || result.stdout}`);
    }
    return result.stdout;
  }
  return execFileSync(bin, args, {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 60_000,
  });
}

function formatFrom(f?: { name?: string; addr: string }): string {
  if (!f) return "";
  return f.name ? `${f.name} <${f.addr}>` : f.addr;
}

function formatTo(t?: { name?: string; addr: string }[]): string {
  if (!t?.length) return "";
  return t.map((r) => (r.name ? `${r.name} <${r.addr}>` : r.addr)).join(", ");
}

export class HimalayaClient {
  private cfg: EmailConfig;

  constructor(cfg: EmailConfig) {
    this.cfg = cfg;
  }

  /**
   * List envelope summaries from a folder.
   */
  async listMessages(folder = "INBOX", limit = 20): Promise<EmailMessage[]> {
    const raw = run(this.cfg, [
      "envelope", "list",
      "-f", folder,
      "-s", String(limit),
      "-o", "json",
    ]);
    let envelopes: HimalayaEnvelope[];
    try {
      envelopes = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!Array.isArray(envelopes)) return [];

    return envelopes.map((e) => ({
      id: String(e.id),
      threadId: String(e.id),
      subject: e.subject ?? "(no subject)",
      from: formatFrom(e.from),
      to: formatTo(e.to),
      date: e.date ?? "",
      snippet: "",
      labelIds: e.flags ?? [],
    }));
  }

  /**
   * Read a full message by ID.
   */
  async getMessage(id: string, folder = "INBOX"): Promise<EmailMessage | null> {
    try {
      const raw = run(this.cfg, [
        "message", "read",
        "-f", folder,
        id,
        "-o", "json",
      ]);
      let msg: HimalayaMessage;
      try {
        msg = JSON.parse(raw);
      } catch {
        return null;
      }

      const body = msg.text_bodies?.join("\n") ?? "";
      const attachments: EmailAttachment[] = (msg.attachments ?? []).map((a) => ({
        filename: a.filename ?? "untitled",
        contentType: a.content_type ?? "application/octet-stream",
        size: a.size ?? 0,
      }));

      return {
        id: String(msg.id),
        threadId: String(msg.id),
        subject: msg.subject ?? "(no subject)",
        from: formatFrom(msg.from),
        to: formatTo(msg.to),
        date: msg.date ?? "",
        snippet: body.substring(0, 500),
        body,
        attachments: attachments.length ? attachments : undefined,
        labelIds: msg.flags ?? [],
      };
    } catch (err) {
      console.error("Error fetching message:", err);
      return null;
    }
  }

  /**
   * Send an email using MML template via himalaya.
   * himalaya template send automatically saves to Sent folder.
   *
   * When opts.plain is true, sends text/plain only (no HTML part).
   * This is required for cold outreach to maximize deliverability.
   * When opts.plain is false/undefined, sends multipart (text + HTML).
   */
  async sendMessage(opts: SendEmailOptions): Promise<string> {
    // DNC check: refuse to send to blocked addresses (unless bypassed for system auto-replies)
    if (!opts.bypassDnc) {
      const recipientEmail = extractEmail(opts.to);
      if (isBlocked(recipientEmail)) {
        throw new Error(`Recipient ${recipientEmail} is on the Do Not Contact list. Send aborted.`);
      }
    }

    const from = opts.from ?? this.cfg.emailAddress;
    const bodyWithSig = this.cfg.signature
      ? `${opts.body}\n\n--\n${this.cfg.signature}`
      : opts.body;

    const sendMode = opts.plain ? "plain" as const : "multipart" as const;
    const prepared = prepareEmailBody(bodyWithSig, sendMode);

    // Build MML template
    let mml = `From: ${from}\nTo: ${opts.to}\nSubject: ${opts.subject}\n\n`;
    mml += `<#part type=text/plain>\n${prepared.text}\n</#part>\n`;

    // Add HTML part only in multipart mode
    if (prepared.html) {
      mml += `<#part type=text/html>\n${prepared.html}\n</#part>\n`;
    }

    // Add attachments via MML <#include> tags
    if (opts.attachments?.length) {
      for (const att of opts.attachments) {
        const absPath = path.resolve(att.path);
        mml += `<#part filename="${att.filename}">\n<#include file="${absPath}" type=application/octet-stream>\n</#part>\n`;
      }
    }

    const output = run(this.cfg, ["template", "send"], mml);
    return output.trim() || "sent";
  }

  /**
   * Reply to a message. Fetches original, builds reply template, sends via himalaya.
   */
  async replyToMessage(messageId: string, body: string): Promise<string> {
    const original = await this.getMessage(messageId);
    if (!original) throw new Error(`Message ${messageId} not found`);

    // DNC check: refuse to reply to blocked addresses
    const senderEmail = extractEmail(original.from);
    if (isBlocked(senderEmail)) {
      throw new Error(`Recipient ${senderEmail} is on the Do Not Contact list. Reply aborted.`);
    }

    const subject = original.subject.startsWith("Re:")
      ? original.subject
      : `Re: ${original.subject}`;

    return this.sendMessage({
      to: original.from,
      subject,
      body,
    });
  }

  /**
   * Archive a message: move from INBOX to All Mail (Gmail) or Archive.
   */
  async archiveMessage(id: string, folder = "INBOX"): Promise<void> {
    try {
      run(this.cfg, ["message", "move", "-f", folder, "[Gmail]/All Mail", id]);
    } catch {
      try {
        run(this.cfg, ["message", "move", "-f", folder, "Archive", id]);
      } catch (err) {
        throw new Error(`Failed to archive message ${id}: ${err}`);
      }
    }
  }

  /**
   * Download attachments for a message to a directory.
   */
  async downloadAttachments(id: string, outputDir: string, folder = "INBOX"): Promise<string[]> {
    fs.mkdirSync(outputDir, { recursive: true });
    run(this.cfg, ["attachment", "download", "-f", folder, id, outputDir]);
    // List what was saved
    return fs.readdirSync(outputDir).map((f) => path.join(outputDir, f));
  }

  /**
   * Add flags to a message.
   */
  async flagMessage(id: string, flags: string[], folder = "INBOX"): Promise<void> {
    run(this.cfg, ["flag", "add", "-f", folder, id, ...flags]);
  }
}

/**
 * Ensure himalaya config.toml exists with credentials from vault.
 * Uses himalaya's password-command feature to call mc-vault.
 */
export function ensureHimalayaConfig(cfg: EmailConfig): void {
  // himalaya v1.x reads from ~/Library/Application Support/himalaya/ on macOS,
  // ~/.config/himalaya/ on Linux. Check both locations.
  const isMac = process.platform === "darwin";
  const primaryDir = isMac
    ? path.join(os.homedir(), "Library", "Application Support", "himalaya")
    : path.join(os.homedir(), ".config", "himalaya");
  const legacyDir = path.join(os.homedir(), ".config", "himalaya");
  const primaryPath = path.join(primaryDir, "config.toml");
  const legacyPath = path.join(legacyDir, "config.toml");

  // If custom config path is specified and exists, skip
  if (cfg.himalayaConfig && fs.existsSync(cfg.himalayaConfig)) return;

  // Check if config already exists in either location
  for (const p of [primaryPath, legacyPath]) {
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf-8");
      if (content.includes(cfg.emailAddress)) return; // already configured
    }
  }

  // Generate himalaya v1.x config with vault-based auth
  const isGmail = /@g(oogle)?mail\.com$/i.test(cfg.emailAddress);
  const imapHost = isGmail ? "imap.gmail.com" : "imap.mail.me.com";
  const smtpHost = isGmail ? "smtp.gmail.com" : "smtp.mail.me.com";
  const smtpPort = isGmail ? 587 : 587;
  const accountName = isGmail ? "gmail" : "default";
  const vaultExport = `${cfg.vaultBin} export email-app-password`;

  const toml = `[accounts.${accountName}]
email = "${cfg.emailAddress}"
display-name = ""
default = true

backend.type = "imap"
backend.host = "${imapHost}"
backend.port = 993
backend.encryption.type = "tls"
backend.login = "${cfg.emailAddress}"
backend.auth.type = "password"
backend.auth.cmd = "${vaultExport}"

message.send.backend.type = "smtp"
message.send.backend.host = "${smtpHost}"
message.send.backend.port = ${smtpPort}
message.send.backend.encryption.type = "start-tls"
message.send.backend.login = "${cfg.emailAddress}"
message.send.backend.auth.type = "password"
message.send.backend.auth.cmd = "${vaultExport}"

folder.aliases.sent = "${isGmail ? "[Gmail]/Sent Mail" : "Sent Messages"}"
folder.aliases.drafts = "${isGmail ? "[Gmail]/Drafts" : "Drafts"}"
folder.aliases.trash = "${isGmail ? "[Gmail]/Trash" : "Deleted Messages"}"
`;

  fs.mkdirSync(primaryDir, { recursive: true });
  fs.writeFileSync(primaryPath, toml, "utf-8");
}
