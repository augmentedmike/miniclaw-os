import * as path from "node:path";
import * as os from "node:os";

export interface DesignerConfig {
  apiKey: string;
  model: string;
  mediaDir: string;
  defaultWidth: number;
  defaultHeight: number;
  canvasDir: string;
  layersDir: string;
  outputDir: string;
  usageLog: string;
  vaultBin: string;
}

export function resolveConfig(raw: Record<string, unknown>): DesignerConfig {
  const r = raw as Partial<DesignerConfig>;
  const apiKey = r.apiKey ?? "";
  const model = r.model ?? "gemini-3.1-flash-image-preview";
  const mediaDir = resolvePath(r.mediaDir ?? "~/.openclaw/media/designer");

  return {
    apiKey,
    model,
    mediaDir,
    defaultWidth: r.defaultWidth ?? 1024,
    defaultHeight: r.defaultHeight ?? 1024,
    canvasDir: path.join(mediaDir, "canvases"),
    layersDir: path.join(mediaDir, "layers"),
    outputDir: path.join(mediaDir, "output"),
    usageLog: path.join(mediaDir, "usage.jsonl"),
    vaultBin: resolvePath(r.vaultBin ?? "~/.local/bin/mc-vault"),
  };
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}
