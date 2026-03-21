import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { spawnSync } from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";
import type { Command } from "commander";
import type { Logger } from "openclaw/plugin-sdk";
import type { EmailConfig } from "../src/config.js";
import { HimalayaClient, ensureHimalayaConfig } from "../src/himalaya.js";
import { getAppPassword, saveAppPassword } from "../src/vault.js";
import {
  loadTriageState,
  saveTriageState,
  filterNewUids,
  markAllProcessed,
  pruneState,
} from "../src/triage-state.js";
import {
  addToList,
  removeFromList,
  isBlocked,
  listAll,
  getEntry,
  detectOptOut,
  detectResubscribe,
  extractEmail,
} from "../src/dnc-store.js";

interface Ctx {
  program: Command;
  cfg: EmailConfig;
  logger: Logger;
}

function getClient(cfg: EmailConfig): HimalayaClient {
  return new HimalayaClient(cfg);
}

export function registerEmailCommands(ctx: Ctx): void {
  const { program, cfg } = ctx;

  const sub = program
    .command("mc-email")
    .description("Email — read, triage, archive, send via himalaya");

  // ---- auth ----
  sub
    .command("auth")
    .description("Verify app password is in vault and himalaya config exists")
    .action(async () => {
      const existing = getAppPassword(cfg.vaultBin);
      if (existing) {
        console.log(`App password found in vault (${existing.length} chars). Auth OK.`);
        ensureHimalayaConfig(cfg);
        console.log("Himalaya config verified.");
        console.log(`Run 'mc mc-email check' to list unread inbox messages.`);
        return;
      }

      const rl = readline.createInterface({ input, output });
      console.log("Go to https://myaccount.google.com/apppasswords and generate a 16-char app password.");
      const password = await rl.question("Paste your app password here: ");
      rl.close();

      if (!password.trim()) {
        console.error("No password entered, aborted.");
        process.exit(1);
      }
      saveAppPassword(cfg.vaultBin, password.trim());
      ensureHimalayaConfig(cfg);
      console.log("App password saved to vault. Himalaya config generated. Auth complete.");
      console.log(`Run 'mc mc-email check' to list unread inbox messages.`);
    });

  // ---- check ----
  sub
    .command("check")
    .description("List unread inbox messages")
    .option("-n, --limit <n>", "Max messages to show", "20")
    .option("-f, --folder <folder>", "Mailbox folder", "INBOX")
    .action(async (opts: { limit: string; folder: string }) => {
      ensureHimalayaConfig(cfg);
      const client = getClient(cfg);
      const messages = await client.listMessages(opts.folder, parseInt(opts.limit, 10));
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
    .description("Read a single message by ID")
    .option("-f, --folder <folder>", "Mailbox folder", "INBOX")
    .option("--save-attachments <dir>", "Save all attachments to directory")
    .action(async (id: string, opts: { folder: string; saveAttachments?: string }) => {
      ensureHimalayaConfig(cfg);
      const client = getClient(cfg);
      const msg = await client.getMessage(id, opts.folder);
      if (!msg) {
        console.error(`Message ${id} not found.`);
        process.exit(1);
      }

      // Handle save-attachments mode
      if (opts.saveAttachments) {
        const saved = await client.downloadAttachments(id, opts.saveAttachments, opts.folder);
        if (saved.length) {
          for (const f of saved) console.log(`Saved: ${f}`);
        } else {
          console.log("No attachments to save.");
        }
        return;
      }

      // Normal read mode
      console.log(`ID:      ${msg.id}`);
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
        console.log(`\nUse --save-attachments <dir> to download all attachments.`);
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
      ensureHimalayaConfig(cfg);
      const client = getClient(cfg);
      await client.archiveMessage(id);
      console.log(`Archived: ${id}`);
    });

  // ---- send ----
  sub
    .command("send")
    .description("Send a plain-text email")
    .requiredOption("-t, --to <address>", "Recipient email address")
    .requiredOption("-s, --subject <subject>", "Email subject")
    .option("-b, --body <text>", "Email body text")
    .option("-f, --body-file <path>", "Read email body from file (strips YAML frontmatter)")
    .option("-a, --attach <paths...>", "Attach files (space-separated paths)")
    .option("--plain", "Send as plain text only (no HTML part) — required for cold outreach")
    .action(async (opts: { to: string; subject: string; body?: string; bodyFile?: string; attach?: string[]; plain?: boolean }) => {
      let body = opts.body ?? "";
      if (opts.bodyFile) {
        const fs = await import("node:fs");
        const raw = fs.readFileSync(path.resolve(opts.bodyFile), "utf-8");
        const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n/);
        body = fmMatch ? raw.substring(fmMatch[0].length).trim() : raw.trim();
      }
      if (!body) {
        console.error("Error: either --body or --body-file is required");
        process.exit(1);
      }
      ensureHimalayaConfig(cfg);
      const client = getClient(cfg);
      const attachments = opts.attach?.map((p) => ({
        filename: path.basename(p),
        path: path.resolve(p),
      }));
      const id = await client.sendMessage({
        to: opts.to,
        subject: opts.subject,
        body,
        plain: opts.plain,
        attachments,
      });
      console.log(`Sent. ${id}`);
    });

  // ---- reply ----
  sub
    .command("reply <id>")
    .description("Reply to a message by ID")
    .requiredOption("-b, --body <text>", "Reply body text")
    .action(async (id: string, opts: { body: string }) => {
      ensureHimalayaConfig(cfg);
      const client = getClient(cfg);
      const sentId = await client.replyToMessage(id, opts.body);
      console.log(`Reply sent. ${sentId}`);
    });

  // ---- triage ----
  sub
    .command("triage")
    .description("Autonomous triage: classify, reply, and archive unread inbox messages")
    .option("--dry-run", "Classify but do not send replies or archive")
    .option("-n, --limit <n>", "Max unread messages to process", "20")
    .option("--test-set", "Run classification test suite only (no inbox access)")
    .option("--no-state", "Disable state tracking (process all unread messages)")
    .action(async (opts: { dryRun?: boolean; limit: string; testSet?: boolean; state?: boolean }) => {
      const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
      const useState = opts.state !== false;

      if (opts.testSet) {
        const scriptPath = path.join(stateDir, "miniclaw/cron/scripts/email-triage.py");
        const args = ["python3", scriptPath, "--test-set", "--limit", opts.limit];
        const result = spawnSync(args[0], args.slice(1), {
          stdio: "inherit",
          env: { ...process.env },
        });
        if (result.status !== 0) process.exit(result.status ?? 1);
        return;
      }

      ensureHimalayaConfig(cfg);

      let triageState = useState ? pruneState(loadTriageState()) : loadTriageState();
      let skipUids: string[] = [];
      if (useState) {
        skipUids = Object.keys(triageState.processedUids);
      }

      let processedUids: string[] = [];
      if (useState) {
        try {
          const client = getClient(cfg);
          const messages = await client.listMessages("INBOX", parseInt(opts.limit, 10));
          const newMessages = messages.filter((m) => !skipUids.includes(m.id));
          if (!newMessages.length) {
            console.log("No new unread messages to triage (all already processed).");
            return;
          }
          processedUids = newMessages.map((m) => m.id);
          console.log(`Triaging ${newMessages.length} new message(s) (${skipUids.length} already processed, skipped).`);
        } catch (err) {
          console.error("Warning: could not pre-check messages for state tracking, proceeding without filter.", err);
        }
      }

      const scriptPath = path.join(stateDir, "miniclaw/cron/scripts/email-triage.py");
      const args = ["python3", scriptPath];
      if (opts.dryRun) args.push("--dry-run");
      args.push("--limit", opts.limit);
      if (useState && skipUids.length > 0) {
        args.push("--skip-uids", skipUids.join(","));
      }

      const result = spawnSync(args[0], args.slice(1), {
        stdio: "inherit",
        env: { ...process.env },
      });

      if (useState && processedUids.length > 0 && (result.status === 0 || opts.dryRun)) {
        triageState = markAllProcessed(processedUids, triageState);
        saveTriageState(triageState);
        console.log(`State updated: marked ${processedUids.length} UID(s) as processed.`);
      }

      if (result.status !== 0 && !opts.dryRun) {
        process.exit(result.status ?? 1);
      }
    });

  // ---- dnc (Do Not Contact) ----
  const dnc = sub
    .command("dnc")
    .description("Manage the Do Not Contact list");

  dnc
    .command("add <email>")
    .description("Add an email address to the Do Not Contact list")
    .option("-r, --reason <text>", "Reason for adding to the list")
    .action((email: string, opts: { reason?: string }) => {
      addToList(email, opts.reason, "cli");
      console.log(`Added ${email.toLowerCase()} to the Do Not Contact list.`);
    });

  dnc
    .command("remove <email>")
    .description("Remove an email address from the Do Not Contact list")
    .action((email: string) => {
      const removed = removeFromList(email);
      if (removed) {
        console.log(`Removed ${email.toLowerCase()} from the Do Not Contact list.`);
      } else {
        console.log(`${email.toLowerCase()} was not on the Do Not Contact list.`);
      }
    });

  dnc
    .command("list")
    .description("List all entries on the Do Not Contact list")
    .action(() => {
      const entries = listAll();
      if (!entries.length) {
        console.log("Do Not Contact list is empty.");
        return;
      }
      console.log(`Do Not Contact list (${entries.length} entries):\n`);
      for (const e of entries) {
        console.log(`  ${e.email}`);
        if (e.reason) console.log(`    Reason: ${e.reason}`);
        console.log(`    Added: ${e.added_at}${e.added_by ? ` by ${e.added_by}` : ""}`);
        console.log();
      }
    });

  dnc
    .command("check <email>")
    .description("Check if an email address is on the Do Not Contact list")
    .action((email: string) => {
      if (isBlocked(email)) {
        const entry = getEntry(email);
        console.log(`BLOCKED: ${email.toLowerCase()} is on the Do Not Contact list.`);
        if (entry?.reason) console.log(`  Reason: ${entry.reason}`);
        if (entry?.added_at) console.log(`  Added: ${entry.added_at}`);
      } else {
        console.log(`OK: ${email.toLowerCase()} is NOT on the Do Not Contact list.`);
      }
    });
}
