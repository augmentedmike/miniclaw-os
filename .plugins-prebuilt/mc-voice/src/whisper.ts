import { execFileSync, execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as https from "node:https";
import type { VoiceConfig, WhisperModel } from "./config.js";

const MODEL_URLS: Record<WhisperModel, string> = {
  tiny: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
  base: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
  small: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
  medium: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin",
  large: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large.bin",
};

function modelFileName(model: WhisperModel): string {
  return model === "large" ? "ggml-large.bin" : `ggml-${model}.en.bin`;
}

export function modelPath(cfg: VoiceConfig, model?: WhisperModel): string {
  return path.join(cfg.modelsDir, modelFileName(model ?? cfg.model));
}

export function modelExists(cfg: VoiceConfig, model?: WhisperModel): boolean {
  return fs.existsSync(modelPath(cfg, model));
}

function followRedirects(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = (u: string) => {
      https.get(u, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
        file.on("error", reject);
      }).on("error", reject);
    };
    request(url);
  });
}

export async function downloadModel(cfg: VoiceConfig, model?: WhisperModel): Promise<string> {
  const m = model ?? cfg.model;
  const dest = modelPath(cfg, m);

  if (fs.existsSync(dest)) return dest;

  fs.mkdirSync(cfg.modelsDir, { recursive: true });

  const url = MODEL_URLS[m];
  const tmp = dest + ".tmp";
  console.log(`Downloading whisper model ${m} ...`);
  await followRedirects(url, tmp);
  fs.renameSync(tmp, dest);
  console.log(`Model saved: ${dest}`);
  return dest;
}

export interface TranscribeResult {
  text: string;
  file: string;
  model: WhisperModel;
}

export function transcribe(
  cfg: VoiceConfig,
  audioFile: string,
  opts?: { model?: WhisperModel; language?: string },
): TranscribeResult {
  const m = opts?.model ?? cfg.model;
  const lang = opts?.language ?? cfg.language;
  const mPath = modelPath(cfg, m);

  if (!fs.existsSync(mPath)) {
    throw new Error(`Model not found: ${mPath}\nRun: mc mc-voice download-model --model ${m}`);
  }

  if (!fs.existsSync(audioFile)) {
    throw new Error(`Audio file not found: ${audioFile}`);
  }

  // whisper.cpp main binary: expects 16kHz WAV input
  // Use sox to convert to 16kHz mono WAV if needed
  const wavFile = ensureWav16k(audioFile);

  const args = [
    "--model", mPath,
    "--language", lang,
    "--no-timestamps",
    "--file", wavFile,
  ];

  const result = execFileSync(cfg.whisperBin, args, {
    encoding: "utf-8",
    timeout: 300_000, // 5 min max
  });

  // Clean up temp wav if we created one
  if (wavFile !== audioFile && fs.existsSync(wavFile)) {
    fs.unlinkSync(wavFile);
  }

  const text = result.trim();
  return { text, file: audioFile, model: m };
}

function ensureWav16k(file: string): string {
  const ext = path.extname(file).toLowerCase();

  // If already a .wav, check if it needs conversion
  // Always convert to be safe — sox is fast
  const tmp = file + ".16k.wav";
  try {
    execFileSync("sox", [file, "-r", "16000", "-c", "1", "-b", "16", tmp], {
      encoding: "utf-8",
      timeout: 60_000,
    });
    return tmp;
  } catch {
    // If sox fails, assume the file is already correct format
    return file;
  }
}
