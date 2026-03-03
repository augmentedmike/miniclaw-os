// ---- Layer + Canvas types ----

export type BlendMode = "normal" | "multiply" | "screen" | "overlay";

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
  /** Original generation prompt, if this layer was AI-generated */
  prompt?: string;
  createdAt: string;
}

export interface Canvas {
  id: string;
  name: string;
  width: number;
  height: number;
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
