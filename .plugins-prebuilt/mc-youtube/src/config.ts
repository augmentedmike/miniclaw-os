import * as fs from "node:fs";
import * as path from "node:path";

export interface YoutubeConfig {
  mediaDir: string;
  maxKeyPoints: number;
  claudeBin: string;
  screenshotWidth: number;
  screenshotQuality: number; // ffmpeg JPEG q:v — 1=best, 5=very good, 31=worst
  keyframeIntervalSeconds: number; // dense keyframe extraction interval (0 = disabled)
}

/** Resolve the default user media dir: $STATE/USER/<first-user>/media/<plugin> */
function defaultMediaDir(stateDir: string, plugin: string): string {
  const userDir = path.join(stateDir, "USER");
  try {
    const entries = fs.readdirSync(userDir, { withFileTypes: true });
    const first = entries.find((e) => e.isDirectory());
    if (first) return path.join(userDir, first.name, "media", plugin);
  } catch { /* user dir doesn't exist yet */ }
  return path.join(stateDir, "media", plugin);
}

export function resolveConfig(raw: Record<string, unknown>): YoutubeConfig {
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? `${process.env.HOME}/.openclaw`;
  return {
    mediaDir:                (raw.mediaDir as string)                 || defaultMediaDir(stateDir, "youtube"),
    maxKeyPoints:            (raw.maxKeyPoints as number)              || 12,
    claudeBin:               (raw.claudeBin as string)                || `${process.env.HOME}/.local/bin/claude`,
    screenshotWidth:         (raw.screenshotWidth as number)          || 1280,
    screenshotQuality:       (raw.screenshotQuality as number)        || 3,
    keyframeIntervalSeconds: (raw.keyframeIntervalSeconds as number)  ?? 5,
  };
}
