import { test, expect, describe } from "vitest";
import { simpleParser } from "mailparser";
import type { EmailAttachment } from "./src/types.ts";

describe("Email attachment integration tests", () => {
  // Multipart email fixture with text and attachment
  const multipartEmail = `From: sender@example.com
To: recipient@example.com
Subject: Test email with attachment
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="boundary123"

--boundary123
Content-Type: text/plain; charset=utf-8
Content-Transfer-Encoding: 7bit

This is the email body.
--boundary123
Content-Type: text/plain; name="test.txt"
Content-Disposition: attachment; filename="test.txt"
Content-Transfer-Encoding: base64

VGhpcyBpcyB0aGUgYXR0YWNoZWQgZmlsZSBjb250ZW50Lg==
--boundary123--
`;

  test("Parse multipart email with attachment", async () => {
    const parsed = await simpleParser(multipartEmail);
    expect(parsed).toBeDefined();
    expect(parsed.text).toContain("This is the email body");
    expect(parsed.attachments).toBeDefined();
    expect(parsed.attachments?.length).toBeGreaterThan(0);
  });

  test("Extract attachment metadata", async () => {
    const parsed = await simpleParser(multipartEmail);
    if (parsed.attachments && parsed.attachments.length > 0) {
      const att = parsed.attachments[0];
      expect(att.filename).toBe("test.txt");
      expect(att.contentType).toContain("text");
      expect(att.size).toBeGreaterThan(0);
    }
  });

  test("Map parsed attachments to EmailAttachment type", async () => {
    const parsed = await simpleParser(multipartEmail);
    
    const attachments: EmailAttachment[] = [];
    if (parsed.attachments) {
      for (const att of parsed.attachments) {
        attachments.push({
          filename: att.filename ?? "untitled",
          contentType: att.contentType ?? "application/octet-stream",
          size: att.size,
          content: Buffer.from(att.content),
        });
      }
    }
    
    expect(attachments.length).toBeGreaterThan(0);
    expect(attachments[0].filename).toBe("test.txt");
    expect(attachments[0].content).toBeDefined();
    expect(attachments[0].content).toBeInstanceOf(Buffer);
  });

  // HTML email with image attachment
  const htmlEmailWithImage = `From: sender@example.com
To: recipient@example.com
Subject: Test HTML email with image
MIME-Version: 1.0
Content-Type: multipart/related; boundary="boundary456"

--boundary456
Content-Type: text/html; charset=utf-8

<html><body><h1>Test</h1><img src="cid:image123"></body></html>
--boundary456
Content-Type: image/png; name="image.png"
Content-Disposition: attachment; filename="image.png"
Content-ID: <image123>
Content-Transfer-Encoding: base64

iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==
--boundary456--
`;

  test("Parse HTML email with embedded image", async () => {
    const parsed = await simpleParser(htmlEmailWithImage);
    expect(parsed.html).toContain("<h1>Test</h1>");
    expect(parsed.attachments).toBeDefined();
  });

  test("Handle email without attachments", async () => {
    const simpleEmail = `From: sender@example.com
To: recipient@example.com
Subject: Plain text email
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

This is a simple email without attachments.
`;
    
    const parsed = await simpleParser(simpleEmail);
    expect(parsed.text).toContain("simple email");
    expect(parsed.attachments).toBeDefined();
    expect(parsed.attachments).toHaveLength(0);
  });

  test("Snippet is populated from email source", async () => {
    const email = `From: sender@example.com
To: recipient@example.com
Subject: Snippet test
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

Hello, this is a test email body that should appear as a snippet in listMessages output.
`;

    const parsed = await simpleParser(email);
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
    const snippet = text.substring(0, 200);

    expect(snippet).toBeTruthy();
    expect(snippet.length).toBeGreaterThan(0);
    expect(snippet.length).toBeLessThanOrEqual(200);
    expect(snippet).toContain("Hello, this is a test email body");
  });

  test("Snippet from HTML-only email strips tags", async () => {
    const htmlOnlyEmail = `From: sender@example.com
To: recipient@example.com
Subject: HTML only
MIME-Version: 1.0
Content-Type: text/html; charset=utf-8

<html><body><style>body{color:red}</style><p>Important message here</p><script>alert(1)</script></body></html>
`;

    const parsed = await simpleParser(htmlOnlyEmail);
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
    const snippet = text.substring(0, 200);

    expect(snippet).toBeTruthy();
    expect(snippet).toContain("Important message here");
    expect(snippet).not.toContain("<style");
    expect(snippet).not.toContain("<script");
    expect(snippet).not.toContain("<p>");
  });

  test("Multiple attachments handling", async () => {
    const multipleAttachments = `From: sender@example.com
To: recipient@example.com
Subject: Multiple attachments
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="boundary789"

--boundary789
Content-Type: text/plain

Email body
--boundary789
Content-Type: text/plain; name="file1.txt"
Content-Disposition: attachment; filename="file1.txt"
Content-Transfer-Encoding: base64

ZmlsZSBvbmU=
--boundary789
Content-Type: text/plain; name="file2.txt"
Content-Disposition: attachment; filename="file2.txt"
Content-Transfer-Encoding: base64

ZmlsZSB0d28=
--boundary789--
`;

    const parsed = await simpleParser(multipleAttachments);
    expect(parsed.attachments?.length).toBe(2);
    expect(parsed.attachments?.[0].filename).toBe("file1.txt");
    expect(parsed.attachments?.[1].filename).toBe("file2.txt");
  });
});
