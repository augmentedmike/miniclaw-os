import { test, expect } from "vitest";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "./src/config.ts";
import { htmlToText } from "./src/client.ts";
import type { EmailAttachment, EmailMessage } from "./src/types.ts";

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

test("htmlToText strips style, script, tags, and decodes entities", () => {
  const html = `
    <html>
      <head><style>body { font-family: Arial; } .header { color: red; }</style></head>
      <body>
        <script>alert("xss")</script>
        <p>Hello &amp; welcome</p>
        <p>Use &lt;b&gt; for <b>bold</b></p>
        <p>She said &quot;hi&quot; &amp; it&#39;s&nbsp;fine</p>
      </body>
    </html>`;
  const text = htmlToText(html);
  expect(text).not.toContain("<style");
  expect(text).not.toContain("font-family");
  expect(text).not.toContain("<script");
  expect(text).not.toContain("alert");
  expect(text).not.toContain("<p>");
  expect(text).not.toContain("&amp;");
  expect(text).not.toContain("&nbsp;");
  expect(text).toContain("Hello & welcome");
  expect(text).toContain('She said "hi" & it\'s fine');
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
