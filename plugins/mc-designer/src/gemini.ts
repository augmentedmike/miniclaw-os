import * as fs from "node:fs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { UsageRecord } from "./types.js";

interface GenerateResult {
  buffer: Buffer;
  mimeType: string;
  usage: Omit<UsageRecord, "ts" | "canvasName" | "layerName">;
}

export class GeminiClient {
  private genAI: GoogleGenerativeAI;

  constructor(private apiKey: string, private model: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Generate an image from a text prompt.
   * Returns the first image in the response.
   */
  async generate(
    prompt: string,
    op: "generate" | "edit" = "generate",
  ): Promise<GenerateResult> {
    const m = this.genAI.getGenerativeModel({ model: this.model });
    const t0 = Date.now();

    const response = await m.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        // @ts-expect-error responseModalities is valid but not in all SDK typings yet
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    const durationMs = Date.now() - t0;
    const candidate = response.response.candidates?.[0];
    const usageMeta = response.response.usageMetadata;

    let imageData: string | null = null;
    let mimeType = "image/png";
    let imageCount = 0;

    for (const part of candidate?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        imageData = part.inlineData.data;
        mimeType = part.inlineData.mimeType ?? "image/png";
        imageCount++;
        break; // take first image
      }
    }

    if (!imageData) {
      throw new Error("Gemini returned no image data");
    }

    const buffer = Buffer.from(imageData, "base64");

    return {
      buffer,
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
   * Reads the image from disk, sends it alongside the instruction prompt.
   */
  async edit(
    imagePath: string,
    instructions: string,
  ): Promise<GenerateResult> {
    const imageBuffer = fs.readFileSync(imagePath);
    const base64 = imageBuffer.toString("base64");

    const m = this.genAI.getGenerativeModel({ model: this.model });
    const t0 = Date.now();

    const response = await m.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: instructions },
            { inlineData: { mimeType: "image/png", data: base64 } },
          ],
        },
      ],
      generationConfig: {
        // @ts-expect-error responseModalities is valid but not in all SDK typings yet
        responseModalities: ["IMAGE"],
      },
    });

    const durationMs = Date.now() - t0;
    const candidate = response.response.candidates?.[0];
    const usageMeta = response.response.usageMetadata;

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
