/**
 * vault.test.ts — unit tests for mc-stripe vault helpers
 *
 * Tests vault get/set with a fake vault binary (shell script that reads/writes
 * a temp file). No real mc-vault dependency needed.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vaultGet, vaultSet, getStripeSecretKey, getStripePublishableKey } from "./vault.js";

let tmpDir: string;
let fakeVault: string;
let storePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-stripe-vault-test-"));
  storePath = path.join(tmpDir, "store.json");
  fs.writeFileSync(storePath, "{}");

  // Create a fake vault script that stores key=value in a JSON file
  fakeVault = path.join(tmpDir, "fake-vault");
  fs.writeFileSync(
    fakeVault,
    `#!/bin/bash
STORE="${storePath}"
CMD="$1"
KEY="$2"
VAL="$3"

if [ "$CMD" = "get" ]; then
  # Read from JSON store
  val=$(cat "$STORE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$KEY',''))" 2>/dev/null)
  if [ -n "$val" ]; then
    echo "$KEY = $val"
  else
    exit 1
  fi
elif [ "$CMD" = "set" ]; then
  # Write to JSON store (strip surrounding quotes from val)
  VAL=$(echo "$VAL" | sed 's/^"//;s/"$//')
  python3 -c "
import sys,json
with open('$STORE') as f: d=json.load(f)
d['$KEY']='$VAL'
with open('$STORE','w') as f: json.dump(d,f)
"
fi
`,
  );
  fs.chmodSync(fakeVault, 0o755);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("vaultGet", () => {
  it("returns null for missing key", () => {
    const result = vaultGet(fakeVault, "nonexistent-key");
    expect(result).toBeNull();
  });

  it("returns value after vaultSet", () => {
    vaultSet(fakeVault, "test-key", "test-value");
    const result = vaultGet(fakeVault, "test-key");
    expect(result).toBe("test-value");
  });

  it("returns null when vault binary does not exist", () => {
    const result = vaultGet("/nonexistent/binary", "some-key");
    expect(result).toBeNull();
  });
});

describe("vaultSet", () => {
  it("stores a value that can be retrieved", () => {
    vaultSet(fakeVault, "my-key", "my-value");
    expect(vaultGet(fakeVault, "my-key")).toBe("my-value");
  });

  it("overwrites existing value", () => {
    vaultSet(fakeVault, "key", "first");
    vaultSet(fakeVault, "key", "second");
    expect(vaultGet(fakeVault, "key")).toBe("second");
  });
});

describe("getStripeSecretKey", () => {
  it("returns null when no key is set", () => {
    expect(getStripeSecretKey(fakeVault)).toBeNull();
  });

  it("returns the key after setting it", () => {
    vaultSet(fakeVault, "stripe-secret-key", "sk_test_abc123");
    expect(getStripeSecretKey(fakeVault)).toBe("sk_test_abc123");
  });
});

describe("getStripePublishableKey", () => {
  it("returns null when no key is set", () => {
    expect(getStripePublishableKey(fakeVault)).toBeNull();
  });

  it("returns the key after setting it", () => {
    vaultSet(fakeVault, "stripe-publishable-key", "pk_test_abc123");
    expect(getStripePublishableKey(fakeVault)).toBe("pk_test_abc123");
  });
});
