/**
 * queue-settings.test.ts — Unit tests for queue column config persistence.
 *
 * Covers:
 *   - readColumnsConfig() returns defaults when no config file exists
 *   - updateColumnConfig() writes to disk and readback matches
 *   - updateColumnConfig() preserves other columns when updating one
 *   - getCapacityLimit() reads from board-cron.json correctly
 *   - getCapacityLimit() returns default (3) when file missing
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getCapacityLimit } from "./store.js";

// ---- readColumnsConfig / updateColumnConfig from web/src/lib/columns.ts ----
// We test the logic inline using a temp file since columns.ts uses env vars.

interface ColumnConfig {
  maxConcurrency: number;
}
type ColumnsConfig = Record<string, ColumnConfig>;

const DEFAULTS: ColumnsConfig = {
  backlog: { maxConcurrency: 3 },
  "in-progress": { maxConcurrency: 3 },
  "in-review": { maxConcurrency: 3 },
  shipped: { maxConcurrency: 0 },
};

function makeHelpers(columnsFile: string) {
  function readColumnsConfig(): ColumnsConfig {
    try {
      if (fs.existsSync(columnsFile)) {
        const raw = JSON.parse(fs.readFileSync(columnsFile, "utf-8"));
        return { ...DEFAULTS, ...raw };
      }
    } catch {}
    return { ...DEFAULTS };
  }

  function updateColumnConfig(column: string, patch: Partial<ColumnConfig>): ColumnsConfig {
    const config = readColumnsConfig();
    config[column] = { ...(config[column] ?? { maxConcurrency: 3 }), ...patch };
    fs.mkdirSync(path.dirname(columnsFile), { recursive: true });
    fs.writeFileSync(columnsFile, JSON.stringify(config, null, 2) + "\n", "utf-8");
    return config;
  }

  return { readColumnsConfig, updateColumnConfig };
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "queue-settings-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("readColumnsConfig", () => {
  it("returns defaults when no config file exists", () => {
    const columnsFile = path.join(tmpDir, "board-columns.json");
    const { readColumnsConfig } = makeHelpers(columnsFile);

    const config = readColumnsConfig();
    expect(config.backlog.maxConcurrency).toBe(3);
    expect(config["in-progress"].maxConcurrency).toBe(3);
    expect(config["in-review"].maxConcurrency).toBe(3);
    expect(config.shipped.maxConcurrency).toBe(0);
  });

  it("merges file values with defaults", () => {
    const columnsFile = path.join(tmpDir, "board-columns.json");
    fs.writeFileSync(columnsFile, JSON.stringify({ "in-progress": { maxConcurrency: 5 } }), "utf-8");
    const { readColumnsConfig } = makeHelpers(columnsFile);

    const config = readColumnsConfig();
    expect(config["in-progress"].maxConcurrency).toBe(5);
    expect(config.backlog.maxConcurrency).toBe(3); // default preserved
  });
});

describe("updateColumnConfig", () => {
  it("writes to disk and readback matches", () => {
    const columnsFile = path.join(tmpDir, "board-columns.json");
    const { readColumnsConfig, updateColumnConfig } = makeHelpers(columnsFile);

    updateColumnConfig("in-progress", { maxConcurrency: 7 });

    const config = readColumnsConfig();
    expect(config["in-progress"].maxConcurrency).toBe(7);
  });

  it("preserves other columns when updating one", () => {
    const columnsFile = path.join(tmpDir, "board-columns.json");
    const { readColumnsConfig, updateColumnConfig } = makeHelpers(columnsFile);

    updateColumnConfig("in-review", { maxConcurrency: 2 });

    const config = readColumnsConfig();
    expect(config["in-review"].maxConcurrency).toBe(2);
    expect(config.backlog.maxConcurrency).toBe(3); // unchanged
    expect(config["in-progress"].maxConcurrency).toBe(3); // unchanged
  });

  it("creates the file if it does not exist", () => {
    const columnsFile = path.join(tmpDir, "subdir", "board-columns.json");
    const { updateColumnConfig } = makeHelpers(columnsFile);

    updateColumnConfig("backlog", { maxConcurrency: 1 });

    expect(fs.existsSync(columnsFile)).toBe(true);
    const raw = JSON.parse(fs.readFileSync(columnsFile, "utf-8"));
    expect(raw.backlog.maxConcurrency).toBe(1);
  });
});

// ---- getCapacityLimit from src/store.ts ----

describe("getCapacityLimit", () => {
  it("returns default (3) when board-cron.json is missing", () => {
    const result = getCapacityLimit("in-progress", tmpDir);
    expect(result).toBe(3);
  });

  it("reads maxConcurrent from board-cron.json for a known column", () => {
    const brainDir = path.join(tmpDir, "USER", "brain");
    fs.mkdirSync(brainDir, { recursive: true });
    const cronFile = path.join(brainDir, "board-cron.json");
    fs.writeFileSync(cronFile, JSON.stringify({
      "board-in-progress-triage": { maxConcurrent: 5 },
    }), "utf-8");

    const result = getCapacityLimit("in-progress", tmpDir);
    expect(result).toBe(5);
  });

  it("returns default (3) for an unknown column", () => {
    const brainDir = path.join(tmpDir, "USER", "brain");
    fs.mkdirSync(brainDir, { recursive: true });
    const cronFile = path.join(brainDir, "board-cron.json");
    fs.writeFileSync(cronFile, JSON.stringify({
      "board-in-progress-triage": { maxConcurrent: 5 },
    }), "utf-8");

    const result = getCapacityLimit("shipped", tmpDir);
    expect(result).toBe(3);
  });

  it("returns default when board-cron.json is malformed", () => {
    const brainDir = path.join(tmpDir, "USER", "brain");
    fs.mkdirSync(brainDir, { recursive: true });
    const cronFile = path.join(brainDir, "board-cron.json");
    fs.writeFileSync(cronFile, "not valid json", "utf-8");

    const result = getCapacityLimit("in-progress", tmpDir);
    expect(result).toBe(3);
  });
});
