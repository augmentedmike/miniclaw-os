/**
 * Source scanner for translatable strings in MiniClaw plugins.
 * Scans for ait() calls and user-facing string patterns.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface ScanEntry {
  text: string;
  context?: string;
  files: string[];
}

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
]);

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

/**
 * Extract translatable strings from source code.
 * Looks for ait("...") calls and similar patterns.
 */
function extractStrings(content: string, filename: string): ScanEntry[] {
  const entries: ScanEntry[] = [];

  // Match ait("string literal", ...) and ait('string literal', ...)
  // Groups: 1=text quote, 2=text content, 3=context quote, 4=context content
  const aitRegex = /\bait\(\s*(['"`])((?:(?!\1).)*)\1(?:\s*,\s*(['"`])((?:(?!\3).)*)\3)?\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = aitRegex.exec(content)) !== null) {
    const text = match[2];
    const context = match[4] || undefined;
    if (text && text.length > 0) {
      entries.push({ text, context, files: [filename] });
    }
  }

  return entries;
}

/** Walk a directory tree, yielding file paths. */
function* walkDir(dir: string): Generator<string> {
  let dirents: fs.Dirent[];
  try {
    dirents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const dirent of dirents) {
    if (SKIP_DIRS.has(dirent.name)) continue;
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      yield* walkDir(full);
    } else if (dirent.isFile() && SCAN_EXTENSIONS.has(path.extname(dirent.name))) {
      yield full;
    }
  }
}

/**
 * Scan plugin directories for translatable strings.
 * Returns deduplicated entries.
 */
export function scanPluginDirs(dirs: string[]): ScanEntry[] {
  const seen = new Map<string, ScanEntry>();

  for (const dir of dirs) {
    for (const filePath of walkDir(dir)) {
      let content: string;
      try {
        content = fs.readFileSync(filePath, "utf-8");
      } catch {
        continue;
      }
      const entries = extractStrings(content, filePath);
      for (const entry of entries) {
        const key = entry.text;
        const existing = seen.get(key);
        if (existing) {
          existing.files.push(...entry.files);
        } else {
          seen.set(key, entry);
        }
      }
    }
  }

  return Array.from(seen.values());
}
