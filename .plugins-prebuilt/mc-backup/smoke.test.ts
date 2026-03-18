import { test, expect } from "vitest";
import register from "./index.js";
import { createBackupTools } from "./tools/definitions.js";
import { registerBackupCommands } from "./cli/commands.js";

test("register is a function", () => {
  expect(typeof register).toBe("function");
});

test("createBackupTools returns an array", () => {
  const tools = createBackupTools(
    {
      stateDir: "/tmp/test",
      backupDir: "/tmp/test/backups",
      recentQuotaBytes: 1024,
      totalQuotaBytes: 2048,
      excludeDirs: [],
    },
    { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any,
  );
  expect(Array.isArray(tools)).toBe(true);
});

test("registerBackupCommands is a function", () => {
  expect(typeof registerBackupCommands).toBe("function");
});
