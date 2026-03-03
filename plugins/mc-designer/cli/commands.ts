import type { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Logger } from "openclaw/plugin-sdk";
import type { DesignerConfig } from "../src/config.js";
import type { DesignerStore } from "../src/store.js";
import type { GeminiClient } from "../src/gemini.js";
import { compositeCanvas, stripBackground } from "../src/composite.js";
import type { Layer } from "../src/types.js";
import { promptAndVaultKey, isAuthError } from "../src/vault.js";
import { displayImage } from "../src/display.js";

interface Ctx {
  program: Command;
  cfg: DesignerConfig;
  store: DesignerStore;
  gemini: GeminiClient;
  logger: Logger;
}

export function registerDesignerCommands(ctx: Ctx): void {
  const { program, cfg, store, gemini, logger } = ctx;

  const designer = program.command("mc-designer").description("Miniclaw Designer — visual creation studio (occipital lobe)");

  // ---- designer gen ----
  designer
    .command("gen <prompt>")
    .description("Generate an image and add it as a new layer")
    .option("-c, --canvas <name>", "Target canvas (created if absent)", "default")
    .option("-l, --layer <name>", "Layer name")
    .option("-W, --width <px>", "Canvas width when auto-creating", String(cfg.defaultWidth))
    .option("-H, --height <px>", "Canvas height when auto-creating", String(cfg.defaultHeight))
    .option("-r, --role <role>", "Layer role: background (fills canvas) or element (sized + placed)")
    .option("-x, --x <px>", "X position for element layers (required for elements)")
    .option("-y, --y <px>", "Y position for element layers (required for elements)")
    .option("--w <px>", "Render width for element layers (required for elements)")
    .option("--h <px>", "Render height for element layers (required for elements)")
    .action(async (prompt: string, opts: {
      canvas: string; layer?: string; width: string; height: string;
      role?: string; x?: string; y?: string; w?: string; h?: string;
    }) => {
      const canvasName = opts.canvas;
      let canvas = store.loadCanvas(canvasName);
      if (!canvas) {
        canvas = store.createCanvas(
          canvasName,
          parseInt(opts.width, 10),
          parseInt(opts.height, 10),
        );
        console.log(`Created canvas "${canvasName}" (${canvas.width}×${canvas.height})`);
      }

      // Determine role: explicit flag > z=0 heuristic (first layer = background)
      const nextZ = store.nextZ(canvas);
      const role = (opts.role === "background" || opts.role === "element")
        ? opts.role
        : (nextZ === 0 ? "background" : "element");

      // Element layers require x, y, w, h
      if (role === "element") {
        const missing = (["x", "y", "w", "h"] as const).filter((k) => !opts[k]);
        if (missing.length > 0) {
          console.error(`Element layers require: ${missing.map((k) => `--${k}`).join(", ")}`);
          console.error(`Example: mc designer gen "..." --canvas ${opts.canvas} --role element --x 60 --y 48 --w 200 --h 80`);
          process.exit(1);
        }
      }

      // Engineer the prompt with canvas context so Gemini knows what it's making
      const engineeredPrompt = buildGeminiPrompt(prompt, role, canvas.width, canvas.height);

      // Prompt for key if missing or on auth failure
      const ensureKey = async (err?: unknown) => {
        if (!err || isAuthError(err)) {
          const newKey = await promptAndVaultKey(cfg.vaultBin);
          if (!newKey) process.exit(1);
          gemini.setApiKey(newKey);
        }
      };

      if (!cfg.apiKey) await ensureKey();

      console.log(`Generating image for: "${prompt}" (role=${role}, canvas=${canvas.width}×${canvas.height}) ...`);
      const t0 = Date.now();
      let result;
      try {
        result = await gemini.generate(engineeredPrompt, "generate");
      } catch (err) {
        if (isAuthError(err)) {
          console.error("Auth failed — invalid or missing API key.");
          await ensureKey(err);
          try {
            result = await gemini.generate(engineeredPrompt, "generate");
          } catch (retryErr) {
            console.error(`Generation failed: ${retryErr}`);
            process.exit(1);
          }
        } else {
          console.error(`Generation failed: ${err}`);
          process.exit(1);
        }
      }

      const layerId = `layer-${Date.now()}`;
      const layerName = opts.layer ?? `layer-${canvas.layers.length + 1}`;

      // Each layer must have a unique name on this canvas
      if (store.findLayer(canvas, layerName)) {
        console.error(`Layer "${layerName}" already exists on canvas "${canvasName}".`);
        console.error(`Each image must be on its own uniquely named layer. Use --layer <name> to specify one.`);
        process.exit(1);
      }

      const imagePath = store.saveLayerImage(canvasName, layerId, result!.buffer);

      const layer: Layer = {
        id: layerId,
        name: layerName,
        z: nextZ,
        imagePath,
        opacity: 100,
        visible: true,
        x: opts.x !== undefined ? parseInt(opts.x, 10) : 0,
        y: opts.y !== undefined ? parseInt(opts.y, 10) : 0,
        blendMode: "normal",
        role,
        renderWidth: opts.w !== undefined ? parseInt(opts.w, 10) : undefined,
        renderHeight: opts.h !== undefined ? parseInt(opts.h, 10) : undefined,
        prompt,
        createdAt: new Date().toISOString(),
      };
      store.addLayer(canvas, layer);

      store.recordUsage({ ts: new Date().toISOString(), ...result.usage, canvasName, layerName });

      console.log(`Layer "${layerName}" added to canvas "${canvasName}"`);
      console.log(`Image saved: ${imagePath}`);
      console.log(`Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out  |  ${Date.now() - t0}ms`);
      await displayImage(imagePath);
    });

  // ---- designer edit ----
  designer
    .command("edit <canvas> <layer> <instructions>")
    .description("Edit an existing layer using Gemini")
    .action(async (canvasName: string, layerName: string, instructions: string) => {
      const canvas = store.loadCanvas(canvasName);
      if (!canvas) { console.error(`Canvas "${canvasName}" not found`); process.exit(1); }

      const layer = store.findLayer(canvas, layerName);
      if (!layer) { console.error(`Layer "${layerName}" not found in canvas "${canvasName}"`); process.exit(1); }

      if (!cfg.apiKey) {
        const newKey = await promptAndVaultKey(cfg.vaultBin);
        if (!newKey) process.exit(1);
        gemini.setApiKey(newKey);
      }

      console.log(`Editing layer "${layerName}": "${instructions}" ...`);
      let result;
      try {
        result = await gemini.edit(layer.imagePath, instructions);
      } catch (err) {
        if (isAuthError(err)) {
          console.error("Auth failed — invalid or missing API key.");
          const newKey = await promptAndVaultKey(cfg.vaultBin);
          if (!newKey) process.exit(1);
          gemini.setApiKey(newKey);
          try {
            result = await gemini.edit(layer.imagePath, instructions);
          } catch (retryErr) {
            console.error(`Edit failed: ${retryErr}`);
            process.exit(1);
          }
        } else {
          console.error(`Edit failed: ${err}`);
          process.exit(1);
        }
      }

      store.saveLayerImage(canvasName, layer.id, result.buffer);
      store.recordUsage({ ts: new Date().toISOString(), ...result.usage, canvasName, layerName });

      console.log(`Layer "${layerName}" updated`);
      console.log(`Tokens: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out`);
      await displayImage(layer.imagePath);
    });

  // ---- designer canvas ----
  const canvas = designer.command("canvas").description("Canvas management");

  canvas
    .command("new <name>")
    .description("Create a new canvas")
    .option("-W, --width <px>", "Width in pixels", String(cfg.defaultWidth))
    .option("-H, --height <px>", "Height in pixels", String(cfg.defaultHeight))
    .action((name: string, opts: { width: string; height: string }) => {
      if (store.loadCanvas(name)) {
        console.error(`Canvas "${name}" already exists`);
        process.exit(1);
      }
      const c = store.createCanvas(name, parseInt(opts.width, 10), parseInt(opts.height, 10));
      console.log(`Canvas "${c.name}" created (${c.width}×${c.height})`);
    });

  canvas
    .command("list")
    .description("List all canvases")
    .action(() => {
      const names = store.listCanvases();
      if (names.length === 0) {
        console.log("No canvases yet. Run: designer canvas new <name>");
        return;
      }
      for (const name of names) {
        const c = store.loadCanvas(name)!;
        console.log(`  ${name}  (${c.width}×${c.height}, ${c.layers.length} layers)`);
      }
    });

  canvas
    .command("show <name>")
    .description("Show layer stack for a canvas")
    .action((name: string) => {
      const c = store.loadCanvas(name);
      if (!c) { console.error(`Canvas "${name}" not found`); process.exit(1); }
      console.log(`Canvas: ${c.name}  ${c.width}×${c.height}  (${c.layers.length} layers)`);
      if (c.layers.length === 0) { console.log("  (no layers)"); return; }
      const sorted = [...c.layers].sort((a, b) => b.z - a.z);
      for (const l of sorted) {
        const vis = l.visible ? "✓" : "○";
        console.log(`  z${l.z}  ${vis}  ${l.name}  opacity=${l.opacity}%  blend=${l.blendMode}`);
        if (l.prompt) console.log(`       prompt: "${l.prompt}"`);
      }
    });

  canvas
    .command("rm <name>")
    .description("Delete a canvas (does not delete layer image files)")
    .action((name: string) => {
      if (!store.deleteCanvas(name)) {
        console.error(`Canvas "${name}" not found`);
        process.exit(1);
      }
      console.log(`Canvas "${name}" deleted`);
    });

  canvas
    .command("clear <name>")
    .description("Remove all layers from a canvas, keeping the canvas itself")
    .action((name: string) => {
      const c = store.loadCanvas(name);
      if (!c) { console.error(`Canvas "${name}" not found`); process.exit(1); }
      const count = c.layers.length;
      c.layers = [];
      store.saveCanvas(c);
      console.log(`Canvas "${name}" cleared (${count} layers removed)`);
    });

  // ---- designer layer ----
  const layer = designer.command("layer").description("Layer management");

  layer
    .command("add <canvas> <file>")
    .description("Add an existing image file as a new layer")
    .option("-n, --name <name>", "Layer name")
    .option("-z, --z <index>", "Z-index (auto if omitted)")
    .option("-r, --role <role>", "Layer role: background or element", "element")
    .option("-x, --x <px>", "X offset", "0")
    .option("-y, --y <px>", "Y offset", "0")
    .action((canvasName: string, file: string, opts: { name?: string; z?: string; role?: string; x: string; y: string }) => {
      const c = store.loadCanvas(canvasName);
      if (!c) { console.error(`Canvas "${canvasName}" not found`); process.exit(1); }
      if (!fs.existsSync(file)) { console.error(`File not found: ${file}`); process.exit(1); }

      const layerId = `layer-${Date.now()}`;
      const layerName = opts.name ?? path.basename(file, path.extname(file));
      const dest = store.saveLayerImage(canvasName, layerId, fs.readFileSync(file));
      const role = (opts.role === "background" || opts.role === "element") ? opts.role : "element";

      const l: Layer = {
        id: layerId,
        name: layerName,
        z: opts.z !== undefined ? parseInt(opts.z, 10) : store.nextZ(c),
        imagePath: dest,
        opacity: 100,
        visible: true,
        x: parseInt(opts.x, 10),
        y: parseInt(opts.y, 10),
        blendMode: "normal",
        role,
        createdAt: new Date().toISOString(),
      };
      store.addLayer(c, l);
      console.log(`Layer "${layerName}" added to "${canvasName}" at z=${l.z}`);
    });

  layer
    .command("rm <canvas> <layer>")
    .description("Remove a layer from a canvas")
    .action((canvasName: string, layerName: string) => {
      const c = store.loadCanvas(canvasName);
      if (!c) { console.error(`Canvas "${canvasName}" not found`); process.exit(1); }
      if (!store.removeLayer(c, layerName)) {
        console.error(`Layer "${layerName}" not found`);
        process.exit(1);
      }
      console.log(`Layer "${layerName}" removed from "${canvasName}"`);
    });

  layer
    .command("mv <canvas> <layer>")
    .description("Move layer to a new z-index")
    .requiredOption("-z, --z <index>", "New z-index")
    .action((canvasName: string, layerName: string, opts: { z: string }) => {
      const c = store.loadCanvas(canvasName);
      if (!c) { console.error(`Canvas "${canvasName}" not found`); process.exit(1); }
      const l = store.findLayer(c, layerName);
      if (!l) { console.error(`Layer "${layerName}" not found`); process.exit(1); }
      l.z = parseInt(opts.z, 10);
      c.layers.sort((a, b) => a.z - b.z);
      store.saveCanvas(c);
      console.log(`Layer "${layerName}" moved to z=${l.z}`);
    });

  layer
    .command("opacity <canvas> <layer> <value>")
    .description("Set layer opacity (0–100)")
    .action((canvasName: string, layerName: string, value: string) => {
      const c = store.loadCanvas(canvasName);
      if (!c) { console.error(`Canvas "${canvasName}" not found`); process.exit(1); }
      const l = store.findLayer(c, layerName);
      if (!l) { console.error(`Layer "${layerName}" not found`); process.exit(1); }
      const v = Math.max(0, Math.min(100, parseInt(value, 10)));
      l.opacity = v;
      store.saveCanvas(c);
      console.log(`Layer "${layerName}" opacity set to ${v}%`);
    });

  layer
    .command("toggle <canvas> <layer>")
    .description("Toggle layer visibility")
    .action((canvasName: string, layerName: string) => {
      const c = store.loadCanvas(canvasName);
      if (!c) { console.error(`Canvas "${canvasName}" not found`); process.exit(1); }
      const l = store.findLayer(c, layerName);
      if (!l) { console.error(`Layer "${layerName}" not found`); process.exit(1); }
      l.visible = !l.visible;
      store.saveCanvas(c);
      console.log(`Layer "${layerName}" is now ${l.visible ? "visible" : "hidden"}`);
    });

  layer
    .command("rename <canvas> <layer> <newname>")
    .description("Rename a layer")
    .action((canvasName: string, layerName: string, newName: string) => {
      const c = store.loadCanvas(canvasName);
      if (!c) { console.error(`Canvas "${canvasName}" not found`); process.exit(1); }
      const l = store.findLayer(c, layerName);
      if (!l) { console.error(`Layer "${layerName}" not found`); process.exit(1); }
      l.name = newName;
      store.saveCanvas(c);
      console.log(`Layer renamed to "${newName}"`);
    });

  layer
    .command("blend <canvas> <layer> <mode>")
    .description("Set blend mode: normal | multiply | screen | overlay")
    .action((canvasName: string, layerName: string, mode: string) => {
      const valid = ["normal", "multiply", "screen", "overlay"];
      if (!valid.includes(mode)) {
        console.error(`Invalid blend mode. Choose: ${valid.join(", ")}`);
        process.exit(1);
      }
      const c = store.loadCanvas(canvasName);
      if (!c) { console.error(`Canvas "${canvasName}" not found`); process.exit(1); }
      const l = store.findLayer(c, layerName);
      if (!l) { console.error(`Layer "${layerName}" not found`); process.exit(1); }
      l.blendMode = mode as Layer["blendMode"];
      store.saveCanvas(c);
      console.log(`Layer "${layerName}" blend mode set to "${mode}"`);
    });

  layer
    .command("clear <canvas>")
    .description("Remove all layers from a canvas")
    .action((canvasName: string) => {
      const c = store.loadCanvas(canvasName);
      if (!c) { console.error(`Canvas "${canvasName}" not found`); process.exit(1); }
      const count = c.layers.length;
      c.layers = [];
      store.saveCanvas(c);
      console.log(`All ${count} layers removed from "${canvasName}"`);
    });

  // ---- designer composite ----
  designer
    .command("composite <canvas>")
    .description("Flatten all visible layers and export a PNG")
    .option("-o, --out <file>", "Output file path (auto-named if omitted)")
    .action(async (canvasName: string, opts: { out?: string }) => {
      const c = store.loadCanvas(canvasName);
      if (!c) { console.error(`Canvas "${canvasName}" not found`); process.exit(1); }

      console.log(`Compositing "${canvasName}" (${c.layers.filter((l) => l.visible).length} visible layers) ...`);

      let buffer: Buffer;
      try {
        buffer = await compositeCanvas(c);
      } catch (err) {
        console.error(`Composite failed: ${err}`);
        process.exit(1);
      }

      const outPath =
        opts.out ??
        path.join(cfg.outputDir, `${canvasName}-${Date.now()}.png`);

      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, buffer);
      console.log(`Composited image saved: ${outPath}`);
      await displayImage(outPath);
    });

  // ---- designer alpha ----
  const alpha = designer.command("alpha").description("Transparency / alpha operations");

  alpha
    .command("strip <file>")
    .description("Strip background from an image (outputs <file>.nobg.png)")
    .action(async (file: string) => {
      if (!fs.existsSync(file)) { console.error(`File not found: ${file}`); process.exit(1); }
      const outPath = file.replace(/(\.[^.]+)$/, ".nobg.png");
      const buffer = await stripBackground(file);
      fs.writeFileSync(outPath, buffer);
      console.log(`Background stripped: ${outPath}`);
    });

  // ---- designer stats ----
  designer
    .command("stats")
    .description("Show Gemini API usage and estimated cost")
    .option("--full", "Show full per-call log")
    .action((opts: { full?: boolean }) => {
      const records = store.loadUsageRecords();
      if (records.length === 0) {
        console.log("No usage recorded yet.");
        return;
      }

      const summary = store.computeSummary(records);
      console.log("\n  Miniclaw Designer — Gemini Usage Summary");
      console.log("  ─────────────────────────────────────────");
      console.log(`  Total API calls : ${summary.totalCalls}`);
      console.log(`    generate      : ${summary.byOp.generate}`);
      console.log(`    edit          : ${summary.byOp.edit}`);
      console.log(`  Images generated: ${summary.totalImages}`);
      console.log(`  Input tokens    : ${summary.totalInputTokens.toLocaleString()}`);
      console.log(`  Output tokens   : ${summary.totalOutputTokens.toLocaleString()}`);
      console.log(`  Est. cost (USD) : $${summary.estimatedCostUsd.toFixed(4)}`);
      if (summary.firstCallAt) console.log(`  First call      : ${summary.firstCallAt}`);
      if (summary.lastCallAt)  console.log(`  Last call       : ${summary.lastCallAt}`);
      console.log("");

      if (opts.full) {
        console.log("  Per-call log:");
        for (const r of records) {
          console.log(
            `  ${r.ts}  ${r.op.padEnd(8)}  ${r.imageCount} img  ` +
            `${r.inputTokens}in/${r.outputTokens}out  ${r.durationMs}ms  ` +
            `canvas=${r.canvasName ?? "-"}  layer=${r.layerName ?? "-"}`,
          );
        }
        console.log("");
      }
    });
}

// ── Prompt engineering ────────────────────────────────────────────────────────

/**
 * Append canvas context to the user's prompt so Gemini understands:
 * - background: must fill the full frame, correct aspect ratio, no letterboxing
 * - element: isolated subject, white background (easy to alpha-strip), centered
 */
function buildGeminiPrompt(
  userPrompt: string,
  role: "background" | "element",
  canvasWidth: number,
  canvasHeight: number,
): string {
  const aspect = `${canvasWidth}×${canvasHeight}`;
  const ratio = (canvasWidth / canvasHeight).toFixed(2);

  if (role === "background") {
    return (
      `${userPrompt}. ` +
      `Full bleed, fills entire frame edge to edge, aspect ratio ${ratio}, no borders or whitespace.`
    );
  } else {
    return (
      `${userPrompt}. ` +
      `Subject centered on solid white background, clean hard edges, no shadows or gradients behind it.`
    );
  }
}
