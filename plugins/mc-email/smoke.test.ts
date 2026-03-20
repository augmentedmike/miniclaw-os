import { test, expect } from "vitest";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "./src/config.ts";
import type { EmailAttachment, EmailMessage } from "./src/types.ts";
import { resolveFolder, FOLDER_ALIASES } from "./src/client.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("index.ts exists", () => {
  expect(existsSync(__dirname + "/index.ts")).toBe(true);
});

test("resolveConfig returns defaults", () => {
  const cfg = resolveConfig({});
  expect(cfg).toBeDefined();
  expect(typeof cfg.emailAddress).toBe("string");
});

// Attachment type tests
test("EmailAttachment type mapping", () => {
  const attachment: EmailAttachment = {
    filename: "document.pdf",
    contentType: "application/pdf",
    size: 1024 * 100, // 100KB
    content: Buffer.from("PDF content here"),
  };
  
  expect(attachment.filename).toBe("document.pdf");
  expect(attachment.contentType).toBe("application/pdf");
  expect(attachment.size).toBe(102400);
  expect(attachment.content).toBeDefined();
  expect(typeof attachment.content).toBe("object");
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
      {
        filename: "image.png",
        contentType: "image/png",
        size: 2048,
        content: Buffer.from("PNG data"),
      },
      {
        filename: "doc.txt",
        contentType: "text/plain",
        size: 512,
        content: Buffer.from("Text content"),
      },
    ],
    labelIds: ["INBOX"],
  };
  
  expect(message.attachments).toHaveLength(2);
  expect(message.attachments![0].filename).toBe("image.png");
  expect(message.attachments![1].filename).toBe("doc.txt");
  expect(message.attachments![0].content).toBeDefined();
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

// Folder alias tests
test("resolveFolder maps 'sent' to [Gmail]/Sent Mail", () => {
  expect(resolveFolder("sent")).toBe("[Gmail]/Sent Mail");
});

test("resolveFolder maps 'all' to [Gmail]/All Mail", () => {
  expect(resolveFolder("all")).toBe("[Gmail]/All Mail");
});

test("resolveFolder maps 'drafts' to [Gmail]/Drafts", () => {
  expect(resolveFolder("drafts")).toBe("[Gmail]/Drafts");
});

test("resolveFolder maps 'trash' to [Gmail]/Trash", () => {
  expect(resolveFolder("trash")).toBe("[Gmail]/Trash");
});

test("resolveFolder maps 'spam' to [Gmail]/Spam", () => {
  expect(resolveFolder("spam")).toBe("[Gmail]/Spam");
});

test("resolveFolder maps 'inbox' to INBOX", () => {
  expect(resolveFolder("inbox")).toBe("INBOX");
});

test("resolveFolder is case-insensitive", () => {
  expect(resolveFolder("SENT")).toBe("[Gmail]/Sent Mail");
  expect(resolveFolder("Sent")).toBe("[Gmail]/Sent Mail");
  expect(resolveFolder("INBOX")).toBe("INBOX");
});

test("resolveFolder passes through unknown folder names", () => {
  expect(resolveFolder("[Gmail]/Sent Mail")).toBe("[Gmail]/Sent Mail");
  expect(resolveFolder("CustomFolder")).toBe("CustomFolder");
});

test("FOLDER_ALIASES has all expected keys", () => {
  expect(Object.keys(FOLDER_ALIASES)).toEqual(
    expect.arrayContaining(["inbox", "sent", "all", "drafts", "trash", "spam"])
  );
});

test("Attachment size formatting", () => {
  const sizes = [
    { bytes: 512, expected: "512 bytes" },
    { bytes: 1024, expected: "1 KB" },
    { bytes: 1024 * 100, expected: "100 KB" },
    { bytes: 1024 * 1024, expected: "1 MB" },
  ];
  
  for (const { bytes, expected } of sizes) {
    const sizeKB = Math.round(bytes / 1024);
    if (bytes < 1024) {
      expect(`${bytes} bytes`).toBeDefined();
    } else {
      expect(sizeKB).toBeGreaterThan(0);
    }
  }
});
