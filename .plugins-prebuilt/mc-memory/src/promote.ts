/**
 * mc-memory — Promotion engine
 *
 * Graduates a memo entry or episodic snippet into a proper KB entry.
 * Auto-detects type, generates title, embeds content, and inserts via KBStore.
 * Optionally annotates the source with a promotion marker.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { KBStore, Embedder, PromoteResult } from "./types.js";
import { route } from "./router.js";

interface PromoteInput {
  content: string;          // the text to promote
  title?: string;           // override auto-generated title
  type?: string;            // override auto-detected type
  tags?: string[];          // additional tags
  source_type: "memo" | "episodic";
  source_ref: string;       // cardId (for memo) or date (for episodic)
}

/**
 * Auto-generate a title from content by taking the first meaningful sentence.
 */
function autoTitle(content: string): string {
  // Try first line that looks like a sentence
  const lines = content.split("\n").filter((l) => l.trim().length > 5);
  if (lines.length === 0) return "Untitled memory";

  let title = lines[0].trim();
  // Remove timestamp prefix if present
  title = title.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?\s+/, "");
  // Remove markdown headers
  title = title.replace(/^#+\s+/, "");
  // Truncate to reasonable length
  if (title.length > 80) title = title.slice(0, 77) + "...";
  return title || "Untitled memory";
}

/**
 * Auto-detect KB entry type from content using the router's heuristics.
 */
function autoType(content: string): string {
  const result = route(content);
  return result.kbType ?? "lesson";
}

/**
 * Promote a memo or episodic snippet to a KB entry.
 */
export async function promote(
  store: KBStore,
  embedder: Embedder,
  input: PromoteInput,
): Promise<PromoteResult> {
  const title = input.title ?? autoTitle(input.content);
  const type = input.type ?? autoType(input.content);
  const tags = [
    ...(input.tags ?? []),
    "promoted",
    `from-${input.source_type}`,
  ];

  // Generate embedding
  let vector: Float32Array | undefined;
  try {
    const v = await embedder.embed(`${title}\n${input.content.slice(0, 512)}`);
    vector = v ?? undefined;
  } catch {
    // Fall back to FTS-only
  }

  const entry = store.add(
    {
      type: type as any,
      title,
      content: input.content,
      summary: input.content.slice(0, 200).replace(/\n/g, " ").trim(),
      tags,
      source: `${input.source_type}:${input.source_ref}`,
    },
    vector,
  );

  return {
    kb_id: entry.id,
    title: entry.title,
    type: entry.type,
    source_type: input.source_type,
    source_ref: input.source_ref,
  };
}

/**
 * Annotate a memo file to mark content as promoted.
 */
export function annotateMemo(
  memoDir: string,
  cardId: string,
  lineContent: string,
  kbId: string,
): void {
  const filePath = path.join(memoDir, `${cardId}.md`);
  if (!fs.existsSync(filePath)) return;

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    // Append promotion marker after the matched line
    const updated = content.replace(
      lineContent,
      `${lineContent} → promoted to ${kbId}`,
    );
    if (updated !== content) {
      fs.writeFileSync(filePath, updated, "utf-8");
    }
  } catch {
    // Non-critical, ignore annotation failures
  }
}
