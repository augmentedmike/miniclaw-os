import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TOTPEntry } from "./vault.js";

// We test vault logic with a fake vault binary (shell script)
let tmpDir: string;
let vaultBin: string;
let storePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-auth-vault-test-"));
  storePath = path.join(tmpDir, "store.json");
  fs.writeFileSync(storePath, "{}");

  // Create a fake vault binary (node script) that stores/retrieves from a JSON file
  vaultBin = path.join(tmpDir, "fake-vault");
  fs.writeFileSync(
    vaultBin,
    `#!/usr/bin/env node
const fs = require("fs");
const store = "${storePath}";
const cmd = process.argv[2];
const key = process.argv[3];
const value = process.argv[4];

function load() { return JSON.parse(fs.readFileSync(store, "utf8")); }
function save(d) { fs.writeFileSync(store, JSON.stringify(d)); }

if (cmd === "get") {
  const d = load();
  if (key in d) { console.log(key + " = " + d[key]); }
  else { process.exit(1); }
} else if (cmd === "set") {
  const d = load();
  d[key] = value;
  save(d);
} else if (cmd === "rm") {
  const d = load();
  delete d[key];
  save(d);
} else if (cmd === "list") {
  const d = load();
  for (const k of Object.keys(d)) console.log(k);
}
`,
  );
  fs.chmodSync(vaultBin, 0o755);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Dynamic import to avoid module-level side effects
async function loadVault() {
  return await import("./vault.js");
}

describe("vault TOTP entry roundtrip", () => {
  it("saves and retrieves a TOTP entry", async () => {
    const { saveTOTPEntry, getTOTPEntry } = await loadVault();
    const entry: TOTPEntry = {
      secret: "JBSWY3DPEHPK3PXP",
      issuer: "GitHub",
      account: "augmentedmike",
      algorithm: "sha1",
      digits: 6,
      period: 30,
    };
    saveTOTPEntry(vaultBin, "github", entry);
    const loaded = getTOTPEntry(vaultBin, "github");
    expect(loaded).toEqual(entry);
  });

  it("returns null for non-existent entry", async () => {
    const { getTOTPEntry } = await loadVault();
    const result = getTOTPEntry(vaultBin, "nonexistent");
    expect(result).toBeNull();
  });

  it("lists stored entries", async () => {
    const { saveTOTPEntry, listTOTPEntries } = await loadVault();
    const entry: TOTPEntry = {
      secret: "JBSWY3DPEHPK3PXP",
      issuer: "Test",
      account: "user",
      algorithm: "sha1",
      digits: 6,
      period: 30,
    };
    saveTOTPEntry(vaultBin, "svc-a", entry);
    saveTOTPEntry(vaultBin, "svc-b", entry);
    const names = listTOTPEntries(vaultBin);
    expect(names.sort()).toEqual(["svc-a", "svc-b"]);
  });

  it("removes an entry", async () => {
    const { saveTOTPEntry, removeTOTPEntry, getTOTPEntry } = await loadVault();
    const entry: TOTPEntry = {
      secret: "JBSWY3DPEHPK3PXP",
      issuer: "Test",
      account: "user",
      algorithm: "sha1",
      digits: 6,
      period: 30,
    };
    saveTOTPEntry(vaultBin, "to-remove", entry);
    removeTOTPEntry(vaultBin, "to-remove");
    const result = getTOTPEntry(vaultBin, "to-remove");
    expect(result).toBeNull();
  });

  it("preserves all metadata fields", async () => {
    const { saveTOTPEntry, getTOTPEntry } = await loadVault();
    const entry: TOTPEntry = {
      secret: "ABCDEFGHIJKLMNOP",
      issuer: "Amazon Web Services",
      account: "michael@example.com",
      algorithm: "sha256",
      digits: 8,
      period: 60,
    };
    saveTOTPEntry(vaultBin, "aws", entry);
    const loaded = getTOTPEntry(vaultBin, "aws");
    expect(loaded).toEqual(entry);
  });
});
