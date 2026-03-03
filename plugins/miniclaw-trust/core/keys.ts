/**
 * keys.ts — Ed25519 key management for miniclaw-trust
 *
 * Private keys are ONLY stored in vault (age-encrypted at rest).
 * They are never written to disk in plaintext, never used for web/TLS,
 * and are purpose-generated for agent identity only.
 *
 * Encoding: all key material is base64url (no +/= shell issues)
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

export const VAULT_KEY_NAME = "trust-identity-privkey";

// ---- Key generation ----

export interface KeyPair {
  privateKeyB64: string;  // base64url PKCS#8 DER — goes to vault only
  publicKeyB64: string;   // base64url SPKI DER  — shareable
}

export function generateKeyPair(): KeyPair {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "der" },
    publicKeyEncoding:  { type: "spki",  format: "der" },
  });
  return {
    privateKeyB64: (privateKey as Buffer).toString("base64url"),
    publicKeyB64:  (publicKey  as Buffer).toString("base64url"),
  };
}

// ---- Vault integration ----

export function storePrivateKey(privateKeyB64: string, vaultBin: string): void {
  const result = spawnSync(vaultBin, ["set", VAULT_KEY_NAME, "-"], {
    input: privateKeyB64,
    encoding: "utf-8",
  });
  if (result.error) throw new Error(`vault write failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`vault write failed: ${result.stderr}`);
}

export function loadPrivateKey(vaultBin: string): crypto.KeyObject {
  const result = spawnSync(vaultBin, ["export", VAULT_KEY_NAME], { encoding: "utf-8" });
  if (result.error) throw new Error(`vault read failed: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`vault read failed — is trust initialized? Run: openclaw trust init`);
  const der = Buffer.from(result.stdout.trim(), "base64url");
  return crypto.createPrivateKey({ key: der, type: "pkcs8", format: "der" });
}

// ---- Trust store (peer public keys) ----

export function peerPubKeyPath(trustDir: string, agentId: string): string {
  return path.join(trustDir, "peers", `${agentId}.pub`);
}

export function savePeerPubKey(trustDir: string, agentId: string, publicKeyB64: string): void {
  fs.mkdirSync(path.join(trustDir, "peers"), { recursive: true });
  const filePath = peerPubKeyPath(trustDir, agentId);
  // Validate it's a real Ed25519 public key before saving
  loadPubKeyObject(publicKeyB64);
  fs.writeFileSync(filePath, publicKeyB64 + "\n", { mode: 0o644 });
}

export function loadPeerPubKey(trustDir: string, agentId: string): crypto.KeyObject {
  const filePath = peerPubKeyPath(trustDir, agentId);
  if (!fs.existsSync(filePath)) {
    throw new Error(`No trusted public key for agent "${agentId}". Run: openclaw trust add-peer ${agentId} <pubkey>`);
  }
  const b64 = fs.readFileSync(filePath, "utf-8").trim();
  return loadPubKeyObject(b64);
}

export function listPeers(trustDir: string): string[] {
  const peersDir = path.join(trustDir, "peers");
  if (!fs.existsSync(peersDir)) return [];
  return fs.readdirSync(peersDir)
    .filter(f => f.endsWith(".pub"))
    .map(f => f.slice(0, -4));
}

function loadPubKeyObject(b64: string): crypto.KeyObject {
  try {
    const der = Buffer.from(b64, "base64url");
    return crypto.createPublicKey({ key: der, type: "spki", format: "der" });
  } catch {
    throw new Error("Invalid public key — must be base64url Ed25519 SPKI DER");
  }
}

// ---- Signing / Verification ----

/**
 * Sign an arbitrary message. Returns base64url signature.
 * Message should be the canonical bytes for the operation being signed.
 */
export function signMessage(message: string | Buffer, privateKey: crypto.KeyObject): string {
  const buf = typeof message === "string" ? Buffer.from(message, "utf-8") : message;
  const sig = crypto.sign(null, buf, privateKey);
  return sig.toString("base64url");
}

/**
 * Verify a signature. Throws if invalid, returns true if valid.
 */
export function verifyMessage(
  message: string | Buffer,
  signatureB64: string,
  publicKey: crypto.KeyObject,
): boolean {
  const buf = typeof message === "string" ? Buffer.from(message, "utf-8") : message;
  const sig = Buffer.from(signatureB64, "base64url");
  return crypto.verify(null, buf, publicKey, sig);
}
