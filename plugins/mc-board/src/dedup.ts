/**
 * dedup.ts — Title-based duplicate detection for the board state machine.
 *
 * Two cards are considered duplicates if their titles are:
 *   - Exact matches (after normalization), OR
 *   - Semantically similar: Jaccard similarity on word tokens ≥ 70%
 *
 * This is intentionally lightweight — no external deps, no embeddings.
 * It catches the common case: someone rephrasing the same task slightly.
 */

import type { Card } from "./card.js";

// ---- Normalization ----

/**
 * Normalize a title for comparison:
 * - Lowercase
 * - Strip punctuation and special characters
 * - Collapse whitespace
 * - Remove common stop words that inflate similarity (a, the, an, to, for, etc.)
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")   // strip punctuation
    .replace(/\s+/g, " ")       // collapse whitespace
    .trim();
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "are", "was", "be", "as", "it",
  "its", "into", "via", "that", "this", "these", "those",
]);

/**
 * Tokenize a normalized title into meaningful words (stop words excluded).
 */
export function tokenize(title: string): string[] {
  return normalizeTitle(title)
    .split(" ")
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

// ---- Similarity ----

/**
 * Jaccard similarity: |intersection| / |union|
 * Returns 0.0–1.0. Two identical sets → 1.0. No overlap → 0.0.
 */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1.0;
  if (a.size === 0 || b.size === 0) return 0.0;

  let intersection = 0;
  for (const word of a) {
    if (b.has(word)) intersection++;
  }

  const union = a.size + b.size - intersection;
  return intersection / union;
}

// ---- Duplicate Detection ----

/** Threshold at which two titles are considered duplicates. */
export const SIMILARITY_THRESHOLD = 0.70;

/**
 * Returns true if two card titles are duplicates — either exact match
 * (normalized) or semantically similar (≥70% Jaccard).
 *
 * Short titles (≤2 meaningful words) require exact match to avoid false
 * positives — e.g. "Add auth" vs "Fix auth" would score 0.5 and should NOT
 * be flagged.
 */
export function areDuplicates(titleA: string, titleB: string): boolean {
  const normA = normalizeTitle(titleA);
  const normB = normalizeTitle(titleB);

  // Exact match after normalization
  if (normA === normB) return true;

  const tokensA = tokenize(titleA);
  const tokensB = tokenize(titleB);

  // Too short — require exact match only (already checked above)
  const minTokens = Math.min(tokensA.length, tokensB.length);
  if (minTokens <= 2) return false;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const similarity = jaccardSimilarity(setA, setB);

  return similarity >= SIMILARITY_THRESHOLD;
}

// ---- Conflict Lookup ----

export interface TitleConflict {
  card: Card;
  similarity: number; // 1.0 = exact, <1.0 = semantic
}

/**
 * Find the first card in `existing` that would conflict with `title`.
 * Optionally exclude a card by ID (useful when updating a card's own title).
 *
 * Returns null if no conflict found.
 */
export function findTitleConflict(
  title: string,
  existing: Card[],
  excludeId?: string,
): TitleConflict | null {
  const normTitle = normalizeTitle(title);
  const tokensTitle = tokenize(title);
  const setTitle = new Set(tokensTitle);

  for (const card of existing) {
    if (excludeId && card.id === excludeId) continue;

    const normCard = normalizeTitle(card.title);

    // Exact match
    if (normCard === normTitle) {
      return { card, similarity: 1.0 };
    }

    // Semantic similarity
    const tokensCard = tokenize(card.title);
    const minTokens = Math.min(tokensTitle.length, tokensCard.length);
    if (minTokens <= 2) continue;

    const setCard = new Set(tokensCard);
    const similarity = jaccardSimilarity(setTitle, setCard);
    if (similarity >= SIMILARITY_THRESHOLD) {
      return { card, similarity };
    }
  }

  return null;
}

/**
 * Tokenize a text body (e.g. problem_description) into meaningful words.
 * Truncates to first 100 words to keep matching lightweight.
 */
export function tokenizeText(text: string): string[] {
  const words = normalizeTitle(text).split(" ").filter(w => w.length > 1 && !STOP_WORDS.has(w));
  return words.slice(0, 100);
}

/**
 * Find ALL cards in `existing` that are similar to `title` or `problemText`.
 * Returns results sorted by similarity descending.
 *
 * Matching combines title tokens + first 100 words of problem_description
 * into a single token set for Jaccard comparison.
 *
 * Optionally exclude a card by ID (useful when updating a card's own title).
 */
export function findAllConflicts(
  title: string,
  problemText: string | undefined,
  existing: Card[],
  excludeId?: string,
): TitleConflict[] {
  const normTitle = normalizeTitle(title);
  const titleTokens = tokenize(title);
  const problemTokens = problemText ? tokenizeText(problemText) : [];

  // Combined token set for the new card
  const combinedSet = new Set([...titleTokens, ...problemTokens]);
  const titleSet = new Set(titleTokens);

  const results: TitleConflict[] = [];

  for (const card of existing) {
    if (excludeId && card.id === excludeId) continue;

    const normCard = normalizeTitle(card.title);

    // Exact title match — always a conflict
    if (normCard === normTitle) {
      results.push({ card, similarity: 1.0 });
      continue;
    }

    // Build the card's combined token set (title + problem_description)
    const cardTitleTokens = tokenize(card.title);
    const cardProblemTokens = card.problem_description ? tokenizeText(card.problem_description) : [];
    const cardCombinedSet = new Set([...cardTitleTokens, ...cardProblemTokens]);

    // Short titles still require exact match — use title-only tokens
    const minTitleTokens = Math.min(titleTokens.length, cardTitleTokens.length);
    if (minTitleTokens <= 2 && combinedSet.size <= 2) continue;

    // If problem text is available on either side, use combined sets
    // Otherwise fall back to title-only comparison
    let similarity: number;
    if (combinedSet.size > titleSet.size || cardCombinedSet.size > cardTitleTokens.length) {
      similarity = jaccardSimilarity(combinedSet, cardCombinedSet);
    } else {
      if (minTitleTokens <= 2) continue;
      similarity = jaccardSimilarity(titleSet, new Set(cardTitleTokens));
    }

    if (similarity >= SIMILARITY_THRESHOLD) {
      results.push({ card, similarity });
    }
  }

  // Sort by similarity descending
  return results.sort((a, b) => b.similarity - a.similarity);
}

/**
 * Format a numbered list of similar cards for CLI output.
 */
export function formatConflictList(title: string, conflicts: TitleConflict[]): string {
  const lines: string[] = [
    `Similar cards found for: "${title}"`,
    ``,
  ];

  conflicts.forEach((c, i) => {
    const { card, similarity } = c;
    const pct = Math.round(similarity * 100);
    const matchType = similarity >= 1.0 ? "exact" : `${pct}%`;
    lines.push(`  ${i + 1}. [${card.id}] ${card.title}`);
    lines.push(`     column: ${card.column}  match: ${matchType}`);
  });

  lines.push(``);
  lines.push(`Proceed anyway? (y/N)`);

  return lines.join("\n");
}

/**
 * Format a human-readable conflict error message for CLI output.
 */
export function formatConflictError(title: string, conflict: TitleConflict): string {
  const { card, similarity } = conflict;
  const pct = Math.round(similarity * 100);
  const matchType = similarity >= 1.0 ? "exact match" : `${pct}% similar`;

  const projectNote = card.project_id ? ` in project ${card.project_id}` : "";

  return [
    `DUPLICATE DETECTED: "${title}"`,
    ``,
    `  Conflicts with: "${card.title}" (${card.id})${projectNote}`,
    `  Match type:     ${matchType}`,
    `  Column:         ${card.column}`,
    ``,
    `Consolidate or clarify scope before creating a new card.`,
    `  To view:    miniclaw brain show ${card.id}`,
    `  To merge:   miniclaw brain update ${card.id} --notes "..."`,
  ].join("\n");
}
