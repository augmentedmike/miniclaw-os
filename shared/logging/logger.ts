/**
 * shared/logging/logger.ts
 *
 * Structured JSON logger for the miniclaw-os plugin ecosystem.
 *
 * JSON Schema:
 *   { timestamp, level, name, message, ...context }
 *
 * Output format is controlled by the MINICLAW_LOG_FORMAT env var:
 *   json   → one JSON object per line (default in non-TTY)
 *   text   → human-readable "[HH:MM:SS] [LEVEL] [name] message" (default in TTY)
 *
 * Usage:
 *   import { createLogger } from "../shared/logging/logger.js";
 *   const log = createLogger("mc-board");
 *   log.info("Card created", { cardId: "crd_abc123" });
 */

import process from "node:process";

// ── Level definitions ──────────────────────────────────────────────────────

export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal", "silent"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Infinity,
};

// ── JSON log entry schema ──────────────────────────────────────────────────

/**
 * The canonical structured log entry.
 * All fields except `context` are always present in JSON output.
 */
export interface LogEntry {
  /** ISO-8601 UTC timestamp, e.g. "2026-03-06T19:00:00.000Z" */
  timestamp: string;
  /** Severity level */
  level: Exclude<LogLevel, "silent">;
  /** Logger name (plugin id or subsystem) */
  name: string;
  /** Human-readable message */
  message: string;
  /** Optional structured context fields */
  context?: Record<string, unknown>;
}

// ── Output format ──────────────────────────────────────────────────────────

export type OutputFormat = "json" | "text";

function resolveFormat(): OutputFormat {
  const env = process.env.MINICLAW_LOG_FORMAT?.trim().toLowerCase();
  if (env === "json") return "json";
  if (env === "text") return "text";
  // Auto-detect: use text when stdout is a TTY, JSON otherwise.
  return process.stdout.isTTY ? "text" : "json";
}

// ── Text formatting helpers ────────────────────────────────────────────────

const LEVEL_LABELS: Record<Exclude<LogLevel, "silent">, string> = {
  trace: "TRACE",
  debug: "DEBUG",
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
  fatal: "FATAL",
};

function formatTimestamp(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatTextLine(
  level: Exclude<LogLevel, "silent">,
  name: string,
  message: string,
  context?: Record<string, unknown>,
): string {
  const time = formatTimestamp();
  const label = LEVEL_LABELS[level];
  const ctx =
    context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : "";
  return `[${time}] [${label}] [${name}] ${message}${ctx}`;
}

function formatJsonLine(
  level: Exclude<LogLevel, "silent">,
  name: string,
  message: string,
  context?: Record<string, unknown>,
): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    name,
    message,
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
  };
  return JSON.stringify(entry);
}

// ── Sink ───────────────────────────────────────────────────────────────────

function writeLine(level: Exclude<LogLevel, "silent">, line: string): void {
  if (level === "error" || level === "fatal") {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

// ── Logger factory ─────────────────────────────────────────────────────────

export interface LoggerOptions {
  /** Minimum level to emit. Defaults to MINICLAW_LOG_LEVEL env var, then "info". */
  level?: LogLevel;
  /** Output format override. Defaults to MINICLAW_LOG_FORMAT env var, then auto-detect. */
  format?: OutputFormat;
}

export interface Logger {
  readonly name: string;
  readonly level: LogLevel;
  readonly format: OutputFormat;

  isEnabled(level: LogLevel): boolean;

  trace(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  fatal(message: string, context?: Record<string, unknown>): void;

  /** Return a child logger that inherits format/level but adds a subsystem suffix. */
  child(subsystem: string): Logger;
}

function resolveMinLevel(opts?: LoggerOptions): LogLevel {
  if (opts?.level && LOG_LEVELS.includes(opts.level)) {
    return opts.level;
  }
  const env = process.env.MINICLAW_LOG_LEVEL?.trim().toLowerCase() as LogLevel | undefined;
  if (env && LOG_LEVELS.includes(env)) {
    return env;
  }
  return "info";
}

export function createLogger(name: string, opts?: LoggerOptions): Logger {
  const level = resolveMinLevel(opts);
  const format = opts?.format ?? resolveFormat();
  const minRank = LEVEL_RANK[level];

  const emit = (
    lvl: Exclude<LogLevel, "silent">,
    message: string,
    context?: Record<string, unknown>,
  ) => {
    if (LEVEL_RANK[lvl] < minRank) return;
    const line =
      format === "json"
        ? formatJsonLine(lvl, name, message, context)
        : formatTextLine(lvl, name, message, context);
    writeLine(lvl, line);
  };

  const logger: Logger = {
    name,
    level,
    format,
    isEnabled: (lvl) => LEVEL_RANK[lvl] >= minRank && lvl !== "silent",
    trace: (msg, ctx) => emit("trace", msg, ctx),
    debug: (msg, ctx) => emit("debug", msg, ctx),
    info: (msg, ctx) => emit("info", msg, ctx),
    warn: (msg, ctx) => emit("warn", msg, ctx),
    error: (msg, ctx) => emit("error", msg, ctx),
    fatal: (msg, ctx) => emit("fatal", msg, ctx),
    child: (subsystem) => createLogger(`${name}/${subsystem}`, { level, format }),
  };

  return logger;
}
