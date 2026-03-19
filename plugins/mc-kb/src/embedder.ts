/**
 * mc-kb — Embedder singleton
 *
 * Lazy-loads EmbeddingGemma-300M via node-llama-cpp.
 * Metal GPU accelerated on darwin-arm64.
 * Gracefully degrades to null if model unavailable.
 *
 * Daemon-aware factory: getEmbedder() tries daemon client first,
 * falls back to in-process model loading if daemon is unavailable.
 */

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import type { IEmbedder } from "./types.js";
import { EmbedClient } from "./embed-client.js";

// Default model path from qmd cache
const DEFAULT_MODEL_PATH = path.join(
  os.homedir(),
  ".cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf",
);

// Resolve node-llama-cpp: own dep first, then openclaw's bundled copy.
// Returns the path to dist/index.js for ESM dynamic import() compatibility.
import { execSync } from "node:child_process";

function findLlamaPath(): string {
  // Try import.meta.resolve (Node 20+)
  try {
    const resolved = import.meta.resolve("node-llama-cpp");
    // Converts file:// URL to path
    return new URL(resolved).pathname;
  } catch {}

  // Walk up from openclaw binary to find bundled node-llama-cpp
  try {
    const ocBin = fs.realpathSync(execSync("which openclaw", { encoding: "utf-8" }).trim());
    let dir = path.dirname(ocBin);
    for (let i = 0; i < 5; i++) {
      const candidate = path.join(dir, "node_modules", "node-llama-cpp");
      if (fs.existsSync(candidate)) {
        // Return the ESM entry point directly for dynamic import()
        const distIndex = path.join(candidate, "dist", "index.js");
        if (fs.existsSync(distIndex)) return distIndex;
        return candidate;
      }
      dir = path.dirname(dir);
    }
  } catch {}
  return "node-llama-cpp";
}

const OPENCLAW_LLAMA_PATH = findLlamaPath();

type LlamaEmbeddingContext = {
  getEmbeddingFor(text: string): Promise<{ vector: number[] }>;
  dispose(): Promise<void>;
};

export class Embedder implements IEmbedder {
  private ctx: LlamaEmbeddingContext | null = null;
  private loading = false;
  private loadAttempted = false;
  private loadPromise: Promise<void> | null = null;
  private readonly modelPath: string;
  private readonly dims: number = 768;

  constructor(modelPath?: string) {
    this.modelPath = modelPath ?? DEFAULT_MODEL_PATH;
  }

  isReady(): boolean {
    return this.ctx !== null;
  }

  getDims(): number {
    return this.dims;
  }

  async load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;
    if (this.loadAttempted) return;
    this.loadAttempted = true;
    this.loading = true;
    this.loadPromise = this._doLoad();
    return this.loadPromise;
  }

  private async _doLoad(): Promise<void> {

    if (!fs.existsSync(this.modelPath)) {
      console.warn(`[mc-kb/embedder] Model not found at ${this.modelPath} — vector search disabled`);
      this.loading = false;
      this.loadPromise = null;
      return;
    }

    // Validate GGUF magic bytes (0x47475546 = 'GGUF') before loading
    try {
      const fd = fs.openSync(this.modelPath, "r");
      const magic = Buffer.alloc(4);
      fs.readSync(fd, magic, 0, 4, 0);
      fs.closeSync(fd);
      if (magic.toString("ascii") !== "GGUF") {
        const hex = magic.toString("hex");
        console.error(`[mc-kb/embedder] Model file is corrupt (not valid GGUF). Expected magic 47475546, got ${hex}. Delete and re-download: ${this.modelPath}`);
        this.loading = false;
        this.loadPromise = null;
        return;
      }
    } catch (magicErr) {
      console.warn(`[mc-kb/embedder] Could not read model file for validation: ${magicErr}`);
      this.loading = false;
      this.loadPromise = null;
      return;
    }

    try {
      const llama = await import(OPENCLAW_LLAMA_PATH);
      const { getLlama } = llama;

      const gpu = process.platform === "darwin" ? "metal" : "auto";
      console.log(`[mc-kb/embedder] Loading EmbeddingGemma-300M (gpu=${gpu}) from ${this.modelPath}`);

      const llamaInstance = await getLlama({ gpu });
      const model = await llamaInstance.loadModel({ modelPath: this.modelPath });
      this.ctx = await model.createEmbeddingContext() as LlamaEmbeddingContext;

      console.log("[mc-kb/embedder] Model loaded OK — vector search enabled");
    } catch (err) {
      console.warn(`[mc-kb/embedder] Failed to load model: ${err}`);
      this.ctx = null;
    } finally {
      this.loading = false;
    }
  }

  /** Get embedding vector for text. Returns null if model unavailable. */
  async embed(text: string): Promise<Float32Array | null> {
    // Wait for in-progress load to complete before checking ctx
    if (this.loadPromise) await this.loadPromise;
    if (!this.loadAttempted) {
      await this.load();
      if (this.loadPromise) await this.loadPromise;
    }
    if (!this.ctx) return null;

    try {
      const result = await this.ctx.getEmbeddingFor(text);
      const vec = result.vector;
      return new Float32Array(vec);
    } catch (err) {
      console.warn(`[mc-kb/embedder] Embed error: ${err}`);
      return null;
    }
  }

  async dispose(): Promise<void> {
    if (this.ctx) {
      await this.ctx.dispose();
      this.ctx = null;
    }
  }
}

// Singleton instance — may be EmbedClient (daemon) or Embedder (in-process)
let _embedder: IEmbedder | null = null;
let _daemonChecked = false;

/**
 * Daemon-aware embedder factory.
 *
 * 1. If daemon socket exists and responds to ping → return EmbedClient
 * 2. Otherwise → return in-process Embedder (loads 313MB model)
 *
 * The check is done once per process lifetime; subsequent calls return the cached instance.
 */
export function getEmbedder(modelPath?: string): IEmbedder {
  if (_embedder) return _embedder;

  // Synchronous check: does the socket file exist?
  const client = new EmbedClient();
  if (client.isReady()) {
    // Socket file exists — optimistically use the client.
    // If daemon is actually dead, embed() calls will fail and callers
    // handle null returns gracefully (same as model-not-found).
    // We also kick off an async ping to verify, and swap to in-process if needed.
    _embedder = new DaemonAwareEmbedder(client, modelPath);
    return _embedder;
  }

  // No daemon socket — use in-process embedder
  _embedder = new Embedder(modelPath);
  return _embedder;
}

/**
 * Wraps EmbedClient with automatic fallback to in-process Embedder.
 * If the first daemon call fails, transparently switches to in-process.
 */
class DaemonAwareEmbedder implements IEmbedder {
  private client: EmbedClient;
  private fallback: Embedder | null = null;
  private useDaemon = true;
  private daemonVerified = false;
  private readonly modelPath?: string;

  constructor(client: EmbedClient, modelPath?: string) {
    this.client = client;
    this.modelPath = modelPath;
  }

  isReady(): boolean {
    if (this.useDaemon) return this.client.isReady();
    return this.fallback?.isReady() ?? false;
  }

  getDims(): number {
    return 768;
  }

  async load(): Promise<void> {
    // Try to verify daemon is alive
    if (this.useDaemon && !this.daemonVerified) {
      const available = await this.client.isAvailable();
      if (available) {
        this.daemonVerified = true;
        console.log("[mc-kb/embedder] Using embedding daemon via Unix socket");
        return;
      }
      // Daemon not responding — fall back
      console.log("[mc-kb/embedder] Daemon socket exists but not responding — falling back to in-process");
      this.useDaemon = false;
    }

    if (!this.useDaemon) {
      if (!this.fallback) this.fallback = new Embedder(this.modelPath);
      await this.fallback.load();
    }
  }

  async embed(text: string): Promise<Float32Array | null> {
    if (this.useDaemon) {
      // Try daemon first
      if (!this.daemonVerified) {
        await this.load();
      }

      if (this.useDaemon) {
        const result = await this.client.embed(text);
        if (result !== null) return result;

        // Daemon failed — check if it's really down
        const available = await this.client.isAvailable();
        if (!available) {
          console.log("[mc-kb/embedder] Daemon went away — falling back to in-process");
          this.useDaemon = false;
        } else {
          // Daemon is up but embed returned null — actual embedding failure
          return null;
        }
      }
    }

    // In-process fallback
    if (!this.fallback) {
      this.fallback = new Embedder(this.modelPath);
      await this.fallback.load();
    }
    return this.fallback.embed(text);
  }

  async dispose(): Promise<void> {
    if (this.fallback) await this.fallback.dispose();
  }
}

export type { IEmbedder };
