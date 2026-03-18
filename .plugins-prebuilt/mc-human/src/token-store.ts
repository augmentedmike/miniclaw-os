/**
 * token-store.ts — one-time URL token management
 *
 * Tokens expire on first use OR when timeout elapses.
 */

import * as crypto from "node:crypto";

export interface TokenRecord {
  token: string;
  createdAt: number;
  expiresAt: number;
  used: boolean;
}

export class TokenStore {
  private tokens = new Map<string, TokenRecord>();

  generate(ttlMs: number): string {
    const token = crypto.randomBytes(24).toString("base64url");
    const now = Date.now();
    this.tokens.set(token, {
      token,
      createdAt: now,
      expiresAt: now + ttlMs,
      used: false,
    });
    return token;
  }

  validate(token: string): boolean {
    const rec = this.tokens.get(token);
    if (!rec) return false;
    if (rec.used) return false;
    if (Date.now() > rec.expiresAt) {
      this.tokens.delete(token);
      return false;
    }
    return true;
  }

  /** Mark a token as used (one-time). Returns false if already invalid. */
  consume(token: string): boolean {
    if (!this.validate(token)) return false;
    const rec = this.tokens.get(token)!;
    rec.used = true;
    return true;
  }

  delete(token: string): void {
    this.tokens.delete(token);
  }
}
