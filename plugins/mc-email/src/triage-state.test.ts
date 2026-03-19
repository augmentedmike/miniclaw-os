import { test, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadTriageState,
  saveTriageState,
  isAlreadyProcessed,
  markProcessed,
  filterNewUids,
  markAllProcessed,
  pruneState,
} from "./triage-state.ts";

let tmpDir: string;
let statePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "triage-state-test-"));
  statePath = path.join(tmpDir, "email-triage-state.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("loadTriageState returns default when file does not exist", () => {
  const state = loadTriageState(statePath);
  expect(state).toEqual({ processedUids: {} });
});

test("saveTriageState and loadTriageState roundtrip", () => {
  const state = {
    processedUids: {
      "123": { timestamp: "2026-01-01T00:00:00.000Z" },
      "456": { timestamp: "2026-01-02T00:00:00.000Z" },
    },
  };
  saveTriageState(state, statePath);
  const loaded = loadTriageState(statePath);
  expect(loaded).toEqual(state);
});

test("loadTriageState handles corrupted file", () => {
  fs.writeFileSync(statePath, "not json!!!");
  const state = loadTriageState(statePath);
  expect(state).toEqual({ processedUids: {} });
});

test("isAlreadyProcessed returns true for known UIDs", () => {
  const state = {
    processedUids: {
      "100": { timestamp: "2026-01-01T00:00:00.000Z" },
    },
  };
  expect(isAlreadyProcessed("100", state)).toBe(true);
  expect(isAlreadyProcessed("200", state)).toBe(false);
});

test("markProcessed adds a UID with timestamp", () => {
  const state = { processedUids: {} };
  const updated = markProcessed("999", state);
  expect(updated.processedUids["999"]).toBeDefined();
  expect(updated.processedUids["999"].timestamp).toBeTruthy();
  // Original state is not mutated
  expect(state.processedUids).toEqual({});
});

test("filterNewUids removes already-processed UIDs", () => {
  const state = {
    processedUids: {
      "1": { timestamp: "2026-01-01T00:00:00.000Z" },
      "3": { timestamp: "2026-01-01T00:00:00.000Z" },
    },
  };
  const result = filterNewUids(["1", "2", "3", "4"], state);
  expect(result).toEqual(["2", "4"]);
});

test("markAllProcessed marks multiple UIDs at once", () => {
  const state = { processedUids: {} };
  const updated = markAllProcessed(["10", "20", "30"], state);
  expect(Object.keys(updated.processedUids)).toEqual(["10", "20", "30"]);
  for (const entry of Object.values(updated.processedUids)) {
    expect(entry.timestamp).toBeTruthy();
  }
});

test("pruneState removes entries older than maxAgeDays", () => {
  const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
  const recent = new Date().toISOString();
  const state = {
    processedUids: {
      "old-uid": { timestamp: old },
      "new-uid": { timestamp: recent },
    },
  };
  const pruned = pruneState(state, 90);
  expect(pruned.processedUids["old-uid"]).toBeUndefined();
  expect(pruned.processedUids["new-uid"]).toBeDefined();
});

test("pruneState keeps all entries within window", () => {
  const recent = new Date().toISOString();
  const state = {
    processedUids: {
      "a": { timestamp: recent },
      "b": { timestamp: recent },
    },
  };
  const pruned = pruneState(state, 90);
  expect(Object.keys(pruned.processedUids)).toHaveLength(2);
});
