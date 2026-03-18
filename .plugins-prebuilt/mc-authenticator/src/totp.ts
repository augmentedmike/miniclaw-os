import crypto from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(encoded: string): Buffer {
  const input = encoded.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  if (input.length === 0) throw new Error("Empty base32 string");
  for (const ch of input) {
    if (!BASE32_ALPHABET.includes(ch)) {
      throw new Error(`Invalid base32 character: ${ch}`);
    }
  }

  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const ch of input) {
    value = (value << 5) | BASE32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}

export interface TOTPOptions {
  period?: number;
  digits?: number;
  algorithm?: string;
  timestamp?: number;
}

export function generateTOTP(secret: string, options?: TOTPOptions): string {
  const period = options?.period ?? 30;
  const digits = options?.digits ?? 6;
  const algorithm = options?.algorithm ?? "sha1";
  const timestamp = options?.timestamp ?? Date.now();

  const counter = Math.floor(timestamp / 1000 / period);
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const key = base32Decode(secret);
  const hmac = crypto.createHmac(algorithm, key).update(counterBuf).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 10 ** digits;
  return otp.toString().padStart(digits, "0");
}

export interface OtpauthParams {
  secret: string;
  issuer: string;
  account: string;
  algorithm: string;
  digits: number;
  period: number;
}

export function parseOtpauthUri(uri: string): OtpauthParams {
  if (!uri.startsWith("otpauth://totp/")) {
    throw new Error("Invalid otpauth URI: must start with otpauth://totp/");
  }

  const url = new URL(uri);
  const label = decodeURIComponent(url.pathname.replace(/^\//, ""));
  const secret = url.searchParams.get("secret");
  if (!secret) throw new Error("Missing secret parameter in otpauth URI");

  let issuer = url.searchParams.get("issuer") ?? "";
  let account = label;

  if (label.includes(":")) {
    const parts = label.split(":");
    issuer = issuer || parts[0];
    account = parts.slice(1).join(":").trim();
  }

  return {
    secret,
    issuer,
    account,
    algorithm: (url.searchParams.get("algorithm") ?? "sha1").toLowerCase(),
    digits: parseInt(url.searchParams.get("digits") ?? "6", 10),
    period: parseInt(url.searchParams.get("period") ?? "30", 10),
  };
}

export function timeRemaining(period = 30): number {
  return period - (Math.floor(Date.now() / 1000) % period);
}
