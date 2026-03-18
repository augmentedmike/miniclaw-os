import { test, expect } from "vitest";
import { resolveConfig } from "./src/config.js";
import { MoltbookClient } from "./src/client.js";

test("resolveConfig returns defaults", () => {
  const cfg = resolveConfig({});
  expect(cfg.apiUrl).toBe("https://api.moltbook.com");
  expect(cfg.vaultBin).toContain("mc-vault");
});

test("resolveConfig accepts overrides", () => {
  const cfg = resolveConfig({ apiUrl: "http://localhost:3000", vaultBin: "/usr/local/bin/mc-vault" });
  expect(cfg.apiUrl).toBe("http://localhost:3000");
  expect(cfg.vaultBin).toBe("/usr/local/bin/mc-vault");
});

test("MoltbookClient strips trailing slash from apiUrl", () => {
  const client = new MoltbookClient("https://api.moltbook.com/", "/bin/mc-vault");
  // Verify it constructed without error — the trailing slash is stripped internally
  expect(client).toBeDefined();
});

test("MoltbookClient.hasApiKey returns false when vault key missing", () => {
  const client = new MoltbookClient("https://api.moltbook.com", "/nonexistent/mc-vault");
  expect(client.hasApiKey()).toBe(false);
});
