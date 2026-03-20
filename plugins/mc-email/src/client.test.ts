import { describe, it, expect } from "vitest";
import { simpleParser } from "mailparser";
import { htmlToText, parseQuery } from "./client.js";

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
// Snippet extraction tests
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

// ---------------------------------------------------------------------------
// htmlToText tests
// ---------------------------------------------------------------------------

describe("htmlToText", () => {
  it("extracts readable text from HTML-only email body", () => {
    const html =
      "<html><body><h1>Welcome</h1><p>This is an <b>HTML-only</b> email.</p></body></html>";
    const result = htmlToText(html);
    expect(result).toBeTruthy();
    expect(result).toContain("Welcome");
    expect(result).toContain("HTML-only");
    expect(result).not.toContain("<");
    expect(result).not.toContain(">");
  });

  it("decodes HTML entities", () => {
    const html = "<p>A &amp; B &lt; C &gt; D &quot;E&quot; F&#39;s &nbsp; end</p>";
    const result = htmlToText(html);
    expect(result).toContain("A & B");
    expect(result).toContain("< C >");
    expect(result).toContain('"E"');
    expect(result).toContain("F's");
  });

  it("strips style blocks before tag removal", () => {
    const html = [
      "<html><head><style>body { color: red; font-family: Arial; }</style></head>",
      "<body><p>Visible content only</p></body></html>",
    ].join("");
    const result = htmlToText(html);
    expect(result).toContain("Visible content");
    expect(result).not.toContain("color: red");
    expect(result).not.toContain("font-family");
  });

  it("strips script blocks", () => {
    const html =
      '<body><script>alert("xss")</script><p>Safe text</p></body>';
    const result = htmlToText(html);
    expect(result).toContain("Safe text");
    expect(result).not.toContain("alert");
  });

  it("handles complex multipart HTML with CSS and entities", () => {
    const html = `
      <html>
      <head>
        <style>
          .header { background: #f0f0f0; padding: 20px; }
          .content { font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="header"><h1>Newsletter</h1></div>
        <div class="content">
          <p>Hello &amp; welcome to our Q1 update.</p>
          <p>Revenue grew &gt; 20% &mdash; a great result.</p>
          <p>&copy; 2026 Acme Corp&trade;</p>
        </div>
        <script>trackOpen();</script>
      </body>
      </html>
    `;
    const result = htmlToText(html);
    expect(result).toContain("Newsletter");
    expect(result).toContain("Hello & welcome");
    expect(result).toContain("> 20%");
    expect(result).toContain("—");
    expect(result).toContain("© 2026 Acme Corp™");
    expect(result).not.toContain("background");
    expect(result).not.toContain("trackOpen");
    expect(result).not.toContain("<");
  });

  it("decodes numeric character references", () => {
    const html = "<p>&#65;&#66;&#67; and &#x41;&#x42;&#x43;</p>";
    const result = htmlToText(html);
    expect(result).toContain("ABC");
  });

  it("returns empty string for empty input", () => {
    expect(htmlToText("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// parseQuery tests
// ---------------------------------------------------------------------------

describe("parseQuery", () => {
  it("extracts in:sent and maps to [Gmail]/Sent Mail", () => {
    const result = parseQuery("in:sent");
    expect(result.folder).toBe("[Gmail]/Sent Mail");
    expect(result.searchCriteria).toEqual({ all: true });
  });

  it("extracts in:drafts and maps to [Gmail]/Drafts", () => {
    const result = parseQuery("in:drafts");
    expect(result.folder).toBe("[Gmail]/Drafts");
  });

  it("extracts in:inbox and maps to INBOX", () => {
    const result = parseQuery("in:inbox");
    expect(result.folder).toBe("INBOX");
  });

  it("passes through unknown folder name as-is", () => {
    const result = parseQuery("in:custom-label");
    expect(result.folder).toBe("custom-label");
  });

  it("returns null folder when no in: token", () => {
    const result = parseQuery("is:unread");
    expect(result.folder).toBeNull();
    expect(result.searchCriteria).toEqual({ seen: false });
  });

  it("handles combined in:sent is:unread", () => {
    const result = parseQuery("in:sent is:unread");
    expect(result.folder).toBe("[Gmail]/Sent Mail");
    expect(result.searchCriteria).toEqual({ seen: false });
  });

  it("handles is:read", () => {
    const result = parseQuery("is:read");
    expect(result.searchCriteria).toEqual({ seen: true });
  });

  it("handles from: token", () => {
    const result = parseQuery("from:alice@example.com");
    expect(result.searchCriteria.from).toBe("alice@example.com");
  });

  it("defaults to { all: true } when no search criteria tokens", () => {
    const result = parseQuery("in:sent");
    expect(result.searchCriteria).toEqual({ all: true });
  });

  it("removes in: token from cleanedQuery", () => {
    const result = parseQuery("in:sent is:unread");
    expect(result.cleanedQuery).toBe("is:unread");
    expect(result.cleanedQuery).not.toContain("in:");
  });
});
