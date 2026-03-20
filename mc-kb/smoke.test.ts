import { test, expect } from "vitest";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("index.ts exists", () => {
  expect(existsSync(__dirname + "/index.ts")).toBe(true);
});

test("plugin has required structure", () => {
  expect(existsSync(__dirname + "/src/store.ts")).toBe(true);
  expect(existsSync(__dirname + "/src/search.ts")).toBe(true);
  expect(existsSync(__dirname + "/src/embedder.ts")).toBe(true);
});
