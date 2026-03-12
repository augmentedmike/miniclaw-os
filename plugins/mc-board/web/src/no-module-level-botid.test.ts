import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Ensures no file in the board web references bot ID path patterns.
 * The USER/ directory is flat — no bot ID subdirectory.
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

// Patterns that indicate a bot ID path construction.
// USER/ is flat — there should be no bot ID subdirectory.
const FORBIDDEN_PATTERNS = [
  /resolveBotId\s*\(/,
  /_resolveBotId\s*\(/,
  /["']USER["'],\s*\w+Id/,
  /["']USER["'],\s*botId/,
  /USER\/\$\{.*[Bb]ot/,
];

const files = walkTs(SRC_DIR);

for (const file of files) {
  const rel = path.relative(SRC_DIR, file);

  test(`${rel}: no bot ID path patterns`, () => {
    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split("\n");
    const violations: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      for (const pattern of FORBIDDEN_PATTERNS) {
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
