/**
 * Tests for path traversal vulnerability fix in mc-email attachment handling.
 *
 * Ensures that malicious filenames like "../../etc/passwd" are safely
 * stripped to their basename before being joined with a destination path.
 *
 * Relates to: PR #176 review feedback — path traversal in attachment save logic.
 */
import { describe, test, expect } from "vitest";
import * as path from "node:path";

/**
 * Replicates the safe filename logic used in cli/commands.ts:
 *   path.join(destDir, path.basename(att.filename))
 */
function safeAttachmentPath(destDir: string, filename: string): string {
  return path.join(destDir, path.basename(filename));
}

describe("attachment path traversal prevention", () => {
  const destDir = "/tmp/safe-attachments";

  // --- traversal payloads (POSIX forward-slash only — backslash is not a path separator on macOS/Linux) ---
  const traversalPayloads = [
    "../../etc/passwd",
    "../../../etc/shadow",
    "../../../../root/.ssh/authorized_keys",
    "%2e%2e%2fetc%2fpasswd",                  // URL-encoded (literal string — not decoded by path.basename)
    "safe-file/../../../etc/passwd",
    "./subdir/../../etc/cron.d/malicious",
  ];

  for (const payload of traversalPayloads) {
    test(`blocks traversal payload: ${payload}`, () => {
      const result = safeAttachmentPath(destDir, payload);
      // The result must stay inside destDir
      expect(result.startsWith(destDir)).toBe(true);
      // The result must NOT contain ".." components
      const relative = path.relative(destDir, result);
      expect(relative.startsWith("..")).toBe(false);
    });
  }

  // --- legitimate filenames must still work ---
  const legitimateFilenames = [
    "report.pdf",
    "photo.jpg",
    "data_export_2024.csv",
    "My Invoice (March).pdf",
    "résumé.docx",
  ];

  for (const filename of legitimateFilenames) {
    test(`allows legitimate filename: ${filename}`, () => {
      const result = safeAttachmentPath(destDir, filename);
      expect(result).toBe(path.join(destDir, filename));
    });
  }

  // On POSIX, backslash is a valid filename character (not a separator),
  // so Windows-style "..\.." sequences are NOT traversals — they're literal filenames.
  // path.basename correctly returns the whole string unchanged (no stripping needed).
  test("Windows-style backslash payloads are non-traversal on POSIX", () => {
    const windowsPayload = "..\\..\\windows\\system32\\config\\sam";
    const result = safeAttachmentPath(destDir, windowsPayload);
    // On POSIX: the entire string is treated as a single filename component.
    // path.join will keep it inside destDir as a file with literal backslashes in the name.
    expect(result.startsWith(destDir)).toBe(true);
  });

  test("path.basename strips all directory components", () => {
    expect(path.basename("../../etc/passwd")).toBe("passwd");
    expect(path.basename("../shadow")).toBe("shadow");
    expect(path.basename("subdir/file.txt")).toBe("file.txt");
    expect(path.basename("file.txt")).toBe("file.txt");
  });

  test("safeAttachmentPath result is a child of destDir", () => {
    const malicious = "../../etc/crontab";
    const safe = safeAttachmentPath(destDir, malicious);
    // path.relative should return just the basename, no ".." prefix
    const rel = path.relative(destDir, safe);
    expect(rel).toBe("crontab");
    expect(rel.includes("..")).toBe(false);
  });
});
