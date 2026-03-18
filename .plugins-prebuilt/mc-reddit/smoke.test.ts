import { test, expect } from "vitest";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("index.ts exists", () => {
  expect(existsSync(__dirname + "/index.ts")).toBe(true);
});

test("plugin has required structure", () => {
  expect(existsSync(__dirname + "/src/vault.ts")).toBe(true);
});
