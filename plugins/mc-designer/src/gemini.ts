import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import type { UsageRecord } from "./types.js";

interface GenerateResult {
  buffer: Buffer;
  mimeType: string;
  usage: Omit<UsageRecord, "ts" | "canvasName" | "layerName">;
}

const GEMINI_HOST = "https://generativelanguage.googleapis.com";

/** Call the Gemini REST API via curl (bypasses any Node.js fetch/https patches). */
function geminiRequest(apiKey: string, model: string, body: unknown): unknown {
  const payload = JSON.stringify(body);
  const url = `${GEMINI_HOST}/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const tmpFile = path.join(os.tmpdir(), `mc-designer-req-${Date.now()}.json`);
  fs.writeFileSync(tmpFile, payload);

  const result = spawnSync("curl", [
    "-s",
    "-X", "POST",
    "-H", "Content-Type: application/json",
    "-d", `@${tmpFile}`,
    url,
  ], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });

  fs.unlinkSync(tmpFile);

  if (result.error) throw result.error;
  if (!result.stdout) throw new Error("curl returned no output");

  const json = JSON.parse(result.stdout) as any;
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json;
}

export class GeminiClient {
  constructor(private apiKey: string, private model: string) {}

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  async generate(
    prompt: string,
    op: "generate" | "edit" = "generate",
    seed?: number,
    aspectRatio?: string,
  ): Promise<GenerateResult> {
    const t0 = Date.now();

    const genConfig: Record<string, unknown> = {};
    if (seed !== undefined) genConfig.seed = seed;
    if (aspectRatio) genConfig.imageConfig = { aspectRatio };

    const body: Record<string, unknown> = {
      contents: [{ parts: [{ text: prompt }] }],
      ...(Object.keys(genConfig).length > 0 ? { generationConfig: genConfig } : {}),
    };

    const response = geminiRequest(this.apiKey, this.model, body) as any;

    const durationMs = Date.now() - t0;
    const candidate = response.candidates?.[0];
    const usageMeta = response.usageMetadata;

    let imageData: string | null = null;
    let mimeType = "image/png";
    let imageCount = 0;

    for (const part of candidate?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        imageData = part.inlineData.data;
        mimeType = part.inlineData.mimeType ?? "image/png";
        imageCount++;
        break;
      }
    }

    if (!imageData) {
      throw new Error("Gemini returned no image data");
    }

    return {
      buffer: Buffer.from(imageData, "base64"),
      mimeType,
      usage: {
        op,
        model: this.model,
        prompt,
        inputTokens: usageMeta?.promptTokenCount ?? 0,
        outputTokens: usageMeta?.candidatesTokenCount ?? 0,
        imageCount,
        durationMs,
      },
    };
  }

  /** Send an image to Gemini and get back a text-only response (no image generated). */
  async inspect(imagePath: string, prompt: string): Promise<string> {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString("base64");

    const body: Record<string, unknown> = {
      contents: [{
        role: "user",
        parts: [
          { inlineData: { mimeType: "image/png", data: base64 } },
          { text: prompt },
        ],
      }],
      generationConfig: { responseModalities: ["TEXT"] },
    };

    const response = geminiRequest(this.apiKey, this.model, body) as any;

    const text = response.candidates?.[0]?.content?.parts
      ?.filter((p: any) => p.text)
      ?.map((p: any) => p.text as string)
      ?.join("\n") ?? "";

    if (!text) throw new Error("Gemini inspect returned no text");
    return text;
  }

  async edit(imagePath: string, instructions: string, seed?: number): Promise<GenerateResult> {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString("base64");
    const t0 = Date.now();

    const body: Record<string, unknown> = {
      contents: [{
        role: "user",
        parts: [
          { text: instructions },
          { inlineData: { mimeType: "image/png", data: base64 } },
        ],
      }],
      ...(seed !== undefined ? { generationConfig: { seed } } : {}),
    };

    const response = geminiRequest(this.apiKey, this.model, body) as any;

    const durationMs = Date.now() - t0;
    const candidate = response.candidates?.[0];
    const usageMeta = response.usageMetadata;

    let imageData: string | null = null;
    let mimeType = "image/png";
    let imageCount = 0;

    for (const part of candidate?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        imageData = part.inlineData.data;
        mimeType = part.inlineData.mimeType ?? "image/png";
        imageCount++;
        break;
      }
    }

    if (!imageData) {
      throw new Error("Gemini returned no image data");
    }

    return {
      buffer: Buffer.from(imageData, "base64"),
      mimeType,
      usage: {
        op: "edit",
        model: this.model,
        prompt: instructions,
        inputTokens: usageMeta?.promptTokenCount ?? 0,
        outputTokens: usageMeta?.candidatesTokenCount ?? 0,
        imageCount,
        durationMs,
      },
    };
  }
}
