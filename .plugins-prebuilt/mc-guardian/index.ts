/**
 * mc-guardian — OpenClaw plugin
 *
 * Replaces the default uncaughtException handler with one that logs non-fatal
 * errors instead of calling process.exit(1). This prevents a single plugin's
 * SqliteError, TypeError, or other unhandled rejection from crashing the
 * entire gateway and killing all in-flight conversations.
 *
 * Fatal errors (out of memory, stack overflow) still crash the process.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

const FATAL_PATTERNS = [
  /out of memory/i,
  /allocation failed/i,
  /maximum call stack/i,
  /FATAL ERROR/,
];

function isFatal(err: Error): boolean {
  const msg = err.message || "";
  const stack = err.stack || "";
  return FATAL_PATTERNS.some((p) => p.test(msg) || p.test(stack));
}

export default function register(api: OpenClawPluginApi): void {
  const cfg = (api.pluginConfig ?? {}) as { enabled?: boolean };
  const enabled = cfg.enabled ?? true;

  if (!enabled) {
    api.logger.info("mc-guardian loaded (disabled)");
    return;
  }

  const stateDir =
    (process.env.OPENCLAW_STATE_DIR ?? "").trim() ||
    path.join(os.homedir(), ".openclaw");
  const logFile = path.join(stateDir, "guardian.log");

  let absorbedCount = 0;

  function appendLog(level: string, msg: string): void {
    const line = `${new Date().toISOString()} [${level}] ${msg}\n`;
    try {
      fs.appendFileSync(logFile, line);
    } catch {
      // Best-effort logging — don't crash trying to log
    }
  }

  // Replace uncaughtException handler
  process.removeAllListeners("uncaughtException");
  process.on("uncaughtException", (err: Error) => {
    if (isFatal(err)) {
      appendLog("FATAL", `Fatal error, exiting: ${err.stack || err.message}`);
      api.logger.error(`mc-guardian: FATAL — ${err.message} — exiting`);
      process.exit(1);
    }

    absorbedCount++;
    const msg = `Absorbed uncaughtException #${absorbedCount}: ${err.stack || err.message}`;
    appendLog("WARN", msg);
    api.logger.warn(`mc-guardian: ${msg}`);
  });

  // Also handle unhandled promise rejections
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", (reason: unknown) => {
    absorbedCount++;
    const msg =
      reason instanceof Error
        ? reason.stack || reason.message
        : String(reason);
    const logMsg = `Absorbed unhandledRejection #${absorbedCount}: ${msg}`;
    appendLog("WARN", logMsg);
    api.logger.warn(`mc-guardian: ${logMsg}`);
  });

  // Status command
  api.registerCommand({
    name: "guardian_status",
    description: "Show mc-guardian absorbed error count",
    acceptsArgs: false,
    handler: () => ({
      text:
        `*mc-guardian status*\n` +
        `Enabled: ${enabled}\n` +
        `Absorbed errors: ${absorbedCount}\n` +
        `Log file: ${logFile}`,
    }),
  });

  api.logger.info(
    `mc-guardian loaded — replacing uncaughtException/unhandledRejection handlers`,
  );
}
