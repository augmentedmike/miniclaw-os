import * as fs from "node:fs";
import * as path from "node:path";
import sharp from "sharp";
import type { Canvas, Layer } from "./types.js";

/**
 * Flatten all visible layers in z-order and return the composited PNG buffer.
 */
export async function compositeCanvas(canvas: Canvas): Promise<Buffer> {
  const { width, height } = canvas;

  // Sorted lowest z first (bottom layer first)
  const visibleLayers = canvas.layers
    .filter((l) => l.visible && fs.existsSync(l.imagePath))
    .sort((a, b) => a.z - b.z);

  if (visibleLayers.length === 0) {
    // Return a transparent canvas
    return sharp({
      create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
  }

  // Start with a transparent base
  let base = sharp({
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).png();

  const compositeInputs = await Promise.all(
    visibleLayers.map(async (layer) => {
      const role = layer.role ?? (layer.z === 0 ? "background" : "element");

      let img: sharp.Sharp;

      if (role === "background") {
        // Fill the entire canvas, cropping if needed to avoid letterboxing
        img = sharp(layer.imagePath).resize(width, height, {
          fit: "cover",
          position: "centre",
        });
      } else {
        // Element: scale down only if larger than canvas, preserve natural size
        const meta = await sharp(layer.imagePath).metadata();
        const nw = meta.width ?? width;
        const nh = meta.height ?? height;
        if (nw > width || nh > height) {
          img = sharp(layer.imagePath).resize(width, height, {
            fit: "inside",
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          });
        } else {
          img = sharp(layer.imagePath);
        }
        img = img.ensureAlpha();
      }

      if (layer.opacity < 100) {
        img = img.ensureAlpha().linear(layer.opacity / 100, 0);
      }

      const buf = await img.png().toBuffer();
      return {
        input: buf,
        top: layer.y,
        left: layer.x,
        blend: blendModeToSharp(layer.blendMode),
      } as Parameters<typeof sharp.prototype.composite>[0][number];
    }),
  );

  const result = await base.composite(compositeInputs).png().toBuffer();
  return result;
}

/**
 * Strip the background from an image using a simple edge-alpha approach.
 * For proper background removal, this should be replaced with an API call.
 * Returns a PNG buffer with transparency.
 */
export async function stripBackground(inputPath: string): Promise<Buffer> {
  // Naive approach: convert to PNG with alpha.
  // A real implementation would use a segmentation API or model.
  return sharp(inputPath).ensureAlpha().png().toBuffer();
}

/**
 * Cut (make transparent) a rectangular region of an image.
 */
export async function cutRegion(
  inputPath: string,
  region: { left: number; top: number; width: number; height: number },
): Promise<Buffer> {
  const { left, top, width, height } = region;
  const img = sharp(inputPath).ensureAlpha();
  const meta = await sharp(inputPath).metadata();

  // Create a mask: transparent rect over the cut region
  const mask = await sharp({
    create: {
      width: meta.width ?? width,
      height: meta.height ?? height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 255 },
    },
  })
    .composite([
      {
        input: await sharp({
          create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
        })
          .png()
          .toBuffer(),
        left,
        top,
        blend: "dest-out",
      },
    ])
    .png()
    .toBuffer();

  return img.composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

function blendModeToSharp(
  mode: Layer["blendMode"],
): Parameters<typeof sharp.prototype.composite>[0][number]["blend"] {
  switch (mode) {
    case "multiply": return "multiply";
    case "screen":   return "screen";
    case "overlay":  return "overlay";
    default:         return "over";
  }
}
