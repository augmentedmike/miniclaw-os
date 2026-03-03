/**
 * context.ts — pure functions extracted from mc-context index.ts
 * Exported for unit testing and reuse.
 */

// ---- Session classifier ----

export function isChannelSession(sessionKey?: string): boolean {
  if (!sessionKey) return false;
  return sessionKey.includes(":group:") || sessionKey.includes(":channel:");
}

// ---- Image pruner ----

export function messageHasImage(msg: unknown): boolean {
  if (!msg || typeof msg !== "object") return false;
  const m = msg as Record<string, unknown>;
  // Check content array for image blocks
  if (Array.isArray(m.content)) {
    return m.content.some(
      (block: unknown) =>
        block &&
        typeof block === "object" &&
        (block as Record<string, unknown>).type === "image",
    );
  }
  return false;
}

export function stripImages(msg: unknown, placeholder: string): unknown {
  if (!msg || typeof msg !== "object") return msg;
  const m = msg as Record<string, unknown>;
  if (!Array.isArray(m.content)) return msg;
  return {
    ...m,
    content: m.content.map((block: unknown) => {
      if (
        block &&
        typeof block === "object" &&
        (block as Record<string, unknown>).type === "image"
      ) {
        return { type: "text", text: placeholder };
      }
      return block;
    }),
  };
}

export function pruneImages(
  messages: unknown[],
  maxImages: number,
  placeholder: string,
): unknown[] {
  let imagesKept = 0;
  // Walk newest-first to identify which messages keep their images
  const keepSet = new Set<number>();
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messageHasImage(messages[i]) && imagesKept < maxImages) {
      keepSet.add(i);
      imagesKept++;
    }
  }
  return messages.map((msg, idx) => {
    if (!messageHasImage(msg)) return msg;
    if (keepSet.has(idx)) return msg;
    return stripImages(msg, placeholder);
  });
}
