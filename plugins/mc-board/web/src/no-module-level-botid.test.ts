import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Ensures no file in the board web calls resolveBotId() or similar
 * at module level. Module-level calls break `next build` because
 * there's no botId available at install/build time.
 */

const SRC_DIR = path.join(import.meta.dir);

function walkTs(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".next") {
      results.push(...walkTs(full));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) {
      results.push(full);
    }
  }
  return results;
}

// Patterns that indicate a module-level call to bot ID resolution.
// These throw at build time when no botId exists.
// Only matches lines with NO leading whitespace (true module-level).
const FORBIDDEN_MODULE_LEVEL = [
  /^const\s+\w+\s*=\s*.*resolveBotId\s*\(/,
  /^const\s+\w+\s*=\s*.*_resolveBotId\s*\(/,
  /^const\s+\w+\s*=\s*.*_BOT_ID/,
  /^const\s+(?:DB_PATH|BRAIN_DIR|KB_DB|QMD_DIR)\s*=/,
];

const files = walkTs(SRC_DIR);

for (const file of files) {
  const rel = path.relative(SRC_DIR, file);

  test(`${rel}: no module-level resolveBotId() calls`, () => {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");
    const violations: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Skip indented lines — they're inside function bodies
      if (/^\s/.test(line)) continue;
      const trimmed = line.trim();
      for (const pattern of FORBIDDEN_MODULE_LEVEL) {
        if (pattern.test(trimmed)) {
          violations.push(`  line ${i + 1}: ${trimmed}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
}

test("found source files to scan", () => {
  expect(files.length).toBeGreaterThan(5);
});
