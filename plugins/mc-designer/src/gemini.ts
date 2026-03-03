import * as fs from "node:fs";
import { GoogleGenAI } from "@google/genai";
import type { UsageRecord } from "./types.js";

interface GenerateResult {
  buffer: Buffer;
  mimeType: string;
  usage: Omit<UsageRecord, "ts" | "canvasName" | "layerName">;
}

/** Map canvas aspect ratio to the nearest Gemini-supported value */
function nearestAspectRatio(w: number, h: number): string {
  const r = w / h;
  const options: [number, string][] = [
    [1,       "1:1"],
    [4/3,     "4:3"],
    [3/4,     "3:4"],
    [16/9,    "16:9"],
    [9/16,    "9:16"],
  ];
  let best = options[0][1];
  let bestDiff = Infinity;
  for (const [ratio, label] of options) {
    const diff = Math.abs(r - ratio);
    if (diff < bestDiff) { bestDiff = diff; best = label; }
  }
  return best;
}

export class GeminiClient {
  private ai: GoogleGenAI;

  constructor(private apiKey: string, private model: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  setApiKey(key: string): void {
    this.apiKey = key;
    this.ai = new GoogleGenAI({ apiKey: key });
  }

  /**
   * Generate an image from a text prompt.
   */
  async generate(
    prompt: string,
    op: "generate" | "edit" = "generate",
    canvasWidth?: number,
    canvasHeight?: number,
  ): Promise<GenerateResult> {
    const t0 = Date.now();

    const aspectRatio = canvasWidth && canvasHeight
      ? nearestAspectRatio(canvasWidth, canvasHeight)
      : "1:1";

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: { aspectRatio },
      },
    });

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

  /**
   * Edit an existing image with natural language instructions.
   */
  async edit(imagePath: string, instructions: string): Promise<GenerateResult> {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString("base64");
    const t0 = Date.now();

    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: [
        {
          role: "user",
          parts: [
            { text: instructions },
            { inlineData: { mimeType: "image/png", data: base64 } },
          ],
        },
      ],
      config: {
        responseModalities: ["IMAGE"],
      },
    });

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
