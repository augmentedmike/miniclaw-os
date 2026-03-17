/**
 * mc-memory — Smart writer
 *
 * Handles memory_write by routing content to the appropriate store:
 *   - memo: append to card scratchpad
 *   - kb: add as structured KB entry (with embedding)
 *   - episodic: append to today's daily .md file
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { KBStore, Embedder, WriteResult } from "./types.js";
import { route, type RouteContext } from "./router.js";

/**
 * Write to the appropriate memory store based on content analysis.
 */
export async function write(
  store: KBStore,
  embedder: Embedder,
  memoDir: string,
  episodicDir: string,
  content: string,
  context?: RouteContext & { forceTarget?: "memo" | "kb" | "episodic" },
): Promise<WriteResult> {
  // Route (or use forced target)
  const routeResult = context?.forceTarget
    ? { target: context.forceTarget, kbType: "fact", reason: "forced" }
    : route(content, context);

  const target = routeResult.target;
  const timestamp = new Date().toISOString();

  switch (target) {
    case "memo": {
      if (!context?.cardId) {
        // No card context — fall back to episodic
        return writeEpisodic(episodicDir, content, timestamp);
      }
      return writeMemo(memoDir, context.cardId, content, timestamp);
    }

    case "kb": {
      return writeKb(store, embedder, content, routeResult.kbType ?? "fact", context);
    }

    case "episodic":
    default: {
      return writeEpisodic(episodicDir, content, timestamp);
    }
  }
}

function writeMemo(
  memoDir: string,
  cardId: string,
  content: string,
  timestamp: string,
): WriteResult {
  fs.mkdirSync(memoDir, { recursive: true });
  const filePath = path.join(memoDir, `${cardId}.md`);
  const line = `${timestamp} ${content}\n`;
  fs.appendFileSync(filePath, line, { encoding: "utf-8", flag: "a" });

  return {
    stored_in: "memo",
    cardId,
    path: filePath,
  };
}

async function writeKb(
  store: KBStore,
  embedder: Embedder,
  content: string,
  type: string,
  context?: RouteContext,
): Promise<WriteResult> {
  // Auto-generate title from first line
  const lines = content.split("\n").filter((l) => l.trim());
  let title = lines[0]?.trim() ?? "Untitled";
  title = title.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?\s+/, "");
  title = title.replace(/^#+\s+/, "");
  if (title.length > 80) title = title.slice(0, 77) + "...";

  // Generate embedding
  let vector: Float32Array | undefined;
  try {
    const v = await embedder.embed(`${title}\n${content.slice(0, 512)}`);
    vector = v ?? undefined;
  } catch {
    // Fall back to FTS-only
  }

  const tags = ["auto-routed"];
  if (context?.cardId) tags.push(`card:${context.cardId}`);

  const entry = store.add(
    {
      type: type as any,
      title,
      content,
      summary: content.slice(0, 200).replace(/\n/g, " ").trim(),
      tags,
      source: context?.source ?? "memory_write",
    },
    vector,
  );

  return {
    stored_in: "kb",
    id: entry.id,
  };
}

function writeEpisodic(
  episodicDir: string,
  content: string,
  timestamp: string,
): WriteResult {
  fs.mkdirSync(episodicDir, { recursive: true });
  const date = timestamp.slice(0, 10);
  const filePath = path.join(episodicDir, `${date}.md`);
  const line = `\n${timestamp} ${content}\n`;
  fs.appendFileSync(filePath, line, { encoding: "utf-8", flag: "a" });

  return {
    stored_in: "episodic",
    date,
    path: filePath,
  };
}
