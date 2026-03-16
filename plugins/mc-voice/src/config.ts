import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import { execFileSync } from "node:child_process";

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
 *   2. whisper-cli in PATH (e.g. installed via Homebrew)
 *   3. whisper-cpp in PATH
 * Returns the first binary that can be executed, or the bundled path as fallback.
 */
function resolveWhisperBin(bundledBin: string): string {
  // Test if a binary is functional by running --version or --help
  const testBin = (bin: string): boolean => {
    if (!fs.existsSync(bin) && !bin.includes("/")) {
      // For PATH lookups, skip existence check
    } else if (!fs.existsSync(bin)) {
      return false;
    }
    try {
      execFileSync(bin, ["--help"], { timeout: 5000, stdio: "pipe" });
      return true;
    } catch {
      // exit code 1 with output is still "working"
      try {
        execFileSync(bin, ["--version"], { timeout: 5000, stdio: "pipe" });
        return true;
      } catch (e: unknown) {
        // If it fails with a real error (not just non-zero exit), check stderr
        const err = e as { stderr?: Buffer; status?: number };
        // dyld failures produce no useful stderr content — treat as broken
        if (err.stderr && err.stderr.length > 10) return true;
        return false;
      }
    }
  };

  const candidates = [
    bundledBin,
    "/opt/homebrew/bin/whisper-cli",
    "/usr/local/bin/whisper-cli",
    "/opt/homebrew/bin/whisper-cpp",
    "/usr/local/bin/whisper-cpp",
  ];

  for (const candidate of candidates) {
    if (testBin(candidate)) return candidate;
  }

  // No working binary found — return bundled path and let runtime surface the error
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
