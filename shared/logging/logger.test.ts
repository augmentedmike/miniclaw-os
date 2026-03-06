/**
 * shared/logging/logger.test.ts
 *
 * Unit tests for the structured JSON logger.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, type LogEntry, type Logger } from "./logger.js";

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
    vi.unstubAllEnvs();
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
    vi.unstubAllEnvs();
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
    vi.stubEnv("MINICLAW_LOG_LEVEL", "debug");
    const log = createLogger("env-level-test", { format: "json" });
    expect(log.level).toBe("debug");
  });
});

describe("createLogger — text format", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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
    vi.stubEnv("MINICLAW_LOG_FORMAT", "json");
    const log = createLogger("env-format-test");
    expect(log.format).toBe("json");
  });

  it("picks up MINICLAW_LOG_FORMAT=text from env", () => {
    vi.stubEnv("MINICLAW_LOG_FORMAT", "text");
    const log = createLogger("env-format-text");
    expect(log.format).toBe("text");
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
