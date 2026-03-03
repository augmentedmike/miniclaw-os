import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import {
  generateKeyPair,
  storePrivateKey,
  loadPrivateKey,
  savePeerPubKey,
  loadPeerPubKey,
  listPeers,
  peerPubKeyPath,
  signMessage,
  verifyMessage,
} from "../core/keys.js";
import {
  createChallenge,
  respondToChallenge,
  completeHandshake,
  verifyAck,
  loadSession,
  listSessions,
  type ChallengeMsg,
  type ResponseMsg,
  type AckMsg,
} from "../core/handshake.js";

export interface TrustCliContext {
  program: Command;
  agentId: string;
  trustDir: string;
  vaultBin: string;
  sessionTtlMs: number;
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
}

export function registerTrustCommands(ctx: TrustCliContext): void {
  const { program, agentId, trustDir, vaultBin, sessionTtlMs } = ctx;

  const trust = program
    .command("trust")
    .description("Agent identity and mutual authentication (Ed25519)");

  // ---- trust init ----
  trust
    .command("init")
    .description("Generate this agent's Ed25519 identity key pair. Private key goes to vault ONLY.")
    .option("--force", "Overwrite existing key (generates new identity)")
    .action((opts: { force?: boolean }) => {
      // Check if already initialized
      if (!opts.force) {
        try {
          loadPrivateKey(vaultBin);
          console.error(`Trust already initialized for "${agentId}". Use --force to regenerate.`);
          process.exit(1);
        } catch { /* not initialized — proceed */ }
      }

      const pair = generateKeyPair();
      storePrivateKey(pair.privateKeyB64, vaultBin);

      // Save own public key to trust store so peers can add it
      savePeerPubKey(trustDir, agentId, pair.publicKeyB64);

      console.log(`Initialized trust identity for "${agentId}"`);
      console.log(`Private key: stored in vault as "trust-identity-privkey" (encrypted at rest)`);
      console.log(`Public key:  ${pair.publicKeyB64}`);
      console.log(`\nShare your public key with peers:`);
      console.log(`  openclaw trust pubkey`);
    });

  // ---- trust pubkey ----
  trust
    .command("pubkey")
    .description("Print this agent's public key (safe to share)")
    .action(() => {
      const pubFile = peerPubKeyPath(trustDir, agentId);
      if (!fs.existsSync(pubFile)) {
        console.error(`Not initialized. Run: openclaw trust init`);
        process.exit(1);
      }
      const key = fs.readFileSync(pubFile, "utf-8").trim();
      console.log(key);
    });

  // ---- trust add-peer ----
  trust
    .command("add-peer <peer-id> <pubkey>")
    .description("Register a trusted peer's public key")
    .action((peerId: string, pubkey: string) => {
      if (peerId === agentId) {
        console.error("Cannot add yourself as a peer.");
        process.exit(1);
      }
      savePeerPubKey(trustDir, peerId, pubkey);
      console.log(`Trusted peer "${peerId}" registered.`);
    });

  // ---- trust list-peers ----
  trust
    .command("list-peers")
    .description("List all trusted peers")
    .action(() => {
      const peers = listPeers(trustDir).filter(id => id !== agentId);
      if (peers.length === 0) {
        console.log("No trusted peers. Use: openclaw trust add-peer <id> <pubkey>");
        return;
      }
      for (const id of peers) {
        const session = loadSession(trustDir, id);
        const status = session
          ? `✓ session active (expires ${new Date(session.expiresAt).toISOString()})`
          : "  no active session";
        console.log(`${id}  ${status}`);
      }
    });

  // ---- trust sign ----
  trust
    .command("sign <message>")
    .description("Sign a message with this agent's private key. Outputs base64url signature.")
    .action((message: string) => {
      const privKey = loadPrivateKey(vaultBin);
      const sig = signMessage(message, privKey);
      console.log(sig);
    });

  // ---- trust verify ----
  trust
    .command("verify <peer-id> <message> <signature>")
    .description("Verify a signature from a trusted peer")
    .action((peerId: string, message: string, signature: string) => {
      try {
        const pubKey = loadPeerPubKey(trustDir, peerId);
        const valid = verifyMessage(message, signature, pubKey);
        if (valid) {
          console.log(`✓ Valid signature from "${peerId}"`);
        } else {
          console.error(`✗ INVALID signature — claimed to be from "${peerId}"`);
          process.exit(1);
        }
      } catch (err) {
        console.error(String(err));
        process.exit(1);
      }
    });

  // ---- trust challenge ----
  trust
    .command("challenge <peer-id>")
    .description("Generate a challenge to initiate a handshake with a peer. Outputs JSON.")
    .action((peerId: string) => {
      const msg = createChallenge(agentId, peerId);
      console.log(JSON.stringify(msg, null, 2));
    });

  // ---- trust respond ----
  trust
    .command("respond <challenge-json>")
    .description("Respond to a handshake challenge. Pass JSON string or @file. Outputs response JSON.")
    .action((challengeArg: string) => {
      const raw = challengeArg.startsWith("@")
        ? fs.readFileSync(challengeArg.slice(1), "utf-8")
        : challengeArg;
      try {
        const challenge = JSON.parse(raw) as ChallengeMsg;
        if (challenge.type !== "TRUST_CHALLENGE") throw new Error("Not a TRUST_CHALLENGE message");
        const privKey = loadPrivateKey(vaultBin);
        const response = respondToChallenge(challenge, privKey, agentId);
        console.log(JSON.stringify(response, null, 2));
      } catch (err) {
        console.error(`Handshake respond failed: ${err}`);
        process.exit(1);
      }
    });

  // ---- trust complete ----
  trust
    .command("complete <challenge-json> <response-json>")
    .description("Verify a handshake response and output ACK. Establishes session on success.")
    .action((challengeArg: string, responseArg: string) => {
      const rawC = challengeArg.startsWith("@") ? fs.readFileSync(challengeArg.slice(1), "utf-8") : challengeArg;
      const rawR = responseArg.startsWith("@") ? fs.readFileSync(responseArg.slice(1), "utf-8") : responseArg;
      try {
        const challenge = JSON.parse(rawC) as ChallengeMsg;
        const response  = JSON.parse(rawR) as ResponseMsg;
        if (response.type !== "TRUST_RESPONSE") throw new Error("Not a TRUST_RESPONSE message");
        const privKey  = loadPrivateKey(vaultBin);
        const peerPub  = loadPeerPubKey(trustDir, response.from);
        const ack = completeHandshake(challenge, response, peerPub, privKey, agentId, trustDir, sessionTtlMs);
        console.log(JSON.stringify(ack, null, 2));
        console.error(`✓ Identity verified: "${response.from}". Session established.`);
      } catch (err) {
        console.error(`Handshake complete failed: ${err}`);
        process.exit(1);
      }
    });

  // ---- trust finish ----
  trust
    .command("finish <response-json> <ack-json>")
    .description("Verify the ACK from the initiator. Completes mutual auth on the responder side.")
    .action((responseArg: string, ackArg: string) => {
      const rawR = responseArg.startsWith("@") ? fs.readFileSync(responseArg.slice(1), "utf-8") : responseArg;
      const rawA = ackArg.startsWith("@") ? fs.readFileSync(ackArg.slice(1), "utf-8") : ackArg;
      try {
        const response = JSON.parse(rawR) as ResponseMsg;
        const ack      = JSON.parse(rawA) as AckMsg;
        if (ack.type !== "TRUST_ACK") throw new Error("Not a TRUST_ACK message");
        const peerPub = loadPeerPubKey(trustDir, ack.from);
        verifyAck(response, ack, peerPub, agentId, trustDir, sessionTtlMs);
        console.log(`✓ Mutual handshake complete. "${ack.from}" verified. Session established.`);
      } catch (err) {
        console.error(`Handshake finish failed: ${err}`);
        process.exit(1);
      }
    });

  // ---- trust sessions ----
  trust
    .command("sessions")
    .description("List active trust sessions")
    .action(() => {
      const sessions = listSessions(trustDir);
      if (sessions.length === 0) {
        console.log("No active sessions.");
        return;
      }
      for (const s of sessions) {
        const ttl = Math.round((s.expiresAt - Date.now()) / 60_000);
        console.log(`${s.peer}  established ${new Date(s.establishedAt).toISOString()}  expires in ${ttl}m`);
      }
    });
}
