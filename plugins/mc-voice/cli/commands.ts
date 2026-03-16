import type { Command } from "commander";
import type { Logger } from "openclaw/plugin-sdk";
import type { VoiceConfig, WhisperModel } from "../src/config.js";
import { transcribe, downloadModel, modelExists, modelPath } from "../src/whisper.js";
import { record, ensureSox } from "../src/recorder.js";

interface Ctx {
  program: Command;
  cfg: VoiceConfig;
  logger: Logger;
}

export function registerVoiceCommands(ctx: Ctx): void {
  const { program, cfg } = ctx;

  const sub = program
    .command("mc-voice")
    .description("Local speech-to-text via whisper.cpp");

  // ---- transcribe ----
  sub
    .command("transcribe <file>")
    .description("Transcribe an audio file to text using whisper.cpp")
    .option("-m, --model <model>", "Whisper model (tiny|base|small|medium|large)", cfg.model)
    .option("-l, --language <lang>", "Language code", cfg.language)
    .action((file: string, opts: { model: WhisperModel; language: string }) => {
      const result = transcribe(cfg, file, { model: opts.model, language: opts.language });
      console.log(result.text);
    });

  // ---- record ----
  sub
    .command("record")
    .description("Record audio from microphone (16kHz mono WAV)")
    .option("-d, --duration <seconds>", "Max recording duration in seconds")
    .option("-o, --output <file>", "Output file path")
    .action((opts: { duration?: string; output?: string }) => {
      const outFile = record(cfg, {
        duration: opts.duration ? parseInt(opts.duration, 10) : undefined,
        outputFile: opts.output,
      });
      console.log(outFile);
    });

  // ---- dictate (record + transcribe) ----
  sub
    .command("dictate")
    .description("Record from microphone then transcribe (press Ctrl+C to stop recording)")
    .option("-m, --model <model>", "Whisper model", cfg.model)
    .option("-l, --language <lang>", "Language code", cfg.language)
    .option("-d, --duration <seconds>", "Max recording duration in seconds")
    .action((opts: { model: WhisperModel; language: string; duration?: string }) => {
      const audioFile = record(cfg, {
        duration: opts.duration ? parseInt(opts.duration, 10) : undefined,
      });
      console.log("\nTranscribing...\n");
      const result = transcribe(cfg, audioFile, { model: opts.model, language: opts.language });
      console.log(result.text);
    });

  // ---- download-model ----
  sub
    .command("download-model")
    .description("Download a whisper.cpp model")
    .option("-m, --model <model>", "Model to download (tiny|base|small|medium|large)", cfg.model)
    .action(async (opts: { model: WhisperModel }) => {
      await downloadModel(cfg, opts.model);
    });

  // ---- status ----
  sub
    .command("status")
    .description("Check whisper.cpp and model availability")
    .action(() => {
      console.log(`whisper-cpp binary: ${cfg.whisperBin}`);
      try {
        const { execFileSync } = require("node:child_process");
        execFileSync(cfg.whisperBin, ["--help"], { encoding: "utf-8", timeout: 5000 });
        console.log("  Status: installed");
      } catch {
        console.log("  Status: NOT FOUND");
      }

      console.log(`\nModels directory: ${cfg.modelsDir}`);
      const models: WhisperModel[] = ["tiny", "base", "small", "medium", "large"];
      for (const m of models) {
        const exists = modelExists(cfg, m);
        const marker = exists ? "[✓]" : "[ ]";
        console.log(`  ${marker} ${m} → ${modelPath(cfg, m)}`);
      }

      console.log(`\nRecordings: ${cfg.recordingsDir}`);

      try {
        ensureSox();
        console.log("sox: installed");
      } catch {
        console.log("sox: NOT FOUND — run: brew install sox");
      }
    });
}
