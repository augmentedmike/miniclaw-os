/**
 * mc-voice — Agent tool definitions
 *
 * Gives the agent the ability to transcribe audio files using whisper.cpp.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { Logger } from "pino";
import type { VoiceConfig, WhisperModel } from "../src/config.js";

function schema(props: Record<string, unknown>, required?: string[]): unknown {
  return {
    type: "object",
    properties: props,
    required: required ?? [],
    additionalProperties: false,
  };
}

function str(description: string): unknown {
  return { type: "string", description };
}

function optStr(description: string): unknown {
  return { type: "string", description };
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text: text.trim() }], details: {} };
}

function toolErr(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    isError: true,
    details: {},
  };
}

function ensureWav16k(file: string): string {
  const tmp = file + ".16k.wav";
  try {
    execFileSync("sox", [file, "-r", "16000", "-c", "1", "-b", "16", tmp], {
      encoding: "utf-8",
      timeout: 60_000,
    });
    return tmp;
  } catch {
    return file;
  }
}

export function createVoiceTools(cfg: VoiceConfig, logger: Logger): AnyAgentTool[] {
  return [
    {
      name: "voice_transcribe",
      label: "Voice Transcribe",
      description:
        "Transcribe an audio file to text using whisper.cpp (local, offline). " +
        "Accepts any audio format — WAV, MP3, M4A, OGG, FLAC, etc. " +
        "Returns the transcribed text. Use this to read voice messages, " +
        "audio notes, or any spoken content the user sends.",
      parameters: schema(
        {
          file: str("Absolute path to the audio file"),
          model: optStr("Whisper model: tiny, base (default), small, medium, large"),
        },
        ["file"],
      ) as never,
      execute: async (_toolCallId: string, input: { file: string; model?: WhisperModel }) => {
        logger.debug(`mc-voice/tool voice_transcribe: file=${input.file}`);
        try {
          const audioFile = input.file;
          if (!fs.existsSync(audioFile)) {
            return toolErr(`Audio file not found: ${audioFile}`);
          }

          const model = input.model ?? cfg.model;
          const modelFile = model === "large"
            ? path.join(cfg.modelsDir, "ggml-large.bin")
            : path.join(cfg.modelsDir, `ggml-${model}.en.bin`);

          if (!fs.existsSync(modelFile)) {
            return toolErr(`Model not found: ${modelFile}\nRun: mc mc-voice download-model --model ${model}`);
          }

          const wavFile = ensureWav16k(audioFile);

          const result = execFileSync(cfg.whisperBin, [
            "--model", modelFile,
            "--language", cfg.language,
            "--no-timestamps",
            "--file", wavFile,
          ], {
            encoding: "utf-8",
            timeout: 300_000,
          });

          // Clean up temp wav
          if (wavFile !== audioFile && fs.existsSync(wavFile)) {
            fs.unlinkSync(wavFile);
          }

          const text = result.trim();
          if (!text) return ok("(no speech detected)");
          return ok(text);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-voice/tool voice_transcribe error: ${msg}`);
          return toolErr(`voice_transcribe failed: ${msg}`);
        }
      },
    },

    {
      name: "voice_record",
      label: "Voice Record",
      description:
        "Record audio from the system microphone using sox. " +
        "Returns the path to the recorded WAV file (16kHz mono). " +
        "Requires a duration — the recording stops automatically after the specified seconds.",
      parameters: schema(
        {
          duration: str("Recording duration in seconds (required)"),
        },
        ["duration"],
      ) as never,
      execute: async (_toolCallId: string, input: { duration: string }) => {
        logger.debug(`mc-voice/tool voice_record: duration=${input.duration}`);
        try {
          fs.mkdirSync(cfg.recordingsDir, { recursive: true });

          const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
          const outFile = path.join(cfg.recordingsDir, `recording-${ts}.wav`);

          execFileSync("rec", [
            "-d",
            "-r", "16000",
            "-c", "1",
            "-b", "16",
            outFile,
            "trim", "0", input.duration,
          ], {
            encoding: "utf-8",
            timeout: (parseInt(input.duration, 10) + 10) * 1000,
          });

          if (!fs.existsSync(outFile)) {
            return toolErr("Recording failed — no output file created.");
          }

          return ok(`Recorded: ${outFile}`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-voice/tool voice_record error: ${msg}`);
          return toolErr(`voice_record failed: ${msg}`);
        }
      },
    },
  ];
}
