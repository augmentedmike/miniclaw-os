/**
 * Unit tests for mc-email attachment support (crd_a22d7831)
 *
 * Tests:
 *  1. EmailMessage type accepts attachments array
 *  2. Attachment field mapping from mailparser output
 *  3. Integration: simpleParser correctly extracts attachments from multipart MIME
 */
import { test, expect, describe } from "vitest";
import { simpleParser } from "mailparser";
import type { EmailMessage } from "./types.js";

// ---------------------------------------------------------------------------
// Unit: TypeScript type conformance
// ---------------------------------------------------------------------------
describe("EmailMessage attachments field", () => {
  test("accepts message with no attachments", () => {
    const msg: EmailMessage = {
      id: "1",
      threadId: "1",
      subject: "Hello",
      from: "alice@example.com",
      to: "bob@example.com",
      date: new Date().toISOString(),
      snippet: "Hi there",
      body: "Hi there",
      labelIds: [],
    };
    expect(msg.attachments).toBeUndefined();
  });

  test("accepts message with attachments array", () => {
    const content = Buffer.from("fake pdf bytes");
    const msg: EmailMessage = {
      id: "2",
      threadId: "2",
      subject: "See attached",
      from: "alice@example.com",
      to: "bob@example.com",
      date: new Date().toISOString(),
      snippet: "Please find attached",
      body: "Please find attached",
      labelIds: [],
      attachments: [
        {
          filename: "report.pdf",
          contentType: "application/pdf",
          size: content.length,
          content,
        },
      ],
    };
    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments![0].filename).toBe("report.pdf");
    expect(msg.attachments![0].contentType).toBe("application/pdf");
    expect(msg.attachments![0].size).toBe(content.length);
    expect(Buffer.isBuffer(msg.attachments![0].content)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Unit: attachment field mapping (simulates what client.ts does)
// ---------------------------------------------------------------------------
describe("attachment field mapping", () => {
  test("maps filename, contentType, size, content", () => {
    const rawAttachment = {
      filename: "photo.jpg",
      contentType: "image/jpeg",
      size: 2048,
      content: Buffer.from("fake jpeg"),
    };

    // Simulate the mapping in client.ts
    const mapped = {
      filename: rawAttachment.filename ?? "attachment",
      contentType: rawAttachment.contentType ?? "application/octet-stream",
      size: rawAttachment.size ?? (rawAttachment.content?.length ?? 0),
      content: rawAttachment.content ?? Buffer.alloc(0),
    };

    expect(mapped.filename).toBe("photo.jpg");
    expect(mapped.contentType).toBe("image/jpeg");
    expect(mapped.size).toBe(2048);
    expect(Buffer.isBuffer(mapped.content)).toBe(true);
  });

  test("falls back to 'attachment' when filename is undefined", () => {
    const raw = { filename: undefined, contentType: "application/octet-stream", size: 0, content: Buffer.alloc(0) };
    const mapped = { filename: raw.filename ?? "attachment" };
    expect(mapped.filename).toBe("attachment");
  });

  test("falls back to 'application/octet-stream' when contentType is undefined", () => {
    const raw = { filename: "file.bin", contentType: undefined, size: 0, content: Buffer.alloc(0) };
    const mapped = { contentType: raw.contentType ?? "application/octet-stream" };
    expect(mapped.contentType).toBe("application/octet-stream");
  });

  test("computes size from content.length when size is missing", () => {
    const content = Buffer.from("hello world");
    const raw = { filename: "note.txt", contentType: "text/plain", size: undefined, content };
    const mapped = { size: raw.size ?? (raw.content?.length ?? 0) };
    expect(mapped.size).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// Integration: simpleParser extracts attachments from a real multipart MIME
// ---------------------------------------------------------------------------
const MULTIPART_FIXTURE = [
  "From: alice@example.com",
  "To: bob@example.com",
  "Subject: Test with attachment",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="BOUNDARY"',
  "",
  "--BOUNDARY",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "See the attached file.",
  "",
  "--BOUNDARY",
  "Content-Type: application/pdf; name=report.pdf",
  "Content-Transfer-Encoding: base64",
  'Content-Disposition: attachment; filename="report.pdf"',
  "",
  Buffer.from("fake pdf content").toString("base64"),
  "",
  "--BOUNDARY--",
].join("\r\n");

describe("simpleParser multipart integration", () => {
  test("extracts text body and attachment from multipart/mixed", async () => {
    const parsed = await simpleParser(MULTIPART_FIXTURE);

    expect(parsed.text?.trim()).toBe("See the attached file.");

    expect(parsed.attachments).toHaveLength(1);
    const att = parsed.attachments[0];
    expect(att.filename).toBe("report.pdf");
    expect(att.contentType).toBe("application/pdf");
    expect(att.content.toString()).toBe("fake pdf content");
  });

  test("maps parsed attachment to EmailMessage attachment shape", async () => {
    const parsed = await simpleParser(MULTIPART_FIXTURE);

    const attachments: EmailMessage["attachments"] = parsed.attachments.map(a => ({
      filename: a.filename ?? "attachment",
      contentType: a.contentType ?? "application/octet-stream",
      size: a.size ?? (a.content?.length ?? 0),
      content: a.content ?? Buffer.alloc(0),
    }));

    expect(attachments).toHaveLength(1);
    expect(attachments![0].filename).toBe("report.pdf");
    expect(attachments![0].contentType).toBe("application/pdf");
    expect(attachments![0].content.toString()).toBe("fake pdf content");
    expect(attachments![0].size).toBeGreaterThan(0);
  });

  test("no attachments on plain-text email", async () => {
    const plain = [
      "From: alice@example.com",
      "To: bob@example.com",
      "Subject: Simple",
      "Content-Type: text/plain",
      "",
      "Just a simple message.",
    ].join("\r\n");

    const parsed = await simpleParser(plain);
    expect(parsed.attachments).toHaveLength(0);
  });

  test("handles multiple attachments", async () => {
    const mime = [
      "From: alice@example.com",
      "To: bob@example.com",
      "Subject: Multiple attachments",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="B"',
      "",
      "--B",
      "Content-Type: text/plain",
      "",
      "Two attachments follow.",
      "",
      "--B",
      "Content-Type: image/png; name=img.png",
      "Content-Transfer-Encoding: base64",
      'Content-Disposition: attachment; filename="img.png"',
      "",
      Buffer.from("png bytes").toString("base64"),
      "",
      "--B",
      "Content-Type: text/csv; name=data.csv",
      "Content-Transfer-Encoding: base64",
      'Content-Disposition: attachment; filename="data.csv"',
      "",
      Buffer.from("col1,col2\n1,2").toString("base64"),
      "",
      "--B--",
    ].join("\r\n");

    const parsed = await simpleParser(mime);
    expect(parsed.attachments).toHaveLength(2);
    expect(parsed.attachments[0].filename).toBe("img.png");
    expect(parsed.attachments[1].filename).toBe("data.csv");
    expect(parsed.attachments[1].content.toString()).toBe("col1,col2\n1,2");
  });
});
