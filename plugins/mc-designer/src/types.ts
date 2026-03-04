// ---- Layer + Canvas types ----

export type BlendMode = "normal" | "multiply" | "screen" | "overlay";

/**
 * background — fills the canvas edge to edge (cover fit, placed at 0,0)
 * element    — sized to its natural dimensions, placed at x,y
 */
export type LayerRole = "background" | "element";

export interface Layer {
  id: string;
  name: string;
  /** Higher z = rendered on top */
  z: number;
  /** Absolute path to the PNG file for this layer */
  imagePath: string;
  /** 0–100 */
  opacity: number;
  visible: boolean;
  /** Pixel offset from canvas origin */
  x: number;
  y: number;
  blendMode: BlendMode;
  /**
   * background = fills canvas (cover). element = natural size at x,y.
   * Defaults to "background" for z=0, "element" for all others.
   */
  role: LayerRole;
  /**
   * For element layers: target render size in pixels at composite time.
   * If unset, uses the image's natural size.
   */
  renderWidth?: number;
  renderHeight?: number;
  /** Original generation prompt, if this layer was AI-generated */
  prompt?: string;
  createdAt: string;
}

export interface Canvas {
  id: string;
  name: string;
  width: number;
  height: number;
  /** Canvas background color shown in preview and under all layers. Hex, e.g. "#18181b". Default: "#18181b" (zinc-900). */
  background: string;
  /** Optional seed passed to Gemini generationConfig for reproducible outputs. */
  seed?: number;
  /** Optional style directive prepended to every gen/edit prompt on this canvas. */
  style?: string;
  layers: Layer[];
  createdAt: string;
  updatedAt: string;
}

// ---- Usage / stats types ----

export type DesignerOp = "generate" | "edit";

export interface UsageRecord {
  ts: string;
  op: DesignerOp;
  model: string;
  prompt: string;
  inputTokens: number;
  outputTokens: number;
  /** Number of images returned by this call */
  imageCount: number;
  durationMs: number;
  canvasName?: string;
  layerName?: string;
}

export interface UsageSummary {
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalImages: number;
  estimatedCostUsd: number;
  byOp: Record<DesignerOp, number>;
  firstCallAt?: string;
  lastCallAt?: string;
}
