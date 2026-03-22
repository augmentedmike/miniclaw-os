import * as fs from "node:fs";
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

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** Resolve the default user media dir: $STATE/miniclaw/USER/<first-user>/media/<plugin> */
function defaultMediaDir(stateDir: string, plugin: string): string {
  const userDir = path.join(stateDir, "miniclaw", "USER");
  try {
    const entries = fs.readdirSync(userDir, { withFileTypes: true });
    const first = entries.find((e) => e.isDirectory());
    if (first) return path.join(userDir, first.name, "media", plugin);
  } catch { /* user dir doesn't exist yet */ }
  return path.join(stateDir, "media", plugin);
}

export function resolveConfig(raw: Record<string, unknown>): DesignerConfig {
  const r = raw as Partial<DesignerConfig>;
  const apiKey = r.apiKey ?? "";
  const model = r.model ?? "gemini-3.1-flash-image-preview";
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? resolvePath("~/.openclaw");
  const mediaDir = resolvePath(r.mediaDir ?? defaultMediaDir(stateDir, "designer"));

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
    vaultBin: resolvePath(r.vaultBin ?? path.join(stateDir, "miniclaw", "SYSTEM", "bin", "mc-vault")),
  };
}
