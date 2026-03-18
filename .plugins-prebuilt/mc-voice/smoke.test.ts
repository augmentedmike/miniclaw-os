import { test, expect } from "vitest";
import register from "./index.js";
import { createVoiceTools } from "./tools/definitions.js";

test("register is a default-exported function", () => {
  expect(typeof register).toBe("function");
});

test("createVoiceTools returns an array of tools", () => {
  const cfg = {
    model: "base" as const,
    language: "en",
    whisperBin: "/tmp/whisper-cpp",
    modelsDir: "/tmp/whisper-models",
    recordingsDir: "/tmp/voice",
  };
  const tools = createVoiceTools(cfg, { info() {}, warn() {}, error() {}, debug() {} } as any);
  expect(Array.isArray(tools)).toBe(true);
  expect(tools.length).toBeGreaterThan(0);
  for (const t of tools) {
    expect(typeof t.name).toBe("string");
    expect(t.name).toMatch(/^voice_/);
  }
});
