import { describe, it, expect } from "vitest";
import {
  extractMessage,
  formatPluginError,
  formatUserError,
  DOCTOR_SUGGESTION,
} from "./format.js";

describe("extractMessage", () => {
  it("extracts message from Error instance", () => {
    expect(extractMessage(new Error("boom"))).toBe("boom");
  });

  it("returns string as-is", () => {
    expect(extractMessage("raw string")).toBe("raw string");
  });

  it("converts non-string/non-Error to string", () => {
    expect(extractMessage(42)).toBe("42");
    expect(extractMessage(null)).toBe("null");
    expect(extractMessage(undefined)).toBe("undefined");
    expect(extractMessage({ foo: "bar" })).toBe("[object Object]");
  });
});

describe("formatPluginError", () => {
  it("formats basic error with plugin and operation", () => {
    const result = formatPluginError("mc-kb", "add", new Error("Invalid type"));
    expect(result).toBe('[mc-kb] add failed: Invalid type');
  });

  it("includes suggestions with arrow prefix", () => {
    const result = formatPluginError("mc-kb", "search", new Error("timeout"), [
      "Check your network connection",
      "Run: openclaw mc-doctor",
    ]);
    expect(result).toContain("[mc-kb] search failed: timeout");
    expect(result).toContain("  → Check your network connection");
    expect(result).toContain("  → Run: openclaw mc-doctor");
  });

  it("handles non-Error thrown values", () => {
    const result = formatPluginError("mc-board", "move", "something broke");
    expect(result).toBe("[mc-board] move failed: something broke");
  });

  it("shows stack trace when showStack is true", () => {
    const err = new Error("test error");
    const result = formatPluginError("mc-email", "send", err, [], { showStack: true });
    expect(result).toContain("[mc-email] send failed: test error");
    expect(result).toContain("Stack trace:");
    expect(result).toContain("Error: test error");
  });

  it("does not show stack trace by default", () => {
    const err = new Error("test error");
    const result = formatPluginError("mc-email", "send", err);
    expect(result).not.toContain("Stack trace:");
  });

  it("does not show stack trace for non-Error values even with showStack", () => {
    const result = formatPluginError("mc-kb", "get", "not an error", [], { showStack: true });
    expect(result).not.toContain("Stack trace:");
  });

  it("handles empty suggestions array", () => {
    const result = formatPluginError("mc-kb", "add", new Error("fail"), []);
    expect(result).toBe("[mc-kb] add failed: fail");
  });
});

describe("formatUserError", () => {
  it("formats a simple error message", () => {
    expect(formatUserError("Entry not found: kb_abc123")).toBe("Entry not found: kb_abc123");
  });

  it("includes suggestions", () => {
    const result = formatUserError("Entry not found: kb_abc123", [
      "Run: openclaw mc-kb list to see all entries",
      "Check the ID format: entries start with kb_",
    ]);
    expect(result).toContain("Entry not found: kb_abc123");
    expect(result).toContain("  → Run: openclaw mc-kb list to see all entries");
    expect(result).toContain("  → Check the ID format: entries start with kb_");
  });
});

describe("DOCTOR_SUGGESTION", () => {
  it("is a non-empty string mentioning mc-doctor", () => {
    expect(DOCTOR_SUGGESTION).toContain("mc-doctor");
    expect(DOCTOR_SUGGESTION.length).toBeGreaterThan(0);
  });

  it("works in formatPluginError suggestions", () => {
    const result = formatPluginError("mc-kb", "add", new Error("crash"), [DOCTOR_SUGGESTION]);
    expect(result).toContain("mc-doctor");
  });
});
