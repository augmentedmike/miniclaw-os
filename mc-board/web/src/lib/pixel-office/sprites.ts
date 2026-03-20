// Sprite loading and processing
// Extracted from pixel-agents (MIT) and adapted for MiniClaw

import { SpriteData, CharacterSprites, TILE_SIZE } from "./types";

// Character sprite sheet: each character is 16x32 pixels (1 tile wide, 2 tiles tall)
// Layout per character row: 7 sprites per direction, 3 directions (down, up, right)
// Total: 21 sprites across × 32px tall per character
// Walk: frames 0-3, Type: frames 3-4, Read: frames 5-6 (within each direction)

const CHAR_W = 16;
const CHAR_H = 32;
const FRAMES_PER_DIR = 7;
const DIRS_PER_CHAR = 3; // down, up, right (left = flip of right)
const SIT_IDLE_ROW = 3; // 4th row: sit idle frames
const SIT_IDLE_FRAMES = 2;

export function loadCharacterSheet(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function extractSpriteData(
  img: HTMLImageElement,
  sx: number,
  sy: number,
  w: number,
  h: number
): SpriteData {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  const result: SpriteData = [];
  for (let r = 0; r < h; r++) {
    const row: string[] = [];
    for (let c = 0; c < w; c++) {
      const i = (r * w + c) * 4;
      const a = data[i + 3];
      if (a === 0) {
        row.push("");
      } else {
        const hex =
          "#" +
          data[i].toString(16).padStart(2, "0") +
          data[i + 1].toString(16).padStart(2, "0") +
          data[i + 2].toString(16).padStart(2, "0");
        if (a < 255) {
          row.push(hex + a.toString(16).padStart(2, "0"));
        } else {
          row.push(hex);
        }
      }
    }
    result.push(row);
  }
  return result;
}

function flipHorizontal(sprite: SpriteData): SpriteData {
  return sprite.map((row) => [...row].reverse());
}

export function extractCharacter(img: HTMLImageElement, charIndex: number): CharacterSprites {
  // Each char file: 112×96 (7 frames wide × 3 direction rows, each frame 16×32)
  // Row 0 = down, Row 1 = up, Row 2 = right
  const baseY = charIndex * CHAR_H * DIRS_PER_CHAR;
  const dirs: SpriteData[][] = [];

  for (let d = 0; d < DIRS_PER_CHAR; d++) {
    const frames: SpriteData[] = [];
    const y = baseY + d * CHAR_H;
    for (let f = 0; f < FRAMES_PER_DIR; f++) {
      const x = f * CHAR_W;
      frames.push(extractSpriteData(img, x, y, CHAR_W, CHAR_H));
    }
    dirs.push(frames);
  }

  // Extract sit idle frames from 4th row
  const sitIdleFrames: SpriteData[] = [];
  const sitY = baseY + SIT_IDLE_ROW * CHAR_H;
  for (let f = 0; f < SIT_IDLE_FRAMES; f++) {
    sitIdleFrames.push(extractSpriteData(img, f * CHAR_W, sitY, CHAR_W, CHAR_H));
  }

  // down=0, up=1, right=2, left=flip(right)
  return {
    down: dirs[0],
    up: dirs[1],
    right: dirs[2],
    left: dirs[2].map(flipHorizontal),
    sitIdle: sitIdleFrames,
  };
}

// Hue shift for character palette variety
export function adjustHue(sprite: SpriteData, hueShift: number): SpriteData {
  if (hueShift === 0) return sprite;
  return sprite.map((row) =>
    row.map((px) => {
      if (!px || px === "") return "";
      const r = parseInt(px.slice(1, 3), 16) / 255;
      const g = parseInt(px.slice(3, 5), 16) / 255;
      const b = parseInt(px.slice(5, 7), 16) / 255;
      const alpha = px.length > 7 ? px.slice(7) : "";

      const max = Math.max(r, g, b),
        min = Math.min(r, g, b);
      const l = (max + min) / 2;
      let h = 0,
        s = 0;

      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
      }

      h = ((h * 360 + hueShift) % 360) / 360;
      if (h < 0) h += 1;

      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      let nr: number, ng: number, nb: number;
      if (s === 0) {
        nr = ng = nb = l;
      } else {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        nr = hue2rgb(p, q, h + 1 / 3);
        ng = hue2rgb(p, q, h);
        nb = hue2rgb(p, q, h - 1 / 3);
      }

      const toHex = (v: number) =>
        Math.round(Math.max(0, Math.min(1, v)) * 255)
          .toString(16)
          .padStart(2, "0");
      return "#" + toHex(nr) + toHex(ng) + toHex(nb) + alpha;
    })
  );
}

export function adjustCharacterHue(
  sprites: CharacterSprites,
  hueShift: number
): CharacterSprites {
  if (hueShift === 0) return sprites;
  const adj = (frames: SpriteData[]) => frames.map((s) => adjustHue(s, hueShift));
  return {
    down: adj(sprites.down),
    up: adj(sprites.up),
    right: adj(sprites.right),
    left: adj(sprites.left),
    sitIdle: adj(sprites.sitIdle),
  };
}

// Sprite caching for Canvas rendering
const spriteCache = new Map<number, Map<SpriteData, HTMLCanvasElement>>();

export function getCachedSprite(sprite: SpriteData, zoom: number): HTMLCanvasElement {
  let cache = spriteCache.get(zoom);
  if (!cache) {
    cache = new Map();
    spriteCache.set(zoom, cache);
  }
  const cached = cache.get(sprite);
  if (cached) return cached;

  const rows = sprite.length;
  const cols = sprite[0]?.length ?? 0;
  const canvas = document.createElement("canvas");
  canvas.width = cols * zoom;
  canvas.height = rows * zoom;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const color = sprite[r][c];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(c * zoom, r * zoom, zoom, zoom);
    }
  }

  cache.set(sprite, canvas);
  return canvas;
}

export function clearSpriteCache() {
  spriteCache.clear();
}

// Load a floor/wall tile from image
export function loadTileImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
