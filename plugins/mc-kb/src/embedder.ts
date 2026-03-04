/**
 * mc-kb — Embedder singleton
 *
 * Lazy-loads EmbeddingGemma-300M via node-llama-cpp.
 * Metal GPU accelerated on darwin-arm64.
 * Gracefully degrades to null if model unavailable.
 */

import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";

// Default model path from qmd cache
const DEFAULT_MODEL_PATH = path.join(
  os.homedir(),
  ".cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf",
);

const OPENCLAW_LLAMA_PATH = "/opt/homebrew/lib/node_modules/openclaw/node_modules/node-llama-cpp";

type LlamaEmbeddingContext = {
  getEmbeddingFor(text: string): Promise<{ vector: number[] }>;
  dispose(): Promise<void>;
};

export class Embedder {
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

// Singleton instance
let _embedder: Embedder | null = null;

export function getEmbedder(modelPath?: string): Embedder {
  if (!_embedder) {
    _embedder = new Embedder(modelPath);
  }
  return _embedder;
}
