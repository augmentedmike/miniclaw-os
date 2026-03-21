/**
 * mc-kb — OpenClaw plugin
 *
 * SQLite + vector long-term knowledge base.
 * The "hippocampus" — stores and recalls structured knowledge:
 * errors, workflows, guides, how-tos, facts, postmortems.
 *
 * Hybrid search: FTS5 BM25 + sqlite-vec cosine → RRF merge
 * Embedder: EmbeddingGemma-300M via node-llama-cpp (Metal GPU)
 */

import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { KBStore } from "./src/store.js";
import { getEmbedder } from "./src/embedder.js";
import { hybridSearch } from "./src/search.js";
import { formatEntryLine } from "./src/entry.js";
import { registerKbCommands } from "./cli/commands.js";
import { createKbTools } from "./tools/definitions.js";

// ---- Config ----

interface KbConfig {
  dbDir: string;
  modelPath: string;
  qmdBin: string;
  qmdCollection: string;
  contextN: number;
  contextThreshold: number; // cosine distance threshold (0..2)
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveConfig(api: OpenClawPluginApi): KbConfig {
  const raw = (api.pluginConfig ?? {}) as Partial<KbConfig>;
  return {
    dbDir: resolvePath(raw.dbDir ?? `~/.openclaw/miniclaw/USER/kb`),
    modelPath: resolvePath(
      raw.modelPath ?? "~/.cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf",
    ),
    qmdBin: resolvePath(raw.qmdBin ?? "~/.bun/bin/qmd"),
    qmdCollection: raw.qmdCollection ?? "kb",
    contextN: raw.contextN ?? 3,
    contextThreshold: raw.contextThreshold ?? 0.75, // cosine distance (lower = more similar)
  };
}

// ---- Plugin entry point ----

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);
  api.logger.info(`mc-kb loading (dbDir=${cfg.dbDir})`);

  const store = new KBStore(cfg.dbDir);
  const embedder = getEmbedder(cfg.modelPath);

  // Warm up embedder in background (don't block plugin load)
  embedder.load().catch((err) => {
    api.logger.warn(`mc-kb: embedder warm-up failed: ${err}`);
  });

  api.logger.info(`mc-kb loaded (vecEnabled=${store.isVecLoaded()})`);

  // ---- CLI ----
  api.registerCli((ctx) => {
    registerKbCommands(
      { program: ctx.program, logger: api.logger },
      store,
      embedder,
    );
  });

  // ---- Context hook: inject relevant KB entries before each prompt ----
  api.on("before_prompt_build", async (event, ctx) => {
    try {
      // Only inject if there's an actual user message to search against
      const messages = (ctx as any)?.messages ?? [];
      if (messages.length < 2) return;

      // Use last user message as query
      const lastUser = [...messages].reverse().find(
        (m: { role: string }) => m.role === "user",
      );
      if (!lastUser) return;

      const queryText =
        typeof lastUser.content === "string"
          ? lastUser.content
          : Array.isArray(lastUser.content)
          ? lastUser.content
              .filter((b: { type: string }) => b.type === "text")
              .map((b: { text: string }) => b.text)
              .join(" ")
          : "";

      if (!queryText || queryText.length < 10) return;

      const results = await hybridSearch(store, embedder, queryText, {
        n: cfg.contextN,
        vecThreshold: cfg.contextThreshold,
      });

      if (results.length === 0) return;

      const lines = results.map((r) => formatEntryLine(r.entry));
      const block = `## Relevant Knowledge Base\n${lines.join("\n\n")}`;

      api.logger.debug(`mc-kb: injecting ${results.length} KB entries into context`);
      return { prependContext: block };
    } catch (err) {
      api.logger.warn(`mc-kb: before_prompt_build error: ${err}`);
      return;
    }
  });

  // ---- Agent tools (use in-process store+embedder — no subprocess spawning) ----
  for (const tool of createKbTools(store, embedder, api.logger)) {
    api.registerTool(tool);
  }
}
