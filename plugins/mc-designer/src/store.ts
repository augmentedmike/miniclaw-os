import * as fs from "node:fs";
import * as path from "node:path";
import type { Canvas, Layer, UsageRecord, UsageSummary, DesignerOp } from "./types.js";
import type { DesignerConfig } from "./config.js";

// ---- Gemini 2.0 Flash pricing (as of 2026-03) ----
// Input:  $0.075 / 1M tokens
// Output: $0.30  / 1M tokens
// Images: ~$0.04 per image (approximate, varies by resolution)
const PRICE_INPUT_PER_M  = 0.075;
const PRICE_OUTPUT_PER_M = 0.30;
const PRICE_PER_IMAGE    = 0.04;

export class DesignerStore {
  constructor(private cfg: DesignerConfig) {
    this.ensureDirs();
  }

  private ensureDirs(): void {
    for (const dir of [
      this.cfg.canvasDir,
      this.cfg.layersDir,
      this.cfg.outputDir,
    ]) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // ---- Canvas ops ----

  canvasPath(name: string): string {
    return path.join(this.cfg.canvasDir, `${name}.json`);
  }

  listCanvases(): string[] {
    if (!fs.existsSync(this.cfg.canvasDir)) return [];
    return fs
      .readdirSync(this.cfg.canvasDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5));
  }

  loadCanvas(name: string): Canvas | null {
    const p = this.canvasPath(name);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as Canvas;
  }

  saveCanvas(canvas: Canvas): void {
    canvas.updatedAt = new Date().toISOString();
    fs.writeFileSync(this.canvasPath(canvas.name), JSON.stringify(canvas, null, 2));
  }

  createCanvas(name: string, width: number, height: number): Canvas {
    const canvas: Canvas = {
      id: `canvas-${Date.now()}`,
      name,
      width,
      height,
      layers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.saveCanvas(canvas);
    return canvas;
  }

  deleteCanvas(name: string): boolean {
    const p = this.canvasPath(name);
    if (!fs.existsSync(p)) return false;
    fs.unlinkSync(p);
    return true;
  }

  // ---- Layer helpers ----

  layerDir(canvasName: string): string {
    return path.join(this.cfg.layersDir, canvasName);
  }

  layerImagePath(canvasName: string, layerId: string): string {
    return path.join(this.layerDir(canvasName), `${layerId}.png`);
  }

  saveLayerImage(canvasName: string, layerId: string, buffer: Buffer): string {
    const dir = this.layerDir(canvasName);
    fs.mkdirSync(dir, { recursive: true });
    const p = this.layerImagePath(canvasName, layerId);
    fs.writeFileSync(p, buffer);
    return p;
  }

  nextZ(canvas: Canvas): number {
    if (canvas.layers.length === 0) return 0;
    return Math.max(...canvas.layers.map((l) => l.z)) + 1;
  }

  findLayer(canvas: Canvas, nameOrId: string): Layer | null {
    return (
      canvas.layers.find(
        (l) => l.name === nameOrId || l.id === nameOrId,
      ) ?? null
    );
  }

  addLayer(canvas: Canvas, layer: Layer): void {
    canvas.layers.push(layer);
    canvas.layers.sort((a, b) => a.z - b.z);
    this.saveCanvas(canvas);
  }

  removeLayer(canvas: Canvas, nameOrId: string): boolean {
    const idx = canvas.layers.findIndex(
      (l) => l.name === nameOrId || l.id === nameOrId,
    );
    if (idx === -1) return false;
    canvas.layers.splice(idx, 1);
    this.saveCanvas(canvas);
    return true;
  }

  // ---- Usage log ----

  recordUsage(record: UsageRecord): void {
    const line = JSON.stringify(record) + "\n";
    fs.appendFileSync(this.cfg.usageLog, line);
  }

  loadUsageRecords(): UsageRecord[] {
    if (!fs.existsSync(this.cfg.usageLog)) return [];
    return fs
      .readFileSync(this.cfg.usageLog, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as UsageRecord);
  }

  computeSummary(records: UsageRecord[]): UsageSummary {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalImages = 0;
    const byOp: Record<DesignerOp, number> = { generate: 0, edit: 0 };

    for (const r of records) {
      totalInputTokens += r.inputTokens;
      totalOutputTokens += r.outputTokens;
      totalImages += r.imageCount;
      byOp[r.op] = (byOp[r.op] ?? 0) + 1;
    }

    const estimatedCostUsd =
      (totalInputTokens / 1_000_000) * PRICE_INPUT_PER_M +
      (totalOutputTokens / 1_000_000) * PRICE_OUTPUT_PER_M +
      totalImages * PRICE_PER_IMAGE;

    return {
      totalCalls: records.length,
      totalInputTokens,
      totalOutputTokens,
      totalImages,
      estimatedCostUsd,
      byOp,
      firstCallAt: records[0]?.ts,
      lastCallAt: records[records.length - 1]?.ts,
    };
  }
}
