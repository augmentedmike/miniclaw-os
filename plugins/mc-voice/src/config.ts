import * as path from "node:path";
import * as os from "node:os";

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

export function resolveConfig(raw: Record<string, unknown>): VoiceConfig {
  const model = VALID_MODELS.includes(raw.model as WhisperModel)
    ? (raw.model as WhisperModel)
    : "base";

  const miniclaw = path.join(STATE_DIR, "miniclaw");

  return {
    model,
    language: (raw.language as string) || "en",
    whisperBin: path.join(miniclaw, "SYSTEM", "bin", "whisper-cpp"),
    modelsDir: path.join(miniclaw, "SYSTEM", "whisper-models"),
    recordingsDir: path.join(miniclaw, "USER", "voice"),
  };
}
