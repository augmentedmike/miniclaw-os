import { test, expect } from "vitest";
import register from "./index.js";
import { createContributeTools } from "./tools/definitions.js";
import { registerContributeCommands } from "./cli/commands.js";
import { CONTRIBUTION_GUIDELINES } from "./src/guidelines.js";
import {
  sanitizeSlug,
  sanitizeTitle,
  sanitizeBody,
} from "./src/sanitize.js";

test("register is a function", () => {
  expect(typeof register).toBe("function");
});

test("createContributeTools returns an array", () => {
  const tools = createContributeTools(
    { upstreamRepo: "test/repo", forkRemote: "origin" },
    { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any,
  );
  expect(Array.isArray(tools)).toBe(true);
});

test("registerContributeCommands is a function", () => {
  expect(typeof registerContributeCommands).toBe("function");
});

test("CONTRIBUTION_GUIDELINES is a non-empty string", () => {
  expect(typeof CONTRIBUTION_GUIDELINES).toBe("string");
  expect(CONTRIBUTION_GUIDELINES.length).toBeGreaterThan(0);
});

// --- sanitizeSlug ---

test("sanitizeSlug keeps a valid slug", () => {
  expect(sanitizeSlug("valid-name", "test")).toBe("valid-name");
});

test("sanitizeSlug strips command injection characters", () => {
  const result = sanitizeSlug("$(rm -rf /)", "test");
  expect(result).not.toContain("$");
  expect(result).not.toContain("(");
  expect(result).not.toContain(")");
  expect(result).not.toContain("/");
});

test("sanitizeSlug rejects SQL injection", () => {
  expect(() => sanitizeSlug("; drop table", "test")).toThrow();
});

// --- sanitizeTitle ---

test("sanitizeTitle keeps a normal title", () => {
  expect(sanitizeTitle("normal title")).toBe("normal title");
});

test("sanitizeTitle strips backticks", () => {
  const result = sanitizeTitle("title`injection`here");
  expect(result).not.toContain("`");
});

test("sanitizeTitle strips shell metacharacters", () => {
  const result = sanitizeTitle("hello $(whoami) world");
  expect(result).not.toContain("$");
  expect(result).not.toContain("(");
  expect(result).not.toContain(")");
});

// --- sanitizeBody ---

test("sanitizeBody strips dollar signs", () => {
  const result = sanitizeBody("body with $variable");
  expect(result).not.toContain("$");
});

test("sanitizeBody strips backticks", () => {
  const result = sanitizeBody("some `code` here");
  expect(result).not.toContain("`");
});

test("sanitizeBody strips backslashes", () => {
  const result = sanitizeBody("path\\to\\file");
  expect(result).not.toContain("\\");
});
