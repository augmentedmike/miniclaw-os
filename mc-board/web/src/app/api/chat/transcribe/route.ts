import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";

export const dynamic = "force-dynamic";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
const VOICE_DIR = path.join(STATE_DIR, "miniclaw", "USER", "voice");
const MODELS_DIR = path.join(STATE_DIR, "miniclaw", "SYSTEM", "whisper-models");

type WhisperModel = "tiny" | "base" | "small" | "medium" | "large";

function resolveWhisperBin(): string | null {
  const bundled = path.join(STATE_DIR, "miniclaw", "SYSTEM", "bin", "whisper-cpp");
  const candidates = [
    bundled,
    "/opt/homebrew/bin/whisper-cli",
    "/usr/local/bin/whisper-cli",
    "/opt/homebrew/bin/whisper-cpp",
    "/usr/local/bin/whisper-cpp",
    "/opt/homebrew/bin/whisper",
    "/usr/local/bin/whisper",
  ];

  for (const bin of candidates) {
    if (!fs.existsSync(bin)) continue;
    const result = spawnSync(bin, ["--help"], { timeout: 5000, encoding: "utf8" });
    if (result.signal !== null) continue;
    const stderr = result.stderr ?? "";
    if (stderr.includes("Library not loaded") || stderr.includes("dyld[")) continue;
    return bin;
  }
  return null;
}

function hasSox(): boolean {
  try {
    execFileSync("which", ["sox"], { encoding: "utf-8", timeout: 5000 });
    return true;
  } catch { /* sox-not-found */
    return false;
  }
}

function modelPath(model: WhisperModel): string {
  const fname = model === "large" ? "ggml-large.bin" : `ggml-${model}.en.bin`;
  return path.join(MODELS_DIR, fname);
}

function ensureWav16k(file: string): string {
  const tmp = file + ".16k.wav";
  try {
    execFileSync("sox", [file, "-r", "16000", "-c", "1", "-b", "16", tmp], {
      encoding: "utf-8",
      timeout: 60_000,
    });
    return tmp;
  } catch { /* sox-conversion-failed — fall back to original file */
    return file;
  }
}

/** GET /api/chat/transcribe — check if transcription is available */
export async function GET() {
  const whisperBin = resolveWhisperBin();
  const sox = hasSox();
  const model: WhisperModel = "base";
  const hasModel = fs.existsSync(modelPath(model));

  return NextResponse.json({
    available: whisperBin !== null && sox && hasModel,
    details: {
      whisper: whisperBin !== null,
      sox,
      model: hasModel,
    },
  });
}

/** POST /api/chat/transcribe — accept audio blob, return transcribed text */
export async function POST(req: NextRequest) {
  const whisperBin = resolveWhisperBin();
  if (!whisperBin) {
    return NextResponse.json({ error: "whisper.cpp binary not available" }, { status: 503 });
  }
  if (!hasSox()) {
    return NextResponse.json({ error: "sox not available for audio conversion" }, { status: 503 });
  }

  const model: WhisperModel = "base";
  const mPath = modelPath(model);
  if (!fs.existsSync(mPath)) {
    return NextResponse.json({ error: `Whisper model not found: ${model}` }, { status: 503 });
  }

  try {
    // Accept audio as raw body or form data
    let audioBuffer: Buffer;
    let mimeType = "audio/webm";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("audio") as File | null;
      if (!file) {
        return NextResponse.json({ error: "audio field required" }, { status: 400 });
      }
      mimeType = file.type || "audio/webm";
      audioBuffer = Buffer.from(await file.arrayBuffer());
    } else {
      audioBuffer = Buffer.from(await req.arrayBuffer());
      mimeType = contentType.split(";")[0] || "audio/webm";
    }

    if (audioBuffer.length === 0) {
      return NextResponse.json({ error: "empty audio data" }, { status: 400 });
    }

    // 10MB max
    if (audioBuffer.length > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "audio too large (10MB max)" }, { status: 400 });
    }

    // Determine extension from mime type
    const extMap: Record<string, string> = {
      "audio/webm": ".webm",
      "audio/ogg": ".ogg",
      "audio/mp4": ".mp4",
      "audio/mpeg": ".mp3",
      "audio/wav": ".wav",
      "audio/x-wav": ".wav",
      "audio/aac": ".aac",
    };
    const ext = extMap[mimeType] || ".webm";

    // Write to temp file
    fs.mkdirSync(VOICE_DIR, { recursive: true });
    const tmpName = `transcribe-${crypto.randomUUID()}${ext}`;
    const tmpPath = path.join(VOICE_DIR, tmpName);
    fs.writeFileSync(tmpPath, audioBuffer);

    try {
      // Convert to 16kHz mono WAV
      const wavFile = ensureWav16k(tmpPath);

      // Run whisper
      const args = [
        "--model", mPath,
        "--language", "en",
        "--no-timestamps",
        "--file", wavFile,
      ];

      const result = execFileSync(whisperBin, args, {
        encoding: "utf-8",
        timeout: 120_000, // 2 min max
      });

      // Clean up
      if (wavFile !== tmpPath && fs.existsSync(wavFile)) fs.unlinkSync(wavFile);
      fs.unlinkSync(tmpPath);

      const text = result.trim();
      return NextResponse.json({ text });
    } catch (err: unknown) {
      // Clean up on error
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `Transcription failed: ${msg}` }, { status: 500 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Request processing failed: ${msg}` }, { status: 500 });
  }
}
