import { test, expect } from "vitest";
import register from "./index.js";
import { createTailscaleTools } from "./tools/definitions.js";
import { registerTailscaleCommands } from "./cli/commands.js";

test("register is a function", () => {
  expect(typeof register).toBe("function");
});

test("createTailscaleTools returns an array", () => {
  const tools = createTailscaleTools(
    {
      tailscaleBin: "/usr/bin/tailscale",
      tailnetName: "test.ts.net",
      apiTokenVaultKey: "test-key",
      stateDir: "/tmp/test-tailscale",
    },
    { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any,
  );
  expect(Array.isArray(tools)).toBe(true);
  expect(tools.length).toBeGreaterThan(0);
});

test("registerTailscaleCommands is a function", () => {
  expect(typeof registerTailscaleCommands).toBe("function");
});

test("tool names follow convention", () => {
  const tools = createTailscaleTools(
    {
      tailscaleBin: "/usr/bin/tailscale",
      tailnetName: "test.ts.net",
      apiTokenVaultKey: "test-key",
      stateDir: "/tmp/test-tailscale",
    },
    { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any,
  );
  for (const tool of tools) {
    expect(tool.name).toMatch(/^tailscale_/);
  }
});
