import { test, expect } from "vitest";
import register from "./index.js";
import { createMemoTools } from "./tools/definitions.js";

test("register is a default-exported function", () => {
  expect(typeof register).toBe("function");
});

test("createMemoTools returns an array", () => {
  // Pass dummy args — the function builds tool descriptors, no I/O at definition time
  const tools = createMemoTools("/tmp/memo-smoke", { info() {}, warn() {}, error() {}, debug() {} } as any);
  expect(Array.isArray(tools)).toBe(true);
  expect(tools.length).toBeGreaterThan(0);
  for (const t of tools) {
    expect(typeof t.name).toBe("string");
  }
});
