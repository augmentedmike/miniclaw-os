/**
 * vault.test.ts — unit tests for mc-square vault helpers
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vaultGet, vaultSet, getSquareAccessToken } from "./vault.js";

let tmpDir: string;
let fakeVault: string;
let storePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-square-vault-test-"));
  storePath = path.join(tmpDir, "store.json");
  fs.writeFileSync(storePath, "{}");

  fakeVault = path.join(tmpDir, "fake-vault");
  fs.writeFileSync(
    fakeVault,
    `#!/bin/bash
STORE="${storePath}"
CMD="$1"
KEY="$2"
VAL="$3"

if [ "$CMD" = "get" ]; then
  val=$(cat "$STORE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$KEY',''))" 2>/dev/null)
  if [ -n "$val" ]; then
    echo "$KEY = $val"
  else
    exit 1
  fi
elif [ "$CMD" = "set" ]; then
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
    expect(vaultGet(fakeVault, "nonexistent")).toBeNull();
  });

  it("returns value after vaultSet", () => {
    vaultSet(fakeVault, "test-key", "test-value");
    expect(vaultGet(fakeVault, "test-key")).toBe("test-value");
  });

  it("returns null when vault binary does not exist", () => {
    expect(vaultGet("/nonexistent/binary", "key")).toBeNull();
  });
});

describe("getSquareAccessToken", () => {
  it("returns null when no token is set", () => {
    expect(getSquareAccessToken(fakeVault)).toBeNull();
  });

  it("returns token after setting it", () => {
    vaultSet(fakeVault, "square-access-token", "EAAAl_sandbox_xyz");
    expect(getSquareAccessToken(fakeVault)).toBe("EAAAl_sandbox_xyz");
  });
});
