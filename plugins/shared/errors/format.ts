/**
 * shared/errors/format.ts
 *
 * Shared error formatting utility for the miniclaw-os plugin ecosystem.
 * Produces structured, user-friendly error messages with actionable suggestions.
 *
 * Usage:
 *   import { formatPluginError, formatUserError } from "../shared/errors/format.js";
 *   console.error(formatPluginError("mc-kb", "add", err, ["Run: openclaw mc-kb list to verify entries"]));
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface PluginErrorOptions {
  /** Show stack trace (only in debug mode). Default: false */
  showStack?: boolean;
  /** Exit code hint: 1 = user error, 2 = system/config error */
  exitCode?: 1 | 2;
}

// ── Core formatter ───────────────────────────────────────────────────────────

/**
 * Extract a clean error message from an unknown thrown value.
 * Never exposes raw stack traces to users.
 */
export function extractMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

/**
 * Format a plugin error into a structured, user-friendly message.
 *
 * @param plugin - Plugin name (e.g. "mc-kb", "mc-board", "mc-email")
 * @param operation - Operation that failed (e.g. "add", "search", "send")
 * @param err - The caught error (unknown type from catch blocks)
 * @param suggestions - Actionable fix suggestions (e.g. "Run: openclaw mc-kb list")
 * @param opts - Additional options (showStack, exitCode)
 *
 * @example
 *   formatPluginError("mc-kb", "add", err, [
 *     "Check that the entry type is valid: openclaw mc-kb stats",
 *     "Run: openclaw mc-doctor if this persists",
 *   ]);
 *   // Output:
 *   // [mc-kb] add failed: Invalid type "foo"
 *   //   → Check that the entry type is valid: openclaw mc-kb stats
 *   //   → Run: openclaw mc-doctor if this persists
 */
export function formatPluginError(
  plugin: string,
  operation: string,
  err: unknown,
  suggestions: string[] = [],
  opts: PluginErrorOptions = {},
): string {
  const message = extractMessage(err);
  const lines: string[] = [];

  lines.push(`[${plugin}] ${operation} failed: ${message}`);

  for (const suggestion of suggestions) {
    lines.push(`  → ${suggestion}`);
  }

  if (opts.showStack && err instanceof Error && err.stack) {
    lines.push("");
    lines.push("Stack trace:");
    lines.push(err.stack);
  }

  return lines.join("\n");
}

/**
 * Format a user-facing validation or "not found" error.
 * Simpler than formatPluginError — no plugin/operation prefix.
 *
 * @param message - The error message
 * @param suggestions - Actionable fix suggestions
 */
export function formatUserError(
  message: string,
  suggestions: string[] = [],
): string {
  const lines = [message];
  for (const suggestion of suggestions) {
    lines.push(`  → ${suggestion}`);
  }
  return lines.join("\n");
}

/**
 * Standard "run mc-doctor" suggestion string.
 * Use this in suggestions arrays for unrecoverable/unexpected errors.
 */
export const DOCTOR_SUGGESTION = "Run: openclaw mc-doctor — to diagnose configuration issues";
