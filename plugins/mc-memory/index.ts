/**
 * mc-memory — OpenClaw plugin
 *
 * Unified memory gateway wrapping mc-memo + mc-kb + episodic memory.
 * Smart routing for writes, unified search for recall, and
 * promotion for graduating short-term to long-term memory.
 *
 * Tools: memory_write, memory_recall, memory_promote
 * CLI:   openclaw mc-memory write|recall|promote
 */

import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { KBStore } from "../mc-kb/src/store.js";
import { getEmbedder } from "../mc-kb/src/embedder.js";
import { hybridSearch } from "../mc-kb/src/search.js";
import { formatEntryLine } from "../mc-kb/src/entry.js";
import { registerMemoryCommands } from "./cli/commands.js";
import { createMemoryTools } from "./tools/definitions.js";
import { recall } from "./src/recall.js";
import { write } from "./src/writer.js";

// ---- Config ----

interface MemoryConfig {
  memoDir: string;
  kbDbDir: string;
  episodicDir: string;
  modelPath: string;
  contextN: number;
  contextThreshold: number;
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveConfig(api: OpenClawPluginApi): MemoryConfig {
  const raw = (api.pluginConfig ?? {}) as Partial<MemoryConfig>;
  return {
    memoDir: resolvePath(raw.memoDir ?? "~/.openclaw/miniclaw/USER/memos"),
    kbDbDir: resolvePath(raw.kbDbDir ?? "~/.openclaw/miniclaw/USER/kb"),
    episodicDir: resolvePath(raw.episodicDir ?? "~/.openclaw/miniclaw/USER/memory"),
    modelPath: resolvePath(
      raw.modelPath ?? "~/.cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf",
    ),
    contextN: raw.contextN ?? 5,
    contextThreshold: raw.contextThreshold ?? 0.75,
  };
}

// ---- Plugin entry point ----

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);
  api.logger.info(`mc-memory loading (kbDbDir=${cfg.kbDbDir}, memoDir=${cfg.memoDir}, episodicDir=${cfg.episodicDir})`);

  const store = new KBStore(cfg.kbDbDir);
  const embedder = getEmbedder(cfg.modelPath);

  // Warm up embedder in background (don't block plugin load)
  embedder.load().catch((err) => {
    api.logger.warn(`mc-memory: embedder warm-up failed: ${err}`);
  });

  api.logger.info(`mc-memory loaded (vecEnabled=${store.isVecLoaded()})`);

  // ---- CLI ----
  api.registerCli((ctx) => {
    registerMemoryCommands(
      { program: ctx.program, logger: api.logger },
      store,
      embedder,
      hybridSearch,
      cfg.memoDir,
      cfg.episodicDir,
    );
  });

  // ---- Context hook: inject relevant memories before each prompt ----
  api.on("before_prompt_build", async (event, ctx) => {
    try {
      const messages = (ctx as any)?.messages ?? [];
      if (messages.length < 2) return;

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

      // Use unified recall instead of just KB search
      const results = await recall(
        store,
        embedder,
        hybridSearch,
        cfg.memoDir,
        cfg.episodicDir,
        queryText,
        { n: cfg.contextN, vecThreshold: cfg.contextThreshold },
      );

      if (results.length === 0) return;

      const lines = results.map((r) => {
        switch (r.source) {
          case "kb":
            return formatEntryLine(r.entry!);
          case "memo":
            return `[memo/${r.cardId}] ${r.line}`;
          case "episodic":
            return `[episodic/${r.date}] ${(r.content ?? r.snippet ?? "").slice(0, 2000)}`;
          default:
            return "";
        }
      }).filter(Boolean);

      const hint = `\n\n_Tip: Use \`memory_write\` to save important learnings, decisions, or gotchas for future sessions._`;
      const block = `## Relevant Memories\n${lines.join("\n\n")}${hint}`;

      api.logger.debug(`mc-memory: injecting ${results.length} memory entries into context`);
      return { prependContext: block };
    } catch (err) {
      api.logger.warn(`mc-memory: before_prompt_build error: ${err}`);
      return;
    }
  });

  // ---- Session end hook: auto-capture session context ----
  api.on("agent_end", async (event, ctx) => {
    try {
      // Extract cardId from workspaceDir (e.g. /.../.openclaw/tmp/2026-03-24T04-43-14-crd_dc9b80f8)
      const workspaceDir = (ctx as any)?.workspaceDir ?? "";
      const cardMatch = workspaceDir.match(/\b(crd_[a-f0-9]+)\b/);
      const cardId = cardMatch?.[1] ?? undefined;

      const messages = (event as any)?.messages ?? [];
      if (messages.length < 2) return;

      // Gather assistant messages to extract a session summary
      const assistantMsgs = messages
        .filter((m: { role: string }) => m.role === "assistant")
        .map((m: { content: unknown }) => {
          if (typeof m.content === "string") return m.content;
          if (Array.isArray(m.content)) {
            return (m.content as Array<{ type: string; text?: string }>)
              .filter((b) => b.type === "text")
              .map((b) => b.text ?? "")
              .join(" ");
          }
          return "";
        })
        .filter((t: string) => t.trim().length > 0);

      if (assistantMsgs.length === 0) return;

      // Build a concise session summary from the last assistant messages
      const tail = assistantMsgs.slice(-3).join("\n\n");
      const durationNote = (event as any)?.durationMs
        ? ` (${Math.round((event as any).durationMs / 1000)}s)`
        : "";
      const successNote = (event as any)?.success === false ? " [session ended with error]" : "";

      const summary = cardId
        ? `Session summary${durationNote}${successNote}: ${tail.slice(0, 1500)}`
        : `Session summary${durationNote}${successNote}:\n\n${tail.slice(0, 1500)}`;

      await write(store, embedder, cfg.memoDir, cfg.episodicDir, summary, {
        cardId,
        forceTarget: cardId ? "memo" : "episodic",
        source: "agent_end_hook",
        minLength: 30,
      });

      api.logger.debug(`mc-memory: agent_end auto-captured session to ${cardId ? `memo/${cardId}` : "episodic"}`);
    } catch (err) {
      api.logger.warn(`mc-memory: agent_end hook error: ${err}`);
    }
  });

  // ---- Agent tools ----
  for (const tool of createMemoryTools(store, embedder, hybridSearch, cfg.memoDir, cfg.episodicDir, api.logger)) {
    api.registerTool(tool);
  }
}
