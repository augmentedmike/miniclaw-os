/**
 * Server-side token store for sensitive save operations.
 * After password verification, a short-lived nonce is issued.
 * Save endpoints validate the nonce before proceeding.
 */

import { randomBytes } from "node:crypto";

interface TokenEntry {
  expiresAt: number;
}

// In-memory store — tokens live for 5 minutes max
const tokens = new Map<string, TokenEntry>();

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_TOKENS = 100;

// Rate limiting for verify-password
const attempts = new Map<string, number[]>();
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_MAX = 5; // 5 attempts per minute

/** Clean expired tokens */
function gc() {
  const now = Date.now();
  for (const [k, v] of tokens) {
    if (v.expiresAt <= now) tokens.delete(k);
  }
}

/** Issue a new sensitive-save token */
export function issueToken(): string {
  gc();
  // Evict oldest if at capacity
  if (tokens.size >= MAX_TOKENS) {
    const oldest = tokens.keys().next().value;
    if (oldest) tokens.delete(oldest);
  }
  const token = randomBytes(32).toString("hex");
  tokens.set(token, { expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

/** Validate and consume a token (single-use) */
export function consumeToken(token: string | undefined | null): boolean {
  if (!token || typeof token !== "string") return false;
  gc();
  const entry = tokens.get(token);
  if (!entry) return false;
  tokens.delete(token); // single-use
  return entry.expiresAt > Date.now();
}

/** Rate-limit check for password verification. Returns true if allowed. */
export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW_MS;
  let hits = attempts.get(ip) || [];
  hits = hits.filter((t) => t > windowStart);
  if (hits.length >= RATE_MAX) {
    attempts.set(ip, hits);
    return false;
  }
  hits.push(now);
  attempts.set(ip, hits);
  return true;
}
