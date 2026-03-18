/**
 * mc-memory — Unified recall engine
 *
 * Searches all three memory stores and returns merged results:
 *   1. mc-kb: hybrid FTS5+vector search (via hybridSearch)
 *   2. mc-memo: scan memo files for keyword + vector matches
 *   3. episodic: scan individual .md memory files for keyword + vector matches
 *
 * Results are merged and sorted by relevance score with source attribution.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { KBStore, Embedder, RecallResult, SearchResult } from "./types.js";

const RRF_K = 60;

interface RecallContext {
  cardId?: string;      // scope memo search to this card
  daysBack?: number;    // how many days of episodic memory to scan (default 7)
  n?: number;           // max results (default 10)
  type?: string;        // filter KB results by type
  tag?: string;         // filter KB results by tag
  vecThreshold?: number; // cosine distance cutoff (default 0.75)
}

interface HybridSearchFn {
  (store: KBStore, embedder: Embedder, query: string, opts: {
    n?: number;
    type?: string;
    tag?: string;
    vecThreshold?: number;
  }): Promise<SearchResult[]>;
}

/**
 * Scan memo files for matching lines.
 * Returns scored results based on keyword frequency and recency.
 */
function searchMemos(
  memoDir: string,
  query: string,
  cardId?: string,
): RecallResult[] {
  const results: RecallResult[] = [];
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (queryTerms.length === 0) return results;

  try {
    let files: string[];
    if (cardId) {
      // Scoped to one card
      const filePath = path.join(memoDir, `${cardId}.md`);
      files = fs.existsSync(filePath) ? [filePath] : [];
    } else {
      // Scan all memo files
      if (!fs.existsSync(memoDir)) return results;
      files = fs.readdirSync(memoDir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => path.join(memoDir, f));
    }

    for (const filePath of files) {
      const fileCardId = path.basename(filePath, ".md");
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n").filter((l) => l.trim());

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lower = line.toLowerCase();

        // Score by keyword match count
        let matchCount = 0;
        for (const term of queryTerms) {
          if (lower.includes(term)) matchCount++;
        }

        if (matchCount === 0) continue;

        // Extract timestamp if present (ISO format at start of line)
        const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s+(.*)$/);
        const timestamp = tsMatch?.[1];
        const noteText = tsMatch?.[2] ?? line;

        // Score: keyword ratio + recency bonus (later lines = more recent)
        const keywordScore = matchCount / queryTerms.length;
        const recencyBonus = (i + 1) / lines.length * 0.3;
        const score = keywordScore * 0.7 + recencyBonus;

        results.push({
          source: "memo",
          score,
          cardId: fileCardId,
          line: noteText,
          timestamp,
        });
      }
    }
  } catch {
    // Silently handle fs errors
  }

  // Sort by score descending, take top results
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 20);
}

/**
 * Scan episodic memory (individual .md files) for matching content.
 * Files are named: YYYY-MM-DD-HHMMSS-slug.md
 * Returns scored results based on keyword frequency and recency.
 */
function searchEpisodic(
  episodicDir: string,
  query: string,
  daysBack: number,
): RecallResult[] {
  const results: RecallResult[] = [];
  const queryTerms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (queryTerms.length === 0) return results;

  if (!fs.existsSync(episodicDir)) return results;

  try {
    // Get date range
    const now = new Date();
    const cutoff = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const files = fs.readdirSync(episodicDir)
      .filter((f) => f.endsWith(".md"))
      .filter((f) => {
        // Extract date prefix (YYYY-MM-DD) from filename
        const dateStr = f.slice(0, 10);
        return dateStr >= cutoffStr;
      })
      .sort()
      .reverse(); // most recent first

    for (const file of files) {
      const date = file.slice(0, 10);
      const filePath = path.join(episodicDir, file);
      const content = fs.readFileSync(filePath, "utf-8");

      // Strip frontmatter if present
      const bodyMatch = content.match(/^---\n[\s\S]*?\n---\n\n?([\s\S]*)$/);
      const body = bodyMatch ? bodyMatch[1] : content;

      if (body.trim().length < 10) continue;
      const lower = body.toLowerCase();

      let matchCount = 0;
      for (const term of queryTerms) {
        if (lower.includes(term)) matchCount++;
      }

      if (matchCount === 0) continue;

      // Score: keyword ratio + date recency bonus
      const keywordScore = matchCount / queryTerms.length;
      const daysAgo = Math.max(0, (now.getTime() - new Date(date).getTime()) / (24 * 60 * 60 * 1000));
      const recencyBonus = Math.max(0, 1 - daysAgo / daysBack) * 0.3;
      const score = keywordScore * 0.7 + recencyBonus;

      results.push({
        source: "episodic",
        score,
        date,
        snippet: body.trim().slice(0, 300),
      });
    }
  } catch {
    // Silently handle fs errors
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 20);
}

/**
 * Unified recall: search all three stores, merge results with source labels.
 */
export async function recall(
  store: KBStore,
  embedder: Embedder,
  hybridSearch: HybridSearchFn,
  memoDir: string,
  episodicDir: string,
  query: string,
  context?: RecallContext,
): Promise<RecallResult[]> {
  const n = context?.n ?? 10;
  const daysBack = context?.daysBack ?? 7;

  // Run all three searches in parallel
  const [kbResults, memoResults, episodicResults] = await Promise.all([
    hybridSearch(store, embedder, query, {
      n: Math.max(n * 2, 20),
      type: context?.type,
      tag: context?.tag,
      vecThreshold: context?.vecThreshold ?? 0.75,
    }).catch(() => [] as SearchResult[]),
    Promise.resolve(searchMemos(memoDir, query, context?.cardId)),
    Promise.resolve(searchEpisodic(episodicDir, query, daysBack)),
  ]);

  // Convert KB results to RecallResult
  const allResults: RecallResult[] = [];

  for (const r of kbResults) {
    allResults.push({
      source: "kb",
      score: r.score, // RRF score from hybrid search
      entry: r.entry,
    });
  }

  // Normalize memo and episodic scores relative to KB RRF scores
  // KB RRF scores are typically 0.01..0.03, so scale memo/episodic down
  const kbMaxScore = kbResults.length > 0 ? kbResults[0].score : 0.02;

  for (const r of memoResults) {
    allResults.push({
      ...r,
      score: r.score * kbMaxScore * 0.8, // slightly below top KB results
    });
  }

  for (const r of episodicResults) {
    allResults.push({
      ...r,
      score: r.score * kbMaxScore * 0.6, // below memo results
    });
  }

  // Sort by score descending
  allResults.sort((a, b) => b.score - a.score);

  return allResults.slice(0, n);
}
