import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import { userDir, kbDbPath } from "./paths";

function walkMd(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) results.push(...walkMd(full));
    else if (f.endsWith(".md")) results.push(full);
  }
  return results;
}

export interface MemoryStats {
  memoryFiles: number;
  kbEntries: number;
  total: number;
}

export function getMemoryStats(): MemoryStats {
  // Count .md files in USER/memory/ only (matches what the Memory tab shows as SHORT TERM)
  const userMemDir = path.join(userDir(), "memory");
  const memoryFiles = walkMd(userMemDir).length;

  // Count KB entries via SQL
  let kbEntries = 0;
  const kbPath = kbDbPath();
  if (fs.existsSync(kbPath)) {
    try {
      const db = new Database(kbPath, { readonly: true });
      kbEntries = (db.prepare("SELECT COUNT(*) as n FROM entries").get() as { n: number }).n;
      db.close();
    } catch { /* non-fatal */ }
  }

  return { memoryFiles, kbEntries, total: memoryFiles + kbEntries };
}
