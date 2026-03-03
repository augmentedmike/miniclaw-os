/**
 * store.test.ts — unit tests for DesignerStore
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DesignerStore } from "./store.js";
import type { DesignerConfig } from "./config.js";
import type { Canvas, Layer, UsageRecord } from "./types.js";

let tmpDir: string;
let cfg: DesignerConfig;
let store: DesignerStore;

function makeCfg(base: string): DesignerConfig {
  return {
    apiKey: "test-key",
    model: "gemini-3.1-flash-image-preview",
    mediaDir: base,
    defaultWidth: 1024,
    defaultHeight: 1024,
    canvasDir: path.join(base, "canvases"),
    layersDir: path.join(base, "layers"),
    outputDir: path.join(base, "output"),
    usageLog: path.join(base, "usage.jsonl"),
  };
}

function makeLayer(overrides: Partial<Layer> = {}): Layer {
  return {
    id: `layer-${Math.random().toString(36).slice(2, 9)}`,
    name: "base",
    z: 0,
    imagePath: "/tmp/fake.png",
    opacity: 100,
    visible: true,
    x: 0,
    y: 0,
    blendMode: "normal",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeUsageRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    ts: new Date().toISOString(),
    op: "generate",
    model: "gemini-3.1-flash-image-preview",
    prompt: "a test prompt",
    inputTokens: 100,
    outputTokens: 200,
    imageCount: 1,
    durationMs: 500,
    ...overrides,
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-designer-test-"));
  cfg = makeCfg(tmpDir);
  store = new DesignerStore(cfg);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("createCanvas", () => {
  it("creates a canvas with correct fields", () => {
    const canvas = store.createCanvas("my-canvas", 800, 600);
    expect(canvas.name).toBe("my-canvas");
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
    expect(canvas.layers).toEqual([]);
    expect(typeof canvas.id).toBe("string");
    expect(canvas.id.startsWith("canvas-")).toBe(true);
    expect(typeof canvas.createdAt).toBe("string");
    expect(typeof canvas.updatedAt).toBe("string");
  });

  it("persists canvas to disk", () => {
    store.createCanvas("persisted", 1024, 1024);
    const filePath = path.join(cfg.canvasDir, "persisted.json");
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("creates valid JSON that can be read back", () => {
    store.createCanvas("json-test", 512, 512);
    const filePath = path.join(cfg.canvasDir, "json-test.json");
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Canvas;
    expect(parsed.name).toBe("json-test");
    expect(parsed.width).toBe(512);
  });
});

describe("listCanvases", () => {
  it("returns empty array when no canvases exist", () => {
    expect(store.listCanvases()).toEqual([]);
  });

  it("returns canvas names after creating canvases", () => {
    store.createCanvas("canvas-a", 100, 100);
    store.createCanvas("canvas-b", 200, 200);
    const names = store.listCanvases();
    expect(names.sort()).toEqual(["canvas-a", "canvas-b"].sort());
  });

  it("returns names without .json extension", () => {
    store.createCanvas("alpha", 100, 100);
    const names = store.listCanvases();
    expect(names[0]).not.toContain(".json");
  });
});

describe("loadCanvas", () => {
  it("returns null for a missing canvas", () => {
    expect(store.loadCanvas("nonexistent")).toBeNull();
  });

  it("returns the correct canvas for an existing one", () => {
    store.createCanvas("load-test", 300, 400);
    const loaded = store.loadCanvas("load-test");
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("load-test");
    expect(loaded!.width).toBe(300);
    expect(loaded!.height).toBe(400);
  });

  it("preserves layers when loading back", () => {
    const canvas = store.createCanvas("with-layers", 100, 100);
    const layer = makeLayer({ name: "bg", z: 0 });
    store.addLayer(canvas, layer);

    const loaded = store.loadCanvas("with-layers");
    expect(loaded!.layers).toHaveLength(1);
    expect(loaded!.layers[0].name).toBe("bg");
  });
});

describe("deleteCanvas", () => {
  it("removes the canvas file and returns true", () => {
    store.createCanvas("to-delete", 100, 100);
    const result = store.deleteCanvas("to-delete");
    expect(result).toBe(true);
    expect(store.loadCanvas("to-delete")).toBeNull();
  });

  it("returns false when the canvas does not exist", () => {
    expect(store.deleteCanvas("ghost")).toBe(false);
  });

  it("removes the canvas from listCanvases", () => {
    store.createCanvas("del-me", 100, 100);
    store.deleteCanvas("del-me");
    expect(store.listCanvases()).not.toContain("del-me");
  });
});

describe("nextZ", () => {
  it("returns 0 for an empty canvas", () => {
    const canvas = store.createCanvas("empty-z", 100, 100);
    expect(store.nextZ(canvas)).toBe(0);
  });

  it("returns max z + 1 for a canvas with layers", () => {
    const canvas = store.createCanvas("z-test", 100, 100);
    store.addLayer(canvas, makeLayer({ z: 0, name: "layer0" }));
    store.addLayer(canvas, makeLayer({ z: 3, name: "layer3" }));
    store.addLayer(canvas, makeLayer({ z: 1, name: "layer1" }));
    expect(store.nextZ(canvas)).toBe(4);
  });

  it("returns 1 for a canvas with a single layer at z=0", () => {
    const canvas = store.createCanvas("one-layer", 100, 100);
    store.addLayer(canvas, makeLayer({ z: 0, name: "only" }));
    expect(store.nextZ(canvas)).toBe(1);
  });
});

describe("findLayer", () => {
  it("finds a layer by name", () => {
    const canvas = store.createCanvas("find-name", 100, 100);
    const layer = makeLayer({ name: "sky", z: 0 });
    store.addLayer(canvas, layer);

    const found = store.findLayer(canvas, "sky");
    expect(found).not.toBeNull();
    expect(found!.name).toBe("sky");
  });

  it("finds a layer by id", () => {
    const canvas = store.createCanvas("find-id", 100, 100);
    const layer = makeLayer({ id: "layer-specific-id", name: "ground", z: 0 });
    store.addLayer(canvas, layer);

    const found = store.findLayer(canvas, "layer-specific-id");
    expect(found).not.toBeNull();
    expect(found!.id).toBe("layer-specific-id");
  });

  it("returns null for missing name or id", () => {
    const canvas = store.createCanvas("find-missing", 100, 100);
    store.addLayer(canvas, makeLayer({ name: "exists", z: 0 }));

    expect(store.findLayer(canvas, "does-not-exist")).toBeNull();
  });
});

describe("addLayer", () => {
  it("appends a layer to the canvas", () => {
    const canvas = store.createCanvas("add-layer", 100, 100);
    const layer = makeLayer({ name: "new-layer", z: 0 });
    store.addLayer(canvas, layer);
    expect(canvas.layers).toHaveLength(1);
    expect(canvas.layers[0].name).toBe("new-layer");
  });

  it("sorts layers by z after adding", () => {
    const canvas = store.createCanvas("sorted", 100, 100);
    store.addLayer(canvas, makeLayer({ z: 5, name: "top" }));
    store.addLayer(canvas, makeLayer({ z: 0, name: "bottom" }));
    store.addLayer(canvas, makeLayer({ z: 2, name: "middle" }));

    expect(canvas.layers[0].z).toBe(0);
    expect(canvas.layers[1].z).toBe(2);
    expect(canvas.layers[2].z).toBe(5);
  });

  it("persists the updated canvas to disk", () => {
    const canvas = store.createCanvas("persist-layer", 100, 100);
    store.addLayer(canvas, makeLayer({ name: "saved", z: 0 }));

    const loaded = store.loadCanvas("persist-layer");
    expect(loaded!.layers).toHaveLength(1);
    expect(loaded!.layers[0].name).toBe("saved");
  });
});

describe("removeLayer", () => {
  it("removes a layer by name and returns true", () => {
    const canvas = store.createCanvas("remove-name", 100, 100);
    store.addLayer(canvas, makeLayer({ name: "removeme", z: 0 }));
    const result = store.removeLayer(canvas, "removeme");
    expect(result).toBe(true);
    expect(canvas.layers).toHaveLength(0);
  });

  it("removes a layer by id and returns true", () => {
    const canvas = store.createCanvas("remove-id", 100, 100);
    const layer = makeLayer({ id: "target-id", name: "target", z: 0 });
    store.addLayer(canvas, layer);
    const result = store.removeLayer(canvas, "target-id");
    expect(result).toBe(true);
    expect(canvas.layers).toHaveLength(0);
  });

  it("returns false for a missing name or id", () => {
    const canvas = store.createCanvas("remove-missing", 100, 100);
    expect(store.removeLayer(canvas, "nonexistent")).toBe(false);
  });

  it("persists the canvas after removal", () => {
    const canvas = store.createCanvas("persist-remove", 100, 100);
    store.addLayer(canvas, makeLayer({ name: "layer-a", z: 0 }));
    store.addLayer(canvas, makeLayer({ name: "layer-b", z: 1 }));
    store.removeLayer(canvas, "layer-a");

    const loaded = store.loadCanvas("persist-remove");
    expect(loaded!.layers).toHaveLength(1);
    expect(loaded!.layers[0].name).toBe("layer-b");
  });
});

describe("computeSummary", () => {
  it("returns zeroed summary for empty records", () => {
    const summary = store.computeSummary([]);
    expect(summary.totalCalls).toBe(0);
    expect(summary.totalInputTokens).toBe(0);
    expect(summary.totalOutputTokens).toBe(0);
    expect(summary.totalImages).toBe(0);
    expect(summary.estimatedCostUsd).toBe(0);
    expect(summary.byOp).toEqual({ generate: 0, edit: 0 });
  });

  it("correctly sums tokens across multiple records", () => {
    const records: UsageRecord[] = [
      makeUsageRecord({ inputTokens: 1000, outputTokens: 500, imageCount: 1, op: "generate" }),
      makeUsageRecord({ inputTokens: 2000, outputTokens: 800, imageCount: 2, op: "edit" }),
    ];
    const summary = store.computeSummary(records);
    expect(summary.totalInputTokens).toBe(3000);
    expect(summary.totalOutputTokens).toBe(1300);
    expect(summary.totalImages).toBe(3);
    expect(summary.totalCalls).toBe(2);
  });

  it("counts calls by op correctly", () => {
    const records: UsageRecord[] = [
      makeUsageRecord({ op: "generate" }),
      makeUsageRecord({ op: "generate" }),
      makeUsageRecord({ op: "edit" }),
    ];
    const summary = store.computeSummary(records);
    expect(summary.byOp.generate).toBe(2);
    expect(summary.byOp.edit).toBe(1);
  });

  it("calculates estimated cost using correct pricing", () => {
    // Input: $0.075/1M tokens, Output: $0.30/1M tokens, Image: $0.04 each
    const records: UsageRecord[] = [
      makeUsageRecord({
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        imageCount: 1,
        op: "generate",
      }),
    ];
    const summary = store.computeSummary(records);
    // 1M input * 0.075 + 1M output * 0.30 + 1 image * 0.04
    const expected = 0.075 + 0.30 + 0.04;
    expect(summary.estimatedCostUsd).toBeCloseTo(expected, 6);
  });

  it("sets firstCallAt and lastCallAt from record timestamps", () => {
    const ts1 = "2026-03-01T00:00:00.000Z";
    const ts2 = "2026-03-02T00:00:00.000Z";
    const records: UsageRecord[] = [
      makeUsageRecord({ ts: ts1 }),
      makeUsageRecord({ ts: ts2 }),
    ];
    const summary = store.computeSummary(records);
    expect(summary.firstCallAt).toBe(ts1);
    expect(summary.lastCallAt).toBe(ts2);
  });

  it("firstCallAt and lastCallAt are undefined for empty records", () => {
    const summary = store.computeSummary([]);
    expect(summary.firstCallAt).toBeUndefined();
    expect(summary.lastCallAt).toBeUndefined();
  });
});
