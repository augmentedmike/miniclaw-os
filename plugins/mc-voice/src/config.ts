import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

export type WhisperModel = "tiny" | "base" | "small" | "medium" | "large";

export interface VoiceConfig {
  model: WhisperModel;
  language: string;
  whisperBin: string;
  modelsDir: string;
  recordingsDir: string;
}

const VALID_MODELS: WhisperModel[] = ["tiny", "base", "small", "medium", "large"];

/**
 * Resolve a working whisper binary.
 * Priority:
 *   1. Bundled whisper-cpp (SYSTEM/bin/whisper-cpp) — if it loads successfully
 *   2. /opt/homebrew/bin/whisper-cli (Homebrew on macOS ARM/Intel)
 *   3. /usr/local/bin/whisper-cli
 *   4. whisper-cpp variants in common locations
 * Returns the first binary that actually loads, or the bundled path as fallback.
 */
function resolveWhisperBin(bundledBin: string): string {
  /**
   * Returns true if the binary exists and can be loaded by dyld.
   * We use spawnSync so we can check the signal — dyld failures kill the
   * process with a signal (SIGABRT/SIGKILL) before producing any meaningful
   * output, whereas a working binary exits non-zero but stays alive.
   */
  const canLoad = (bin: string): boolean => {
    if (!fs.existsSync(bin)) return false;
    const result = spawnSync(bin, ["--help"], { timeout: 5000, encoding: "utf8" });
    // dyld failures: process killed by signal or status null
    if (result.signal !== null) return false;
    // dyld stderr contains "Library not loaded" or "dyld"
    const stderr = result.stderr ?? "";
    if (stderr.includes("Library not loaded") || stderr.includes("dyld[")) return false;
    return true;
  };

  const candidates = [
    bundledBin,
    "/opt/homebrew/bin/whisper-cli",
    "/usr/local/bin/whisper-cli",
    "/opt/homebrew/bin/whisper-cpp",
    "/usr/local/bin/whisper-cpp",
  ];

  for (const candidate of candidates) {
    if (canLoad(candidate)) return candidate;
  }

  // No working binary found — return bundled path so runtime surfaces a clear error
  return bundledBin;
}

export function resolveConfig(raw: Record<string, unknown>): VoiceConfig {
  const model = VALID_MODELS.includes(raw.model as WhisperModel)
    ? (raw.model as WhisperModel)
    : "base";

  const miniclaw = path.join(STATE_DIR, "miniclaw");
  const bundledBin = path.join(miniclaw, "SYSTEM", "bin", "whisper-cpp");

  return {
    model,
    language: (raw.language as string) || "en",
    whisperBin: resolveWhisperBin(bundledBin),
    modelsDir: path.join(miniclaw, "SYSTEM", "whisper-models"),
    recordingsDir: path.join(miniclaw, "USER", "voice"),
  };
}
