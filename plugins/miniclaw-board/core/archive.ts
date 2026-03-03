/**
 * archive.ts — rotating gzip archive for shipped cards
 *
 * Archives are stored in <stateDir>/archive/ as:
 *   brain-archive-001.jsonl.gz
 *   brain-archive-002.jsonl.gz
 *   ...
 *
 * Each archive is a gzipped JSONL file (one card JSON per line).
 * When the current archive reaches MAX_BYTES, a new one is created.
 * Cards are removed from cardsDir after being archived.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";
import type { Card } from "./card.js";

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ARCHIVE_PREFIX = "brain-archive-";
const ARCHIVE_EXT = ".jsonl.gz";

export class ArchiveStore {
  private readonly archiveDir: string;

  constructor(stateDir: string) {
    this.archiveDir = path.join(stateDir, "archive");
    fs.mkdirSync(this.archiveDir, { recursive: true });
  }

  /**
   * Archive a shipped card. Removes the source file after archiving.
   */
  archiveCard(card: Card, sourceFile: string): void {
    const line = JSON.stringify(card) + "\n";
    const lineGz = zlib.gzipSync(Buffer.from(line));

    const currentArchive = this._currentArchivePath();
    const currentSize = this._archiveSize(currentArchive);

    if (currentArchive && currentSize + lineGz.length <= MAX_BYTES) {
      // Append to current archive: decompress, append, recompress
      this._append(currentArchive, line);
    } else {
      // Start new archive
      const next = this._nextArchivePath();
      this._append(next, line);
    }

    // Remove source card file
    try {
      fs.unlinkSync(sourceFile);
    } catch {
      // Best-effort
    }
  }

  /**
   * List all archives with their sizes and card counts.
   */
  listArchives(): Array<{ name: string; path: string; sizeBytes: number; cardCount: number }> {
    const files = this._archiveFiles();
    return files.map(f => {
      const fullPath = path.join(this.archiveDir, f);
      const sizeBytes = this._archiveSize(fullPath) ?? 0;
      const cardCount = this._countCards(fullPath);
      return { name: f, path: fullPath, sizeBytes, cardCount };
    });
  }

  /**
   * Read all archived cards (across all archives).
   */
  readAll(): Card[] {
    const files = this._archiveFiles();
    const cards: Card[] = [];
    for (const f of files) {
      cards.push(...this._readArchive(path.join(this.archiveDir, f)));
    }
    return cards;
  }

  /**
   * Search archived cards by title/id substring.
   */
  search(query: string): Card[] {
    const q = query.toLowerCase();
    return this.readAll().filter(
      c => c.id.includes(q) || c.title.toLowerCase().includes(q),
    );
  }

  // ---- private helpers ----

  private _archiveFiles(): string[] {
    return fs
      .readdirSync(this.archiveDir)
      .filter(f => f.startsWith(ARCHIVE_PREFIX) && f.endsWith(ARCHIVE_EXT))
      .sort();
  }

  private _currentArchivePath(): string | null {
    const files = this._archiveFiles();
    if (files.length === 0) return null;
    return path.join(this.archiveDir, files[files.length - 1]);
  }

  private _nextArchivePath(): string {
    const files = this._archiveFiles();
    const nextNum = files.length + 1;
    const padded = String(nextNum).padStart(3, "0");
    return path.join(this.archiveDir, `${ARCHIVE_PREFIX}${padded}${ARCHIVE_EXT}`);
  }

  private _archiveSize(filePath: string | null): number {
    if (!filePath) return 0;
    try {
      return fs.statSync(filePath).size;
    } catch {
      return 0;
    }
  }

  private _append(archivePath: string, line: string): void {
    // Read existing lines (decompress if exists)
    let existing = "";
    if (fs.existsSync(archivePath)) {
      try {
        const compressed = fs.readFileSync(archivePath);
        existing = zlib.gunzipSync(compressed).toString("utf-8");
      } catch {
        existing = "";
      }
    }
    const updated = existing + line;
    const compressed = zlib.gzipSync(Buffer.from(updated, "utf-8"));
    fs.writeFileSync(archivePath, compressed);
  }

  private _readArchive(filePath: string): Card[] {
    try {
      const compressed = fs.readFileSync(filePath);
      const text = zlib.gunzipSync(compressed).toString("utf-8");
      return text
        .split("\n")
        .filter(l => l.trim())
        .map(l => JSON.parse(l) as Card);
    } catch {
      return [];
    }
  }

  private _countCards(filePath: string): number {
    return this._readArchive(filePath).length;
  }
}
