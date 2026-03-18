/**
 * Unit tests for mc-contribute CLI helpers.
 * Run: pnpm test (from plugins/mc-contribute)
 */
import { describe, it, expect } from "vitest";

// Inline the helper to test independently (same logic as in commands.ts)
function stripKnownPrefix(title: string): string {
  return title.replace(/^\s*\[(Bug|Feature|Plugin)\]\s*/i, "").trim();
}

describe("stripKnownPrefix", () => {
  it("leaves a plain title unchanged", () => {
    expect(stripKnownPrefix("Something is broken")).toBe("Something is broken");
  });

  it("strips leading [Bug] prefix", () => {
    expect(stripKnownPrefix("[Bug] Something is broken")).toBe("Something is broken");
  });

  it("strips leading [Feature] prefix", () => {
    expect(stripKnownPrefix("[Feature] Add dark mode")).toBe("Add dark mode");
  });

  it("strips leading [Plugin] prefix", () => {
    expect(stripKnownPrefix("[Plugin] mc-weather")).toBe("mc-weather");
  });

  it("strips case-insensitive prefix", () => {
    expect(stripKnownPrefix("[bug] lowercase prefix")).toBe("lowercase prefix");
  });

  it("does NOT strip [Bug] appearing mid-string", () => {
    expect(stripKnownPrefix("Fix [Bug] in parser")).toBe("Fix [Bug] in parser");
  });

  it("strips extra whitespace after prefix", () => {
    expect(stripKnownPrefix("[Bug]   Extra spaces")).toBe("Extra spaces");
  });

  it("handles already-clean title with leading whitespace", () => {
    expect(stripKnownPrefix("  Clean title  ")).toBe("Clean title");
  });
});
