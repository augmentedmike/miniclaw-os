/**
 * shared/logging/logger.test.ts
 *
 * Unit tests for the structured JSON logger.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi, mock } from "bun:test";
import { createLogger, type LogEntry, type Logger } from "./logger.js";

// ── Env stubbing (bun:test doesn't have vi.stubEnv / vi.unstubAllEnvs) ───
const envBackup: Record<string, string | undefined> = {};
function stubEnv(key: string, value: string) {
  if (!(key in envBackup)) envBackup[key] = process.env[key];
  process.env[key] = value;
}
function unstubAllEnvs() {
  for (const [key, val] of Object.entries(envBackup)) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
  for (const k of Object.keys(envBackup)) delete envBackup[k];
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Capture stdout/stderr writes and return them as parsed JSON lines or raw strings. */
function captureOutput() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const spyOut = vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    stdout.push(String(chunk));
    return true;
  });
  const spyErr = vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    stderr.push(String(chunk));
    return true;
  });
  return {
    stdout,
    stderr,
    restore: () => {
      spyOut.mockRestore();
      spyErr.mockRestore();
    },
  };
}

function parseJsonLines(lines: string[]): LogEntry[] {
  return lines
    .flatMap((l) => l.split("\n"))
    .filter(Boolean)
    .map((l) => JSON.parse(l) as LogEntry);
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe("createLogger — JSON format", () => {
  let log: Logger;
  let out: ReturnType<typeof captureOutput>;

  beforeEach(() => {
    // Force JSON format regardless of TTY detection.
    out = captureOutput();
    log = createLogger("test-plugin", { format: "json", level: "trace" });
  });

  afterEach(() => {
    out.restore();
    unstubAllEnvs();
  });

  it("emits valid JSON for info level", () => {
    log.info("hello world");
    const entries = parseJsonLines(out.stdout);
    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.level).toBe("info");
    expect(e.name).toBe("test-plugin");
    expect(e.message).toBe("hello world");
    expect(typeof e.timestamp).toBe("string");
    expect(() => new Date(e.timestamp)).not.toThrow();
  });

  it("includes context fields in JSON output", () => {
    log.info("card created", { cardId: "crd_abc123", priority: "high" });
    const entries = parseJsonLines(out.stdout);
    expect(entries[0].context).toEqual({ cardId: "crd_abc123", priority: "high" });
  });

  it("omits context field when no context provided", () => {
    log.info("plain message");
    const entries = parseJsonLines(out.stdout);
    expect(entries[0]).not.toHaveProperty("context");
  });

  it("emits all log levels with correct level field", () => {
    log.trace("t");
    log.debug("d");
    log.info("i");
    log.warn("w");
    log.error("e");
    log.fatal("f");

    const stdoutEntries = parseJsonLines(out.stdout);
    const stderrEntries = parseJsonLines(out.stderr);
    const all = [...stdoutEntries, ...stderrEntries];
    const levels = all.map((e) => e.level).sort();
    expect(levels).toEqual(["debug", "error", "fatal", "info", "trace", "warn"].sort());
  });

  it("routes error and fatal to stderr", () => {
    log.error("something broke");
    log.fatal("unrecoverable");
    expect(out.stderr.join("")).toContain("something broke");
    expect(out.stderr.join("")).toContain("unrecoverable");
    // stdout should have nothing from these two
    const stdoutContent = out.stdout.join("");
    expect(stdoutContent).not.toContain("something broke");
  });

  it("timestamp is a valid ISO-8601 UTC string", () => {
    log.info("check timestamp");
    const entries = parseJsonLines(out.stdout);
    const ts = entries[0].timestamp;
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/);
  });

  it("name field matches the logger name", () => {
    log.info("name check");
    const entries = parseJsonLines(out.stdout);
    expect(entries[0].name).toBe("test-plugin");
  });

  it("child logger inherits format and level, appends subsystem to name", () => {
    const child = log.child("board");
    child.info("child message");
    const entries = parseJsonLines(out.stdout);
    expect(entries[0].name).toBe("test-plugin/board");
    expect(entries[0].level).toBe("info");
  });
});

describe("createLogger — level filtering", () => {
  afterEach(() => {
    unstubAllEnvs();
  });

  it("suppresses messages below the configured level", () => {
    const out = captureOutput();
    const log = createLogger("filter-test", { format: "json", level: "warn" });
    log.debug("hidden");
    log.info("also hidden");
    log.warn("visible");
    const entries = parseJsonLines(out.stdout);
    out.restore();
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("warn");
  });

  it("silent level suppresses all output", () => {
    const out = captureOutput();
    const log = createLogger("silent-test", { format: "json", level: "silent" });
    log.info("should not appear");
    log.error("neither should this");
    out.restore();
    expect(out.stdout.join("")).toBe("");
    expect(out.stderr.join("")).toBe("");
  });

  it("isEnabled returns true only for levels at or above configured level", () => {
    const log = createLogger("enabled-test", { format: "json", level: "warn" });
    expect(log.isEnabled("trace")).toBe(false);
    expect(log.isEnabled("debug")).toBe(false);
    expect(log.isEnabled("info")).toBe(false);
    expect(log.isEnabled("warn")).toBe(true);
    expect(log.isEnabled("error")).toBe(true);
    expect(log.isEnabled("fatal")).toBe(true);
    expect(log.isEnabled("silent")).toBe(false);
  });

  it("picks up MINICLAW_LOG_LEVEL from env", () => {
    stubEnv("MINICLAW_LOG_LEVEL", "debug");
    const log = createLogger("env-level-test", { format: "json" });
    expect(log.level).toBe("debug");
  });
});

describe("createLogger — text format", () => {
  afterEach(() => {
    unstubAllEnvs();
  });

  it("emits human-readable text lines", () => {
    const out = captureOutput();
    const log = createLogger("text-test", { format: "text", level: "info" });
    log.info("hello from text mode");
    out.restore();
    const lines = out.stdout.join("").trim().split("\n");
    // Should NOT be JSON
    expect(() => JSON.parse(lines[0])).toThrow();
    expect(lines[0]).toContain("text-test");
    expect(lines[0]).toContain("hello from text mode");
  });

  it("includes context JSON inline in text output", () => {
    const out = captureOutput();
    const log = createLogger("text-ctx", { format: "text", level: "info" });
    log.info("with context", { key: "value" });
    out.restore();
    expect(out.stdout.join("")).toContain('{"key":"value"}');
  });

  it("picks up MINICLAW_LOG_FORMAT=json from env", () => {
    stubEnv("MINICLAW_LOG_FORMAT", "json");
    const log = createLogger("env-format-test");
    expect(log.format).toBe("json");
  });

  it("picks up MINICLAW_LOG_FORMAT=text from env", () => {
    stubEnv("MINICLAW_LOG_FORMAT", "text");
    const log = createLogger("env-format-text");
    expect(log.format).toBe("text");
  });
});

describe("createLogger — file logging with rotation", () => {
  function makeLogPath(): string {
    return path.join(os.tmpdir(), `miniclaw-log-test-${crypto.randomUUID()}.log`);
  }

  function cleanup(...files: string[]) {
    for (const f of files) {
      try { fs.rmSync(f, { force: true }); } catch { /* ignore */ }
    }
  }

  let logPath = "";

  beforeEach(() => {
    logPath = makeLogPath();
  });

  afterEach(() => {
    unstubAllEnvs();
    cleanup(logPath, ...Array.from({ length: 10 }, (_, i) => `${logPath}.${i + 1}`));
  });

  it("writes JSON lines to the specified file", () => {
    const out = captureOutput();
    const log = createLogger("file-test", { format: "json", level: "info", file: logPath });
    log.info("hello file", { key: "val" });
    out.restore();

    expect(fs.existsSync(logPath)).toBe(true);
    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0]) as LogEntry;
    expect(entry.level).toBe("info");
    expect(entry.name).toBe("file-test");
    expect(entry.message).toBe("hello file");
    expect(entry.context).toEqual({ key: "val" });
  });

  it("file output is always valid JSON regardless of console format", () => {
    const out = captureOutput();
    const log = createLogger("file-json", { format: "text", level: "info", file: logPath });
    log.info("text mode but file is json");
    out.restore();

    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(() => JSON.parse(lines[0])).not.toThrow();
  });

  it("rotates the log when maxFileBytes is exceeded", () => {
    const out = captureOutput();
    const log = createLogger("rotation-test", {
      format: "json", level: "info",
      file: logPath, maxFileBytes: 512, maxBackups: 3,
    });

    for (let i = 0; i < 100; i++) {
      log.info(`rotation-test-${i}-${"a".repeat(60)}`);
    }
    out.restore();

    expect(fs.existsSync(logPath)).toBe(true);
    expect(fs.statSync(logPath).size).toBeLessThanOrEqual(512 + 512);
    expect(fs.existsSync(`${logPath}.1`)).toBe(true);
  });

  it("does not keep more than maxBackups rotated files", () => {
    const out = captureOutput();
    const maxBackups = 3;
    const log = createLogger("retention-test", {
      format: "json", level: "info",
      file: logPath, maxFileBytes: 128, maxBackups,
    });

    for (let i = 0; i < 500; i++) {
      log.info(`retention-${i}-${"c".repeat(50)}`);
    }
    out.restore();

    expect(fs.existsSync(`${logPath}.${maxBackups + 1}`)).toBe(false);
  });

  it("all retained files contain only valid JSON lines (no data loss)", () => {
    const out = captureOutput();
    const log = createLogger("no-loss-test", {
      format: "json", level: "info",
      file: logPath, maxFileBytes: 256, maxBackups: 3,
    });

    for (let i = 0; i < 80; i++) {
      log.info(`no-loss-${i}-${"e".repeat(30)}`);
    }
    out.restore();

    const files = [logPath, `${logPath}.1`, `${logPath}.2`, `${logPath}.3`].filter((f) =>
      fs.existsSync(f),
    );
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const lines = fs.readFileSync(f, "utf-8").trim().split("\n").filter(Boolean);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    }
  });

  it("suppresses writes and warns once when maxBackups=0 and cap is reached", () => {
    // Silence console output separately so it doesn't interfere with stderrSpy
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true as unknown as ReturnType<typeof process.stdout.write>);
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true as unknown as ReturnType<typeof process.stderr.write>);

    const log = createLogger("cap-test", {
      format: "json", level: "info",
      file: logPath, maxFileBytes: 512, maxBackups: 0,
    });

    for (let i = 0; i < 200; i++) {
      log.info(`cap-test-${i}-${"f".repeat(60)}`);
    }

    stdoutSpy.mockRestore();

    expect(fs.existsSync(`${logPath}.1`)).toBe(false);
    expect(fs.statSync(logPath).size).toBeLessThanOrEqual(512 + 512);

    const capWarnings = stderrSpy.mock.calls
      .map(([firstArg]) => String(firstArg))
      .filter((line) => line.includes("log file size cap reached"));
    expect(capWarnings).toHaveLength(1);
    stderrSpy.mockRestore();
  });

  it("level filtering still applies to file output", () => {
    const out = captureOutput();
    const log = createLogger("level-filter-file", {
      format: "json", level: "warn",
      file: logPath,
    });
    log.debug("hidden");
    log.info("also hidden");
    log.warn("visible");
    out.restore();

    const lines = fs.readFileSync(logPath, "utf-8").trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(1);
    expect((JSON.parse(lines[0]) as LogEntry).level).toBe("warn");
  });
});

describe("createLogger — JSON schema compliance", () => {
  it("every JSON line can be parsed by JSON.parse", () => {
    const out = captureOutput();
    const log = createLogger("schema-test", { format: "json", level: "trace" });
    log.trace("t");
    log.debug("d");
    log.info("i");
    log.warn("w");
    // error/fatal go to stderr — test separately
    out.restore();

    const allLines = out.stdout
      .join("")
      .split("\n")
      .filter(Boolean);

    for (const line of allLines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    expect(allLines.length).toBe(4);
  });

  it("required fields are present in every JSON entry", () => {
    const out = captureOutput();
    const log = createLogger("required-fields", { format: "json", level: "info" });
    log.info("check fields", { extra: 42 });
    out.restore();

    const entries = parseJsonLines(out.stdout);
    for (const e of entries) {
      expect(typeof e.timestamp).toBe("string");
      expect(typeof e.level).toBe("string");
      expect(typeof e.name).toBe("string");
      expect(typeof e.message).toBe("string");
    }
  });
});
