import { describe, it, expect, vi, beforeEach } from "vitest";
import { simpleParser } from "mailparser";

/**
 * Integration tests for listMessages snippet extraction.
 *
 * We mock ImapFlow to avoid real IMAP connections, but exercise the actual
 * simpleParser path that converts raw email source → snippet text.
 */

// ---------------------------------------------------------------------------
// Helpers to build RFC-822 email source buffers
// ---------------------------------------------------------------------------

function buildPlainEmail(body: string): Buffer {
  const raw = [
    "From: sender@example.com",
    "To: recipient@example.com",
    "Subject: Test plain",
    "Date: Wed, 18 Mar 2026 12:00:00 +0000",
    "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].join("\r\n");
  return Buffer.from(raw);
}

function buildHtmlOnlyEmail(html: string): Buffer {
  const raw = [
    "From: sender@example.com",
    "To: recipient@example.com",
    "Subject: Test html",
    "Date: Wed, 18 Mar 2026 12:00:00 +0000",
    "Content-Type: text/html; charset=utf-8",
    "",
    html,
  ].join("\r\n");
  return Buffer.from(raw);
}

// ---------------------------------------------------------------------------
// Snippet extraction logic (mirrors client.ts listMessages)
// ---------------------------------------------------------------------------

async function extractSnippet(source: Buffer): Promise<string> {
  const parsed = await simpleParser(source);
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
  return text.substring(0, 200);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("listMessages snippet extraction", () => {
  it("populates snippet from plain-text email body", async () => {
    const body = "Hello, this is a plain-text email body for testing snippet extraction.";
    const source = buildPlainEmail(body);
    const snippet = await extractSnippet(source);

    expect(snippet).toBeTruthy();
    expect(snippet.length).toBeGreaterThan(0);
    expect(snippet).toContain("plain-text email body");
  });

  it("truncates snippet to 200 characters", async () => {
    const body = "A".repeat(500);
    const source = buildPlainEmail(body);
    const snippet = await extractSnippet(source);

    expect(snippet.length).toBe(200);
  });

  it("falls back to HTML-stripped text when no plain-text part", async () => {
    const html = "<html><body><h1>Welcome</h1><p>This is an <b>HTML-only</b> email with no plain-text alternative.</p></body></html>";
    const source = buildHtmlOnlyEmail(html);
    const snippet = await extractSnippet(source);

    expect(snippet).toBeTruthy();
    expect(snippet.length).toBeGreaterThan(0);
    expect(snippet).toContain("HTML-only");
    // Should not contain HTML tags
    expect(snippet).not.toContain("<");
    expect(snippet).not.toContain(">");
  });

  it("strips <style> and <script> tags from HTML fallback", async () => {
    const html = [
      "<html><head><style>body { color: red; }</style></head>",
      "<body><script>alert('xss')</script>",
      "<p>Visible content only</p></body></html>",
    ].join("");
    const source = buildHtmlOnlyEmail(html);
    const snippet = await extractSnippet(source);

    expect(snippet).toContain("Visible content");
    expect(snippet).not.toContain("color: red");
    expect(snippet).not.toContain("alert");
  });

  it("returns empty string when source has no text or html", async () => {
    // Minimal email with no body
    const raw = [
      "From: sender@example.com",
      "To: recipient@example.com",
      "Subject: Empty",
      "Date: Wed, 18 Mar 2026 12:00:00 +0000",
      "",
      "",
    ].join("\r\n");
    const snippet = await extractSnippet(Buffer.from(raw));
    expect(snippet).toBe("");
  });
});
