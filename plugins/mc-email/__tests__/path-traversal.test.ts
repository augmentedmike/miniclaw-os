import { test, expect } from "vitest";
import * as path from "node:path";

/**
 * Validates that path.basename strips directory traversal payloads,
 * which is the sanitization used in cli/commands.ts for attachment filenames.
 */

// POSIX traversal payloads only — backslash paths are not traversal vectors
// on Linux/macOS since backslash is a valid filename character, not a separator.
const traversalPayloads = [
  "../../etc/passwd",
  "../../../etc/shadow",
  "foo/../../bar/secret.txt",
  "../.env",
  "../../../../tmp/evil.sh",
  "./../credentials.json",
];

test("path.basename strips all traversal prefixes", () => {
  for (const payload of traversalPayloads) {
    const sanitized = path.basename(payload);
    expect(sanitized).not.toContain("..");
    expect(sanitized).not.toContain("/");
  }
});

test("path.basename preserves safe filenames", () => {
  expect(path.basename("report.pdf")).toBe("report.pdf");
  expect(path.basename("my-file_v2.tar.gz")).toBe("my-file_v2.tar.gz");
  expect(path.basename("image.png")).toBe("image.png");
});

test("path.join with basename never escapes target directory", () => {
  const targetDir = "/tmp/attachments";
  for (const payload of traversalPayloads) {
    const outPath = path.join(targetDir, path.basename(payload));
    expect(outPath.startsWith(targetDir)).toBe(true);
  }
});

test("known payloads resolve to expected basenames", () => {
  expect(path.basename("../../etc/passwd")).toBe("passwd");
  expect(path.basename("../../../etc/shadow")).toBe("shadow");
  expect(path.basename("../.env")).toBe(".env");
  expect(path.basename("foo/../../bar/secret.txt")).toBe("secret.txt");
});
