import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const LOG_DIR = join(process.env.HOME || "", ".openclaw", "logs");
const LOG_FILE = join(LOG_DIR, "mc-web-chat.log");

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let minLevel: Level = (process.env.MC_LOG_LEVEL as Level) || "info";

function ts(): string {
  return new Date().toISOString();
}

function emit(level: Level, msg: string) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
  const line = `${ts()} [${level.toUpperCase().padEnd(5)}] ${msg}`;
  console.log(line);
  try {
    appendFileSync(LOG_FILE, line + "\n");
  } catch { /* don't crash on log write failure */ }
}

export const log = {
  debug: (msg: string) => emit("debug", msg),
  info:  (msg: string) => emit("info", msg),
  warn:  (msg: string) => emit("warn", msg),
  error: (msg: string) => emit("error", msg),

  /** Start a timer — returns a function that logs elapsed ms when called */
  time(label: string): () => void {
    const start = performance.now();
    return () => {
      const ms = (performance.now() - start).toFixed(1);
      emit("info", `${label} completed in ${ms}ms`);
    };
  },

  setLevel(level: Level) { minLevel = level; },
  get file() { return LOG_FILE; },
};
