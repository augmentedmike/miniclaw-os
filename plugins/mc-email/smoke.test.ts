import { test, expect } from "vitest";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "./src/config.ts";
import type { EmailAttachment, EmailMessage } from "./src/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("index.ts exists", () => {
  expect(existsSync(__dirname + "/index.ts")).toBe(true);
});

test("resolveConfig returns defaults with himalaya fields", () => {
  const cfg = resolveConfig({});
  expect(cfg).toBeDefined();
  expect(typeof cfg.emailAddress).toBe("string");
  expect(cfg.himalayaBin).toBe("himalaya");
  expect(typeof cfg.signature).toBe("string");
  // No more imapHost/smtpHost — himalaya handles its own config
  expect((cfg as Record<string, unknown>).imapHost).toBeUndefined();
  expect((cfg as Record<string, unknown>).smtpHost).toBeUndefined();
});

test("EmailAttachment type mapping", () => {
  const attachment: EmailAttachment = {
    filename: "document.pdf",
    contentType: "application/pdf",
    size: 1024 * 100,
  };
  expect(attachment.filename).toBe("document.pdf");
  expect(attachment.contentType).toBe("application/pdf");
  expect(attachment.size).toBe(102400);
});

test("EmailMessage with attachments", () => {
  const message: EmailMessage = {
    id: "123",
    threadId: "456",
    subject: "Test with attachments",
    from: "sender@example.com",
    to: "recipient@example.com",
    date: new Date().toISOString(),
    snippet: "Test email",
    body: "This is a test email with attachments",
    attachments: [
      { filename: "image.png", contentType: "image/png", size: 2048 },
      { filename: "doc.txt", contentType: "text/plain", size: 512 },
    ],
    labelIds: ["INBOX"],
  };
  expect(message.attachments).toHaveLength(2);
  expect(message.attachments![0].filename).toBe("image.png");
});

test("EmailMessage without attachments", () => {
  const message: EmailMessage = {
    id: "789",
    threadId: "012",
    subject: "No attachments",
    from: "sender@example.com",
    to: "recipient@example.com",
    date: new Date().toISOString(),
    snippet: "Plain text",
    body: "This email has no attachments",
    attachments: undefined,
    labelIds: ["INBOX"],
  };
  expect(message.attachments).toBeUndefined();
});
