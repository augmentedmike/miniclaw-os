/**
 * handshake.ts — Mutual Ed25519 challenge-response protocol
 *
 * Three-step mutual authentication:
 *
 *   Step 1  CHALLENGE  (initiator → responder)
 *   Step 2  RESPONSE   (responder → initiator) — signs the challenge
 *   Step 3  ACK        (initiator → responder) — verifies response, signs counter-nonce
 *
 * After ACK is verified by the responder, both sides have proven possession
 * of their respective private keys. Session recorded in trustDir/sessions/.
 *
 * Canonical signed payloads (newline-separated fields, UTF-8):
 *   CHALLENGE: "TRUST_CHALLENGE\n{from}\n{to}\n{nonce}\n{ts}"
 *   RESPONSE:  "TRUST_RESPONSE\n{from}\n{to}\n{challengeNonce}\n{challengeTs}"
 *   ACK:       "TRUST_ACK\n{from}\n{to}\n{responseNonce}\n{responseTs}"
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { KeyObject } from "node:crypto";
import { signMessage, verifyMessage } from "./keys.js";

// ---- Message types ----

export interface ChallengeMsg {
  type: "TRUST_CHALLENGE";
  version: 1;
  from: string;
  to: string;
  nonce: string;   // 32 random bytes, hex
  ts: number;      // unix ms
}

export interface ResponseMsg {
  type: "TRUST_RESPONSE";
  version: 1;
  from: string;
  to: string;
  challengeSig: string;  // sig over canonical CHALLENGE payload, base64url
  nonce2: string;        // counter-nonce from responder
  ts2: number;
}

export interface AckMsg {
  type: "TRUST_ACK";
  version: 1;
  from: string;
  to: string;
  responseSig: string;  // sig over canonical RESPONSE payload, base64url
}

export interface Session {
  peer: string;
  initiatedBy: string;
  establishedAt: number;
  expiresAt: number;
}

// ---- Canonical payload builders ----

function challengePayload(msg: ChallengeMsg): string {
  return `TRUST_CHALLENGE\n${msg.from}\n${msg.to}\n${msg.nonce}\n${msg.ts}`;
}

function responsePayload(msg: ResponseMsg): string {
  return `TRUST_RESPONSE\n${msg.from}\n${msg.to}\n${msg.nonce2}\n${msg.ts2}`;
}

// ---- Step 1: Initiator creates challenge ----

export function createChallenge(from: string, to: string): ChallengeMsg {
  return {
    type: "TRUST_CHALLENGE",
    version: 1,
    from,
    to,
    nonce: crypto.randomBytes(32).toString("hex"),
    ts: Date.now(),
  };
}

// ---- Step 2: Responder signs challenge, creates response ----

export function respondToChallenge(
  challenge: ChallengeMsg,
  responderPrivKey: KeyObject,
  myAgentId: string,
): ResponseMsg {
  if (challenge.to !== myAgentId) {
    throw new Error(`Challenge addressed to "${challenge.to}", but I am "${myAgentId}"`);
  }
  if (Date.now() - challenge.ts > 60_000) {
    throw new Error("Challenge expired (>60s old)");
  }

  const payload = challengePayload(challenge);
  const challengeSig = signMessage(payload, responderPrivKey);

  return {
    type: "TRUST_RESPONSE",
    version: 1,
    from: myAgentId,
    to: challenge.from,
    challengeSig,
    nonce2: crypto.randomBytes(32).toString("hex"),
    ts2: Date.now(),
  };
}

// ---- Step 3: Initiator verifies response, issues ACK ----

export function completeHandshake(
  originalChallenge: ChallengeMsg,
  response: ResponseMsg,
  responderPubKey: KeyObject,
  initiatorPrivKey: KeyObject,
  myAgentId: string,
  trustDir: string,
  sessionTtlMs: number,
): AckMsg {
  if (response.to !== myAgentId) {
    throw new Error(`Response addressed to "${response.to}", but I am "${myAgentId}"`);
  }
  if (response.from !== originalChallenge.to) {
    throw new Error(`Response from unexpected agent "${response.from}"`);
  }
  if (Date.now() - response.ts2 > 60_000) {
    throw new Error("Response expired (>60s old)");
  }

  // Verify responder signed the original challenge
  const expectedPayload = challengePayload(originalChallenge);
  const valid = verifyMessage(expectedPayload, response.challengeSig, responderPubKey);
  if (!valid) {
    throw new Error(`Signature verification FAILED — "${response.from}" could not prove identity`);
  }

  // Sign the response payload (counter-nonce)
  const respPayload = responsePayload(response);
  const responseSig = signMessage(respPayload, initiatorPrivKey);

  // Record session
  _saveSession(trustDir, response.from, myAgentId, sessionTtlMs);

  return {
    type: "TRUST_ACK",
    version: 1,
    from: myAgentId,
    to: response.from,
    responseSig,
  };
}

// ---- Step 4: Responder verifies ACK ----

export function verifyAck(
  response: ResponseMsg,
  ack: AckMsg,
  initiatorPubKey: KeyObject,
  myAgentId: string,
  trustDir: string,
  sessionTtlMs: number,
): void {
  if (ack.to !== myAgentId) {
    throw new Error(`ACK addressed to "${ack.to}", but I am "${myAgentId}"`);
  }

  const respPayload = responsePayload(response);
  const valid = verifyMessage(respPayload, ack.responseSig, initiatorPubKey);
  if (!valid) {
    throw new Error(`ACK signature FAILED — "${ack.from}" could not prove identity`);
  }

  // Record session
  _saveSession(trustDir, ack.from, myAgentId, sessionTtlMs);
}

// ---- Session management ----

export function sessionPath(trustDir: string, peerId: string): string {
  return path.join(trustDir, "sessions", `${peerId}.json`);
}

export function loadSession(trustDir: string, peerId: string): Session | null {
  const p = sessionPath(trustDir, peerId);
  if (!fs.existsSync(p)) return null;
  try {
    const s = JSON.parse(fs.readFileSync(p, "utf-8")) as Session;
    if (Date.now() > s.expiresAt) {
      fs.unlinkSync(p);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function listSessions(trustDir: string): Session[] {
  const dir = path.join(trustDir, "sessions");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .flatMap(f => {
      try {
        const s = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")) as Session;
        if (Date.now() > s.expiresAt) { fs.unlinkSync(path.join(dir, f)); return []; }
        return [s];
      } catch { return []; }
    });
}

function _saveSession(
  trustDir: string,
  peer: string,
  initiatedBy: string,
  ttlMs: number,
): void {
  fs.mkdirSync(path.join(trustDir, "sessions"), { recursive: true });
  const session: Session = {
    peer,
    initiatedBy,
    establishedAt: Date.now(),
    expiresAt: Date.now() + ttlMs,
  };
  fs.writeFileSync(sessionPath(trustDir, peer), JSON.stringify(session, null, 2));
}
