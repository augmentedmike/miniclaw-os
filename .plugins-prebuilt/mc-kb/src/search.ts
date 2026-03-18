/**
 * mc-kb — Hybrid search: FTS5 BM25 + sqlite-vec cosine → RRF merge
 *
 * Reciprocal Rank Fusion with k=60.
 * If vec unavailable, falls back to FTS5-only.
 * If FTS5 fails, falls back to in-memory title/content substring match.
 */

import type { KBStore } from "./store.js";
import type { Embedder } from "./embedder.js";
import type { KBEntry } from "./entry.js";

const RRF_K = 60;

export interface SearchResult {
  entry: KBEntry;
  score: number;      // RRF score (higher = better)
  vecDistance?: number;
  ftsRank?: number;
}

export interface SearchOptions {
  n?: number;         // max results (default 10)
  type?: string;      // filter by type
  tag?: string;       // filter by tag
  vecThreshold?: number; // cosine distance cutoff (0..2)
}

export async function hybridSearch(
  store: KBStore,
  embedder: Embedder,
  query: string,
  opts: SearchOptions = {},
): Promise<SearchResult[]> {
  const n = opts.n ?? 10;
  const vecThreshold = opts.vecThreshold ?? 1.5; // cosine distance: 0=identical, 2=opposite

  console.log(`[mc-kb/search] hybrid search: "${query}" n=${n}`);

  // --- BM25 FTS5 search ---
  const ftsLimit = Math.max(n * 3, 30);
  const ftsResults = store.ftsSearch(query, ftsLimit);
  console.log(`[mc-kb/search] FTS5 returned ${ftsResults.length} results`);

  // --- Vector search ---
  let vecResults: { id: string; distance: number }[] = [];
  if (store.isVecLoaded()) {
    const vector = await embedder.embed(query);
    if (vector) {
      vecResults = store.vecSearch(vector, ftsLimit);
      console.log(`[mc-kb/search] Vec returned ${vecResults.length} results`);
    }
  }

  // --- RRF merge ---
  const scoreMap = new Map<string, { ftsRank?: number; vecRank?: number; vecDistance?: number }>();

  for (let i = 0; i < ftsResults.length; i++) {
    const { id } = ftsResults[i];
    const existing = scoreMap.get(id) ?? {};
    scoreMap.set(id, { ...existing, ftsRank: i });
  }

  for (let i = 0; i < vecResults.length; i++) {
    const { id, distance } = vecResults[i];
    if (distance > vecThreshold) continue; // skip dissimilar results
    const existing = scoreMap.get(id) ?? {};
    scoreMap.set(id, { ...existing, vecRank: i, vecDistance: distance });
  }

  const scored: { id: string; score: number; ftsRank?: number; vecDistance?: number }[] = [];
  for (const [id, ranks] of scoreMap.entries()) {
    let score = 0;
    if (ranks.ftsRank !== undefined) score += 1 / (RRF_K + ranks.ftsRank);
    if (ranks.vecRank !== undefined) score += 1 / (RRF_K + ranks.vecRank);
    scored.push({ id, score, ftsRank: ranks.ftsRank, vecDistance: ranks.vecDistance });
  }

  scored.sort((a, b) => b.score - a.score);

  // --- Hydrate entries + apply type/tag filters ---
  const results: SearchResult[] = [];
  for (const s of scored) {
    if (results.length >= n) break;
    const entry = store.get(s.id);
    if (!entry) continue;
    if (opts.type && entry.type !== opts.type) continue;
    if (opts.tag && !entry.tags.includes(opts.tag)) continue;
    results.push({ entry, score: s.score, vecDistance: s.vecDistance, ftsRank: s.ftsRank });
  }

  // Fallback: if no results, do substring match on list
  if (results.length === 0) {
    console.log("[mc-kb/search] FTS+vec returned nothing — falling back to substring scan");
    const all = store.list({ type: opts.type, tag: opts.tag, limit: 200 });
    const lower = query.toLowerCase();
    for (const entry of all) {
      if (results.length >= n) break;
      if (entry.title.toLowerCase().includes(lower) || entry.content.toLowerCase().includes(lower)) {
        results.push({ entry, score: 0.1 });
      }
    }
  }

  return results;
}
