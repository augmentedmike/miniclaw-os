/**
 * mc-designer — OpenClaw plugin
 *
 * The agent's occipital lobe — visual creation in imagination mode.
 * Generates and manipulates images via Gemini. Supports layered composition,
 * transparency, and canvas-based project management.
 *
 * NOT for seeing (that's the LLM's multimodal vision) —
 * for CREATING: generating, editing, compositing, and exporting.
 *
 * Phase 1: Generation + layer system + compositing + stats
 * Phase 2: Advanced alpha / transparency (inpainting, masking)
 * Phase 3: Persona injection — visual artist context in before_prompt_build
 * Future:  Photoshop-style filters (see PLAN.md)
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveConfig } from "./src/config.ts";
import { DesignerStore } from "./src/store.ts";
import { GeminiClient } from "./src/gemini.ts";
import { readApiKeyFromVault } from "./src/vault.ts";
import { registerDesignerCommands } from "./cli/commands.ts";

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig((api.pluginConfig ?? {}) as Record<string, unknown>);

  // Try vault if no key in config
  if (!cfg.apiKey) {
    const vaultKey = readApiKeyFromVault(cfg.vaultBin);
    if (vaultKey) {
      cfg.apiKey = vaultKey;
    } else {
      api.logger.warn("mc-designer: no apiKey found — gen/edit will prompt on first use");
    }
  }

  const store = new DesignerStore(cfg);
  const gemini = new GeminiClient(cfg.apiKey, cfg.model);

  api.logger.info(`mc-designer loaded (model=${cfg.model}, media=${cfg.mediaDir})`);

  // ---- CLI ----
  api.registerCli((ctx) => {
    registerDesignerCommands({ program: ctx.program, cfg, store, gemini, logger: api.logger });
  });

  // ---- Context injection: artist persona ----
  // Phase 3: inject visual project state into prompt context so the agent
  // knows what canvases/layers exist when reasoning about visual work.
  // (lightweight — only fires if there are canvases)
  api.on("before_prompt_build", async (_event, _ctx) => {
    try {
      const canvasNames = store.listCanvases();
      if (canvasNames.length === 0) return;

      const lines: string[] = ["[Designer] Active canvases:"];
      for (const name of canvasNames) {
        const canvas = store.loadCanvas(name);
        if (!canvas) continue;
        const visible = canvas.layers.filter((l) => l.visible).length;
        lines.push(`  • ${name}  ${canvas.width}×${canvas.height}  ${visible}/${canvas.layers.length} layers visible`);
      }

      return { prependContext: lines.join("\n") };
    } catch {
      return;
    }
  });
}
