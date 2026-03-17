import { test, expect } from "vitest";
import register from "./index.js";
import { createUpdateTools } from "./tools/definitions.js";
import { registerUpdateCommands } from "./cli/commands.js";
import { loadState, saveState, acquireLock, releaseLock } from "./src/state.js";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

test("register is a function", () => {
  expect(typeof register).toBe("function");
});

test("createUpdateTools returns an array of 3 tools", () => {
  const tools = createUpdateTools(
    {
      stateDir: "/tmp/mc-update-test",
      pluginDir: "/tmp/mc-update-test/plugin",
      updateTime: "0 3 * * *",
      autoRollback: true,
      notifyOnUpdate: true,
      smokeTimeout: 60000,
      repos: [],
    },
    { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any,
  );
  expect(Array.isArray(tools)).toBe(true);
  expect(tools.length).toBe(3);
  expect(tools.map((t) => t.name)).toEqual(["update_check", "update_now", "update_status"]);
});

test("registerUpdateCommands is a function", () => {
  expect(typeof registerUpdateCommands).toBe("function");
});

test("state load/save roundtrip", () => {
  const tmpDir = path.join(os.tmpdir(), `mc-update-test-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const state = loadState(tmpDir);
  expect(state.lastCheck).toBeNull();
  expect(state.lastUpdate).toBeNull();
  expect(state.rollbackRefs).toEqual([]);

  state.lastCheck = "2026-03-17T00:00:00Z";
  state.lastResult = "success";
  state.versions = { "miniclaw-os": "abc12345" };
  saveState(tmpDir, state);

  const loaded = loadState(tmpDir);
  expect(loaded.lastCheck).toBe("2026-03-17T00:00:00Z");
  expect(loaded.lastResult).toBe("success");
  expect(loaded.versions["miniclaw-os"]).toBe("abc12345");

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("lock acquire and release", () => {
  const tmpDir = path.join(os.tmpdir(), `mc-update-lock-test-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  // First acquire should succeed
  expect(acquireLock(tmpDir)).toBe(true);
  // Second acquire should fail (lock held)
  expect(acquireLock(tmpDir)).toBe(false);
  // Release and re-acquire should work
  releaseLock(tmpDir);
  expect(acquireLock(tmpDir)).toBe(true);

  // Cleanup
  releaseLock(tmpDir);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
