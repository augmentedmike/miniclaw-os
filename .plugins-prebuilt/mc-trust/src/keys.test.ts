/**
 * keys.test.ts — unit tests for mc-trust key management
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateKeyPair,
  listPeers,
  loadPeerPubKey,
  peerPubKeyPath,
  savePeerPubKey,
  signMessage,
  verifyMessage,
} from "./keys.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-trust-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("generateKeyPair", () => {
  it("produces privateKeyB64 and publicKeyB64 strings", () => {
    const kp = generateKeyPair();
    expect(typeof kp.privateKeyB64).toBe("string");
    expect(typeof kp.publicKeyB64).toBe("string");
    expect(kp.privateKeyB64.length).toBeGreaterThan(0);
    expect(kp.publicKeyB64.length).toBeGreaterThan(0);
  });

  it("produces base64url encoded keys (no +, /, or = chars)", () => {
    const kp = generateKeyPair();
    // base64url uses - and _ instead of + and /, no padding
    expect(kp.privateKeyB64).not.toMatch(/[+/=]/);
    expect(kp.publicKeyB64).not.toMatch(/[+/=]/);
  });

  it("generates unique key pairs on each call", () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();
    expect(kp1.privateKeyB64).not.toBe(kp2.privateKeyB64);
    expect(kp1.publicKeyB64).not.toBe(kp2.publicKeyB64);
  });

  it("produces a valid Ed25519 public key that can be imported", () => {
    const kp = generateKeyPair();
    const der = Buffer.from(kp.publicKeyB64, "base64url");
    // Should not throw
    const keyObj = crypto.createPublicKey({ key: der, type: "spki", format: "der" });
    expect(keyObj.asymmetricKeyType).toBe("ed25519");
  });

  it("produces a valid Ed25519 private key that can be imported", () => {
    const kp = generateKeyPair();
    const der = Buffer.from(kp.privateKeyB64, "base64url");
    const keyObj = crypto.createPrivateKey({ key: der, type: "pkcs8", format: "der" });
    expect(keyObj.asymmetricKeyType).toBe("ed25519");
  });
});

describe("sign + verify roundtrip", () => {
  it("verifies a signed string message", () => {
    const kp = generateKeyPair();
    const privDer = Buffer.from(kp.privateKeyB64, "base64url");
    const pubDer = Buffer.from(kp.publicKeyB64, "base64url");
    const privKey = crypto.createPrivateKey({ key: privDer, type: "pkcs8", format: "der" });
    const pubKey = crypto.createPublicKey({ key: pubDer, type: "spki", format: "der" });

    const message = "hello from mc-trust";
    const sig = signMessage(message, privKey);
    const valid = verifyMessage(message, sig, pubKey);
    expect(valid).toBe(true);
  });

  it("verifies a signed Buffer message", () => {
    const kp = generateKeyPair();
    const privDer = Buffer.from(kp.privateKeyB64, "base64url");
    const pubDer = Buffer.from(kp.publicKeyB64, "base64url");
    const privKey = crypto.createPrivateKey({ key: privDer, type: "pkcs8", format: "der" });
    const pubKey = crypto.createPublicKey({ key: pubDer, type: "spki", format: "der" });

    const buf = Buffer.from([0x01, 0x02, 0x03, 0xff]);
    const sig = signMessage(buf, privKey);
    expect(verifyMessage(buf, sig, pubKey)).toBe(true);
  });

  it("returns a base64url signature string", () => {
    const kp = generateKeyPair();
    const privDer = Buffer.from(kp.privateKeyB64, "base64url");
    const privKey = crypto.createPrivateKey({ key: privDer, type: "pkcs8", format: "der" });
    const sig = signMessage("test", privKey);
    expect(typeof sig).toBe("string");
    expect(sig).not.toMatch(/[+/=]/);
  });

  it("tampered message fails verification", () => {
    const kp = generateKeyPair();
    const privDer = Buffer.from(kp.privateKeyB64, "base64url");
    const pubDer = Buffer.from(kp.publicKeyB64, "base64url");
    const privKey = crypto.createPrivateKey({ key: privDer, type: "pkcs8", format: "der" });
    const pubKey = crypto.createPublicKey({ key: pubDer, type: "spki", format: "der" });

    const original = "original message";
    const sig = signMessage(original, privKey);
    const tampered = "tampered message";
    expect(verifyMessage(tampered, sig, pubKey)).toBe(false);
  });

  it("signature from wrong key fails verification", () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();

    const priv1Der = Buffer.from(kp1.privateKeyB64, "base64url");
    const pub2Der = Buffer.from(kp2.publicKeyB64, "base64url");
    const privKey1 = crypto.createPrivateKey({ key: priv1Der, type: "pkcs8", format: "der" });
    const pubKey2 = crypto.createPublicKey({ key: pub2Der, type: "spki", format: "der" });

    const message = "signed by key1, verified with key2";
    const sig = signMessage(message, privKey1);
    expect(verifyMessage(message, sig, pubKey2)).toBe(false);
  });
});

describe("peerPubKeyPath", () => {
  it("returns the correct path for a given trustDir and agentId", () => {
    const result = peerPubKeyPath("/trust/dir", "agent-abc");
    expect(result).toBe("/trust/dir/peers/agent-abc.pub");
  });

  it("returns the correct path with nested trustDir", () => {
    const result = peerPubKeyPath("/home/user/.trust", "dev1-4");
    expect(result).toBe("/home/user/.trust/peers/dev1-4.pub");
  });
});

describe("savePeerPubKey + loadPeerPubKey roundtrip", () => {
  it("saves and loads a peer public key correctly", () => {
    const kp = generateKeyPair();
    savePeerPubKey(tmpDir, "agent-test", kp.publicKeyB64);

    const loaded = loadPeerPubKey(tmpDir, "agent-test");
    expect(loaded.asymmetricKeyType).toBe("ed25519");
  });

  it("creates the peers subdirectory if it does not exist", () => {
    const kp = generateKeyPair();
    const peersDir = path.join(tmpDir, "peers");
    expect(fs.existsSync(peersDir)).toBe(false);

    savePeerPubKey(tmpDir, "newagent", kp.publicKeyB64);
    expect(fs.existsSync(peersDir)).toBe(true);
  });

  it("writes the key to the correct file path", () => {
    const kp = generateKeyPair();
    savePeerPubKey(tmpDir, "myagent", kp.publicKeyB64);

    const expectedPath = path.join(tmpDir, "peers", "myagent.pub");
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  it("loaded key can verify a signature made with the corresponding private key", () => {
    const kp = generateKeyPair();
    savePeerPubKey(tmpDir, "signing-agent", kp.publicKeyB64);

    const privDer = Buffer.from(kp.privateKeyB64, "base64url");
    const privKey = crypto.createPrivateKey({ key: privDer, type: "pkcs8", format: "der" });
    const sig = signMessage("roundtrip test", privKey);

    const pubKey = loadPeerPubKey(tmpDir, "signing-agent");
    expect(verifyMessage("roundtrip test", sig, pubKey)).toBe(true);
  });

  it("throws when loading a non-existent agent key", () => {
    expect(() => loadPeerPubKey(tmpDir, "ghost-agent")).toThrow();
  });

  it("overwrites an existing key when saved again", () => {
    const kp1 = generateKeyPair();
    const kp2 = generateKeyPair();

    savePeerPubKey(tmpDir, "agent-x", kp1.publicKeyB64);
    savePeerPubKey(tmpDir, "agent-x", kp2.publicKeyB64);

    const filePath = path.join(tmpDir, "peers", "agent-x.pub");
    const content = fs.readFileSync(filePath, "utf-8").trim();
    expect(content).toBe(kp2.publicKeyB64);
  });
});

describe("listPeers", () => {
  it("returns empty array when peers directory does not exist", () => {
    expect(listPeers(tmpDir)).toEqual([]);
  });

  it("returns empty array when peers directory is empty", () => {
    fs.mkdirSync(path.join(tmpDir, "peers"), { recursive: true });
    expect(listPeers(tmpDir)).toEqual([]);
  });

  it("returns agent ids for saved peers", () => {
    const kp = generateKeyPair();
    savePeerPubKey(tmpDir, "agent-alpha", kp.publicKeyB64);
    savePeerPubKey(tmpDir, "agent-beta", kp.publicKeyB64);

    const peers = listPeers(tmpDir);
    expect(peers.sort()).toEqual(["agent-alpha", "agent-beta"].sort());
  });

  it("ignores non-.pub files in the peers directory", () => {
    fs.mkdirSync(path.join(tmpDir, "peers"), { recursive: true });
    // Write a .txt file that should be ignored
    fs.writeFileSync(path.join(tmpDir, "peers", "readme.txt"), "not a key");

    const kp = generateKeyPair();
    savePeerPubKey(tmpDir, "real-agent", kp.publicKeyB64);

    const peers = listPeers(tmpDir);
    expect(peers).toEqual(["real-agent"]);
  });

  it("returns correct agent ids (strips .pub extension)", () => {
    const kp = generateKeyPair();
    savePeerPubKey(tmpDir, "dev1-4", kp.publicKeyB64);

    const peers = listPeers(tmpDir);
    expect(peers).toEqual(["dev1-4"]);
    // Must not include the .pub extension
    expect(peers[0]).not.toContain(".pub");
  });
});

describe("savePeerPubKey — invalid key rejection", () => {
  it("throws on an empty string", () => {
    expect(() => savePeerPubKey(tmpDir, "bad-agent", "")).toThrow();
  });

  it("throws on a non-base64url garbage string", () => {
    expect(() => savePeerPubKey(tmpDir, "bad-agent", "not-a-key!!")).toThrow();
  });

  it("throws on a valid base64url string that is not an Ed25519 SPKI key", () => {
    // Random bytes encoded as base64url — not a real key
    const fakePub = Buffer.from("this is definitely not a real spki ed25519 key").toString("base64url");
    expect(() => savePeerPubKey(tmpDir, "bad-agent", fakePub)).toThrow();
  });

  it("does not write a file when key validation fails", () => {
    try {
      savePeerPubKey(tmpDir, "bad-agent", "not-valid");
    } catch {
      // expected
    }
    const filePath = path.join(tmpDir, "peers", "bad-agent.pub");
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
