/**
 * context.test.ts — unit tests for mc-context pure functions
 */

import { describe, expect, it } from "vitest";
import {
  isChannelSession,
  messageHasImage,
  pruneImages,
  stripImages,
} from "./context.js";

// ---- helpers ----

function textMsg(text: string) {
  return { role: "user", content: [{ type: "text", text }] };
}

function imageMsg(caption?: string) {
  const content: unknown[] = [{ type: "image", source: { type: "base64", data: "abc" } }];
  if (caption) content.push({ type: "text", text: caption });
  return { role: "user", content };
}

function mixedMsg(text: string) {
  return {
    role: "user",
    content: [
      { type: "text", text },
      { type: "image", source: { type: "base64", data: "abc" } },
    ],
  };
}

// ---- isChannelSession ----

describe("isChannelSession", () => {
  it("returns true for a :group: session key", () => {
    expect(isChannelSession("tg:group:123456")).toBe(true);
  });

  it("returns true for a :channel: session key", () => {
    expect(isChannelSession("tg:channel:987654")).toBe(true);
  });

  it("returns false for a :direct: session key", () => {
    expect(isChannelSession("tg:direct:111222")).toBe(false);
  });

  it("returns false for the main agent session key", () => {
    expect(isChannelSession("agent:main:main")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isChannelSession(undefined)).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(isChannelSession("")).toBe(false);
  });

  it("returns false for an arbitrary string with no known segment", () => {
    expect(isChannelSession("some-other-key")).toBe(false);
  });

  it("is case-sensitive — :GROUP: does not match", () => {
    expect(isChannelSession("tg:GROUP:123")).toBe(false);
  });
});

// ---- messageHasImage ----

describe("messageHasImage", () => {
  it("returns true for a message with an image block", () => {
    expect(messageHasImage(imageMsg())).toBe(true);
  });

  it("returns true for a mixed message (text + image)", () => {
    expect(messageHasImage(mixedMsg("caption"))).toBe(true);
  });

  it("returns false for a text-only message", () => {
    expect(messageHasImage(textMsg("hello world"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(messageHasImage(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(messageHasImage(undefined)).toBe(false);
  });

  it("returns false for a non-object primitive", () => {
    expect(messageHasImage("string")).toBe(false);
    expect(messageHasImage(42)).toBe(false);
  });

  it("returns false for an object with no content array", () => {
    expect(messageHasImage({ role: "user", content: "string content" })).toBe(false);
  });

  it("returns false for an empty content array", () => {
    expect(messageHasImage({ role: "user", content: [] })).toBe(false);
  });

  it("returns false for content array with only text blocks", () => {
    const msg = { content: [{ type: "text", text: "hello" }, { type: "text", text: "world" }] };
    expect(messageHasImage(msg)).toBe(false);
  });
});

// ---- stripImages ----

describe("stripImages", () => {
  it("replaces image blocks with placeholder text blocks", () => {
    const msg = imageMsg();
    const result = stripImages(msg, "[image removed]") as { content: unknown[] };
    expect(result.content).toHaveLength(1);
    const block = result.content[0] as Record<string, unknown>;
    expect(block.type).toBe("text");
    expect(block.text).toBe("[image removed]");
  });

  it("preserves text blocks alongside stripped images", () => {
    const msg = mixedMsg("keep me");
    const result = stripImages(msg, "[gone]") as { content: unknown[] };
    expect(result.content).toHaveLength(2);
    const textBlock = result.content[0] as Record<string, unknown>;
    const replacedBlock = result.content[1] as Record<string, unknown>;
    expect(textBlock.type).toBe("text");
    expect((textBlock as { text: string }).text).toBe("keep me");
    expect(replacedBlock.type).toBe("text");
    expect((replacedBlock as { text: string }).text).toBe("[gone]");
  });

  it("preserves other message fields (role, etc.)", () => {
    const msg = { role: "assistant", content: [{ type: "image", source: {} }] };
    const result = stripImages(msg, "x") as Record<string, unknown>;
    expect(result.role).toBe("assistant");
  });

  it("returns msg unchanged when there is no content array", () => {
    const msg = { role: "user", content: "plain string" };
    const result = stripImages(msg, "[gone]") as Record<string, unknown>;
    expect(result.content).toBe("plain string");
  });

  it("returns null unchanged", () => {
    expect(stripImages(null, "[gone]")).toBeNull();
  });

  it("returns a non-object unchanged", () => {
    expect(stripImages("string", "[gone]")).toBe("string");
  });

  it("does not mutate the original message object", () => {
    const original = imageMsg();
    const originalContent = original.content[0];
    stripImages(original, "[stripped]");
    // Original block should still be of type image
    expect((originalContent as { type: string }).type).toBe("image");
  });
});

// ---- pruneImages ----

describe("pruneImages", () => {
  it("returns messages unchanged when there are no images", () => {
    const msgs = [textMsg("a"), textMsg("b"), textMsg("c")];
    const result = pruneImages(msgs, 2, "[gone]");
    expect(result).toHaveLength(3);
    (result as ReturnType<typeof textMsg>[]).forEach((m, i) => {
      expect(m).toBe(msgs[i]); // same reference — not mutated
    });
  });

  it("keeps the N most recent images, strips earlier ones", () => {
    // 4 image messages; maxImages=2 → keep last 2, strip first 2
    const msgs = [
      imageMsg("old1"),   // index 0 — should be stripped
      imageMsg("old2"),   // index 1 — should be stripped
      imageMsg("keep1"),  // index 2 — kept
      imageMsg("keep2"),  // index 3 — kept
    ];
    const result = pruneImages(msgs, 2, "[pruned]");
    expect(result).toHaveLength(4);

    const r0 = result[0] as { content: Array<{ type: string; text?: string }> };
    const r1 = result[1] as { content: Array<{ type: string; text?: string }> };
    const r2 = result[2] as { content: Array<{ type: string; text?: string }> };
    const r3 = result[3] as { content: Array<{ type: string; text?: string }> };

    // First two stripped
    expect(r0.content[0].type).toBe("text");
    expect(r0.content[0].text).toBe("[pruned]");
    expect(r1.content[0].type).toBe("text");
    expect(r1.content[0].text).toBe("[pruned]");

    // Last two kept (still have image type)
    expect(r2.content[0].type).toBe("image");
    expect(r3.content[0].type).toBe("image");
  });

  it("keeps all images when count is within maxImages", () => {
    const msgs = [imageMsg("img1"), imageMsg("img2")];
    const result = pruneImages(msgs, 5, "[gone]");
    const r0 = result[0] as { content: Array<{ type: string }> };
    const r1 = result[1] as { content: Array<{ type: string }> };
    expect(r0.content[0].type).toBe("image");
    expect(r1.content[0].type).toBe("image");
  });

  it("strips all images when maxImages is 0", () => {
    const msgs = [imageMsg("img1"), textMsg("text"), imageMsg("img2")];
    const result = pruneImages(msgs, 0, "[no images]");
    const r0 = result[0] as { content: Array<{ type: string; text?: string }> };
    const r2 = result[2] as { content: Array<{ type: string; text?: string }> };
    expect(r0.content[0].type).toBe("text");
    expect(r0.content[0].text).toBe("[no images]");
    expect(r2.content[0].type).toBe("text");
    expect(r2.content[0].text).toBe("[no images]");
  });

  it("leaves text-only messages untouched", () => {
    const msgs = [textMsg("hello"), textMsg("world")];
    const result = pruneImages(msgs, 1, "[gone]");
    expect(result[0]).toBe(msgs[0]);
    expect(result[1]).toBe(msgs[1]);
  });

  it("handles an empty message array", () => {
    expect(pruneImages([], 2, "[gone]")).toEqual([]);
  });

  it("uses the newest-first strategy (most recent images are kept)", () => {
    // 5 images, maxImages=1 → only the very last one (index 4) is kept
    const msgs = [
      imageMsg("1"),
      imageMsg("2"),
      imageMsg("3"),
      imageMsg("4"),
      imageMsg("newest"),
    ];
    const result = pruneImages(msgs, 1, "[old]");
    const last = result[4] as { content: Array<{ type: string }> };
    expect(last.content[0].type).toBe("image");

    for (let i = 0; i < 4; i++) {
      const r = result[i] as { content: Array<{ type: string; text?: string }> };
      expect(r.content[0].type).toBe("text");
      expect(r.content[0].text).toBe("[old]");
    }
  });
});
