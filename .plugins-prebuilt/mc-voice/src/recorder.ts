import { spawn, execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { VoiceConfig } from "./config.js";

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
}

export function ensureSox(): void {
  try {
    execFileSync("sox", ["--version"], { encoding: "utf-8" });
  } catch {
    throw new Error("sox not found. Install with: brew install sox");
  }
}

/**
 * Record audio from the default microphone using sox.
 * Returns the path to the recorded WAV file.
 */
export function record(
  cfg: VoiceConfig,
  opts?: { duration?: number; outputFile?: string },
): string {
  ensureSox();

  fs.mkdirSync(cfg.recordingsDir, { recursive: true });

  const outFile = opts?.outputFile
    ?? path.join(cfg.recordingsDir, `recording-${timestamp()}.wav`);

  const args = [
    "-d",                  // default audio device
    "-r", "16000",         // 16kHz sample rate (whisper.cpp expects this)
    "-c", "1",             // mono
    "-b", "16",            // 16-bit
    outFile,
  ];

  if (opts?.duration) {
    args.push("trim", "0", String(opts.duration));
  }

  console.log(`Recording to ${outFile} ...`);
  console.log("Press Ctrl+C to stop recording.\n");

  // Run rec (sox's recording alias) synchronously
  try {
    execFileSync("rec", args, {
      stdio: "inherit",
      timeout: opts?.duration ? (opts.duration + 5) * 1000 : 600_000, // 10 min max
    });
  } catch (err: any) {
    // Ctrl+C triggers SIGINT which throws — that's the normal stop signal
    if (err.status === null || err.signal === "SIGINT") {
      // Normal termination via Ctrl+C
    } else {
      throw err;
    }
  }

  if (!fs.existsSync(outFile)) {
    throw new Error("Recording failed — no output file created.");
  }

  const stat = fs.statSync(outFile);
  const durationSec = Math.round((stat.size - 44) / (16000 * 2)); // rough WAV duration
  console.log(`\nRecorded: ${outFile} (~${durationSec}s)`);
  return outFile;
}
