import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Embedder } from "./embedder.js";

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "mc-kb-embedder-test-"));
}

describe("Embedder", () => {
  let dir: string;

  beforeEach(() => {
    dir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // ── Missing model path ────────────────────────────────────────────

  describe("missing model path", () => {
    it("load() completes without throwing when model path does not exist", async () => {
      const embedder = new Embedder(join(dir, "nonexistent.gguf"));
      await expect(embedder.load()).resolves.not.toThrow();
    });

    it("embed() returns null when model path does not exist", async () => {
      const embedder = new Embedder(join(dir, "nonexistent.gguf"));
      const result = await embedder.embed("test text");
      expect(result).toBeNull();
    });

    it("isReady() returns false when model is unavailable", async () => {
      const embedder = new Embedder(join(dir, "nonexistent.gguf"));
      await embedder.load();
      expect(embedder.isReady()).toBe(false);
    });
  });

  // ── Corrupt GGUF magic bytes ──────────────────────────────────────

  describe("corrupt model file (bad magic bytes)", () => {
    it("load() completes without throwing for corrupt GGUF", async () => {
      const corruptPath = join(dir, "corrupt.gguf");
      writeFileSync(corruptPath, "NOT_GGUF_CONTENT_HERE");
      const embedder = new Embedder(corruptPath);
      await expect(embedder.load()).resolves.not.toThrow();
    });

    it("embed() returns null for corrupt GGUF file", async () => {
      const corruptPath = join(dir, "corrupt.gguf");
      writeFileSync(corruptPath, "NOT_GGUF_CONTENT_HERE");
      const embedder = new Embedder(corruptPath);
      const result = await embedder.embed("test text");
      expect(result).toBeNull();
    });

    it("isReady() returns false for corrupt GGUF file", async () => {
      const corruptPath = join(dir, "corrupt.gguf");
      writeFileSync(corruptPath, "BAAD_MAGIC_BYTES_CONTENT");
      const embedder = new Embedder(corruptPath);
      await embedder.load();
      expect(embedder.isReady()).toBe(false);
    });
  });

  // ── Zero-byte model file ──────────────────────────────────────────

  describe("zero-byte model file", () => {
    it("load() completes without throwing for empty file", async () => {
      const emptyPath = join(dir, "empty.gguf");
      writeFileSync(emptyPath, "");
      const embedder = new Embedder(emptyPath);
      await expect(embedder.load()).resolves.not.toThrow();
    });

    it("embed() returns null for empty file", async () => {
      const emptyPath = join(dir, "empty.gguf");
      writeFileSync(emptyPath, "");
      const embedder = new Embedder(emptyPath);
      const result = await embedder.embed("test text");
      expect(result).toBeNull();
    });

    it("isReady() returns false for empty file", async () => {
      const emptyPath = join(dir, "empty.gguf");
      writeFileSync(emptyPath, "");
      const embedder = new Embedder(emptyPath);
      await embedder.load();
      expect(embedder.isReady()).toBe(false);
    });
  });

  // ── Valid GGUF magic but truncated ────────────────────────────────

  describe("valid GGUF magic but truncated file", () => {
    it("load() completes without throwing for truncated GGUF", async () => {
      const truncatedPath = join(dir, "truncated.gguf");
      // Write valid GGUF magic bytes followed by garbage
      const buf = Buffer.alloc(16);
      buf.write("GGUF", 0, 4, "ascii");
      writeFileSync(truncatedPath, buf);
      const embedder = new Embedder(truncatedPath);
      // load() will pass magic check but fail on node-llama-cpp import/load
      // It should handle this gracefully (catch block in _doLoad)
      await expect(embedder.load()).resolves.not.toThrow();
    });

    it("embed() returns null for truncated GGUF", async () => {
      const truncatedPath = join(dir, "truncated.gguf");
      const buf = Buffer.alloc(16);
      buf.write("GGUF", 0, 4, "ascii");
      writeFileSync(truncatedPath, buf);
      const embedder = new Embedder(truncatedPath);
      const result = await embedder.embed("test text");
      expect(result).toBeNull();
    });
  });

  // ── load() idempotency ────────────────────────────────────────────

  describe("load() idempotency", () => {
    it("second load() call returns immediately without re-attempting", async () => {
      const embedder = new Embedder(join(dir, "nonexistent.gguf"));

      // First load — sets loadAttempted
      await embedder.load();
      expect(embedder.isReady()).toBe(false);

      // Second load — should be a no-op (loadAttempted is true)
      await embedder.load();
      expect(embedder.isReady()).toBe(false);
    });

    it("concurrent load() calls return the same promise", async () => {
      const corruptPath = join(dir, "corrupt.gguf");
      writeFileSync(corruptPath, "NOT_GGUF");
      const embedder = new Embedder(corruptPath);

      // Fire two loads concurrently — they should resolve the same promise
      const [r1, r2] = await Promise.all([embedder.load(), embedder.load()]);
      expect(r1).toBeUndefined();
      expect(r2).toBeUndefined();
      expect(embedder.isReady()).toBe(false);
    });
  });

  // ── getDims ────────────────────────────────────────────────────────

  it("getDims() returns 768", () => {
    const embedder = new Embedder(join(dir, "any.gguf"));
    expect(embedder.getDims()).toBe(768);
  });
});
