import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";
import type { Command } from "commander";
import type { Logger } from "openclaw/plugin-sdk";
import type { EmailConfig } from "../src/config.js";
import { GmailClient } from "../src/client.js";
import { getAppPassword, saveAppPassword } from "../src/vault.js";

interface Ctx {
  program: Command;
  cfg: EmailConfig;
  logger: Logger;
}

function getClient(cfg: EmailConfig): GmailClient {
  return new GmailClient(cfg);
}

export function registerEmailCommands(ctx: Ctx): void {
  const { program, cfg } = ctx;

  const sub = program
    .command("mc-email")
    .description("Gmail integration — read, triage, archive, send");

  // ---- auth ----
  sub
    .command("auth")
    .description("Verify Gmail app password is in vault (or store it)")
    .action(async () => {
      const existing = getAppPassword(cfg.vaultBin);
      if (existing) {
        console.log(`Gmail app password found in vault (${existing.length} chars). Auth OK.`);
        console.log(`Run 'mc mc-email check' to list unread inbox messages.`);
        return;
      }

      const rl = readline.createInterface({ input, output });
      console.log("Go to https://myaccount.google.com/apppasswords and generate a 16-char app password for Gmail.");
      const password = await rl.question("Paste your Gmail app password here: ");
      rl.close();

      if (!password.trim()) {
        console.error("No password entered, aborted.");
        process.exit(1);
      }
      saveAppPassword(cfg.vaultBin, password.trim());
      console.log("App password saved to vault. Gmail auth complete.");
      console.log(`Run 'mc mc-email check' to list unread inbox messages.`);
    });

  // ---- check ----
  sub
    .command("check")
    .description("List unread inbox messages")
    .option("-n, --limit <n>", "Max messages to show", "20")
    .option("-q, --query <q>", "Gmail search query", "in:inbox is:unread")
    .action(async (opts: { limit: string; query: string }) => {
      const client = getClient(cfg);
      const messages = await client.listMessages(opts.query, parseInt(opts.limit, 10));
      if (!messages.length) {
        console.log("No messages found.");
        return;
      }
      for (const m of messages) {
        console.log(`[${m.id}] ${m.date}`);
        console.log(`  From: ${m.from}`);
        console.log(`  Subject: ${m.subject}`);
        if (m.snippet) console.log(`  ${m.snippet.substring(0, 100)}`);
        console.log();
      }
    });

  // ---- read ----
  sub
    .command("read <id>")
    .description("Read a single message by UID")
    .option("--save-attachments <dir>", "Save all attachments to directory")
    .option("--attachment <index>", "Extract specific attachment by 1-based index")
    .action(async (id: string, opts: { saveAttachments?: string; attachment?: string }) => {
      const client = getClient(cfg);
      const msg = await client.getMessage(id);
      if (!msg) {
        console.error(`Message ${id} not found.`);
        process.exit(1);
      }

      // Handle attachment extraction mode
      if (opts.attachment) {
        if (!msg.attachments || msg.attachments.length === 0) {
          console.error("Message has no attachments.");
          process.exit(1);
        }
        const idx = parseInt(opts.attachment, 10) - 1;
        if (idx < 0 || idx >= msg.attachments.length) {
          console.error(`Invalid attachment index: ${opts.attachment}. Message has ${msg.attachments.length} attachment(s).`);
          process.exit(1);
        }
        const att = msg.attachments[idx];
        const fs = await import("node:fs/promises");
        const outPath = path.join(process.cwd(), att.filename);
        if (att.content) {
          await fs.writeFile(outPath, att.content);
          console.log(`Extracted: ${outPath}`);
        }
        return;
      }

      // Handle save-all mode
      if (opts.saveAttachments) {
        if (!msg.attachments || msg.attachments.length === 0) {
          console.log("Message has no attachments.");
          return;
        }
        const fs = await import("node:fs/promises");
        try {
          await fs.mkdir(opts.saveAttachments, { recursive: true });
          for (const att of msg.attachments) {
            if (att.content) {
              const outPath = path.join(opts.saveAttachments, att.filename);
              await fs.writeFile(outPath, att.content);
              console.log(`Saved: ${outPath}`);
            }
          }
        } catch (err) {
          console.error(`Error saving attachments: ${err}`);
          process.exit(1);
        }
        return;
      }

      // Normal read mode: display message with attachments list
      console.log(`UID:     ${msg.id}`);
      console.log(`From:    ${msg.from}`);
      console.log(`To:      ${msg.to}`);
      console.log(`Date:    ${msg.date}`);
      console.log(`Subject: ${msg.subject}`);
      console.log(`Flags:   ${msg.labelIds.join(", ")}`);
      
      if (msg.attachments && msg.attachments.length > 0) {
        console.log(`\nAttachments (${msg.attachments.length}):`);
        for (let i = 0; i < msg.attachments.length; i++) {
          const att = msg.attachments[i];
          const sizeKB = Math.round(att.size / 1024);
          console.log(`  [${i + 1}] ${att.filename} (${sizeKB}KB, ${att.contentType})`);
        }
        console.log(`\nUse --attachment <N> to extract specific file, or --save-attachments <dir> to save all.`);
      }

      if (msg.body) {
        console.log();
        console.log(msg.body);
      } else if (msg.snippet) {
        console.log();
        console.log(msg.snippet);
      }
    });

  // ---- archive ----
  sub
    .command("archive <id>")
    .description("Archive a message (move to All Mail, remove from INBOX)")
    .action(async (id: string) => {
      const client = getClient(cfg);
      await client.archiveMessage(id);
      console.log(`Archived: ${id}`);
    });

  // ---- send ----
  sub
    .command("send")
    .description("Send an email")
    .requiredOption("-t, --to <address>", "Recipient email address")
    .requiredOption("-s, --subject <subject>", "Email subject")
    .requiredOption("-b, --body <text>", "Email body text")
    .action(async (opts: { to: string; subject: string; body: string }) => {
      const client = getClient(cfg);
      const id = await client.sendMessage({
        to: opts.to,
        subject: opts.subject,
        body: opts.body,
      });
      console.log(`Sent. Message ID: ${id}`);
    });

  // ---- reply ----
  sub
    .command("reply <id>")
    .description("Reply to a message by UID")
    .requiredOption("-b, --body <text>", "Reply body text")
    .action(async (id: string, opts: { body: string }) => {
      const client = getClient(cfg);
      const sentId = await client.replyToMessage(id, opts.body);
      console.log(`Reply sent. Message ID: ${sentId}`);
    });

  // ---- triage ----
  sub
    .command("triage")
    .description("Autonomous triage: classify, reply, and archive unread inbox messages")
    .option("--dry-run", "Classify but do not send replies or archive")
    .option("-n, --limit <n>", "Max unread messages to process", "20")
    .option("--test-set", "Run classification test suite only (no inbox access)")
    .action((opts: { dryRun?: boolean; limit: string; testSet?: boolean }) => {
      const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
      const scriptPath = path.join(stateDir, "cron/scripts/email-triage.py");
      const args = ["python3", scriptPath];
      if (opts.dryRun) args.push("--dry-run");
      if (opts.testSet) args.push("--test-set");
      args.push("--limit", opts.limit);

      const result = spawnSync(args[0], args.slice(1), {
        stdio: "inherit",
        env: { ...process.env },
      });
      if (result.status !== 0) {
        process.exit(result.status ?? 1);
      }
    });
}
