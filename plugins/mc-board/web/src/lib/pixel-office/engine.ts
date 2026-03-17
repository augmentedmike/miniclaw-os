// Pixel Office Engine — game loop, character updates, rendering
// Extracted from pixel-agents (MIT) and adapted for MiniClaw

import {
  TILE_SIZE,
  TileType,
  Direction,
  CharacterState,
  Character,
  CharacterSprites,
  OfficeLayout,
  Seat,
  PlacedFurniture,
  ActiveAgent,
  SpriteData,
} from "./types";
import { findPath, getWalkableTiles, isWalkable } from "./pathfinding";
import {
  loadCharacterSheet,
  extractCharacter,
  adjustCharacterHue,
  getCachedSprite,
  clearSpriteCache,
  loadTileImage,
  extractSpriteData,
} from "./sprites";

// Constants
const WALK_SPEED = 48; // px/sec
const WALK_FRAME_DUR = 0.15;
const TYPE_FRAME_DUR = 0.3;
const WANDER_PAUSE_MIN = 3;
const WANDER_PAUSE_MAX = 15;
const SEAT_REST_MIN = 30; // shorter than original for demo appeal
const SEAT_REST_MAX = 60;
const SITTING_OFFSET = 6;
const MAX_DELTA = 0.1;
const BUBBLE_OFFSET_Y = 24;

// Character hue shifts for variety
const HUE_SHIFTS = [0, 60, 120, 180, 240, 300, 45, 135, 225, 315];

// Number of characters available in the sprite sheet
const NUM_BASE_CHARS = 6;

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// Furniture catalog — simplified (only what we need for blocking + seats)
interface SimpleFurniture {
  footprintW: number;
  footprintH: number;
  isChair: boolean;
  isDesk: boolean;
  orientation?: string;
  backgroundTiles?: number;
}

const FURNITURE_DB: Record<string, SimpleFurniture> = {
  DESK_FRONT: { footprintW: 2, footprintH: 1, isChair: false, isDesk: true },
  DESK_SIDE: { footprintW: 1, footprintH: 2, isChair: false, isDesk: true },
  PC_FRONT_ON_1: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  PC_FRONT_ON_2: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  PC_FRONT_ON_3: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  PC_FRONT_OFF: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  PC_SIDE: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  "PC_SIDE:left": { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  WOODEN_CHAIR_FRONT: { footprintW: 1, footprintH: 1, isChair: true, isDesk: false, orientation: "front" },
  WOODEN_CHAIR_BACK: { footprintW: 1, footprintH: 1, isChair: true, isDesk: false, orientation: "back" },
  WOODEN_CHAIR_SIDE: { footprintW: 1, footprintH: 1, isChair: true, isDesk: false, orientation: "right" },
  "WOODEN_CHAIR_SIDE:left": { footprintW: 1, footprintH: 1, isChair: true, isDesk: false, orientation: "left" },
  CUSHIONED_CHAIR_FRONT: { footprintW: 1, footprintH: 1, isChair: true, isDesk: false, orientation: "front" },
  CUSHIONED_CHAIR_BACK: { footprintW: 1, footprintH: 1, isChair: true, isDesk: false, orientation: "back" },
  CUSHIONED_CHAIR_SIDE: { footprintW: 1, footprintH: 1, isChair: true, isDesk: false, orientation: "right" },
  "CUSHIONED_CHAIR_SIDE:left": { footprintW: 1, footprintH: 1, isChair: true, isDesk: false, orientation: "left" },
  BOOKSHELF: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false, backgroundTiles: 1 },
  DOUBLE_BOOKSHELF: { footprintW: 2, footprintH: 1, isChair: false, isDesk: false, backgroundTiles: 1 },
  WHITEBOARD: { footprintW: 2, footprintH: 1, isChair: false, isDesk: false, backgroundTiles: 1 },
  PLANT: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  PLANT_2: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  LARGE_PLANT: { footprintW: 1, footprintH: 2, isChair: false, isDesk: false, backgroundTiles: 1 },
  CACTUS: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  SOFA_FRONT: { footprintW: 2, footprintH: 1, isChair: false, isDesk: false },
  SOFA_SIDE: { footprintW: 1, footprintH: 2, isChair: false, isDesk: false },
  "SOFA_SIDE:left": { footprintW: 1, footprintH: 2, isChair: false, isDesk: false },
  SOFA_BACK: { footprintW: 2, footprintH: 1, isChair: false, isDesk: false },
  BIN: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  COFFEE_TABLE: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  COFFEE: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  SMALL_TABLE_FRONT: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  SMALL_TABLE_SIDE: { footprintW: 1, footprintH: 2, isChair: false, isDesk: false },
  TABLE_FRONT: { footprintW: 2, footprintH: 1, isChair: false, isDesk: false },
  CUSHIONED_BENCH: { footprintW: 2, footprintH: 1, isChair: false, isDesk: false },
  WOODEN_BENCH: { footprintW: 2, footprintH: 1, isChair: false, isDesk: false },
  SMALL_PAINTING: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false, backgroundTiles: 1 },
  SMALL_PAINTING_2: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false, backgroundTiles: 1 },
  LARGE_PAINTING: { footprintW: 2, footprintH: 1, isChair: false, isDesk: false, backgroundTiles: 1 },
  HANGING_PLANT: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false, backgroundTiles: 1 },
  CLOCK: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false, backgroundTiles: 1 },
  POT: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
};

function getFurnitureInfo(type: string): SimpleFurniture {
  return FURNITURE_DB[type] ?? { footprintW: 1, footprintH: 1, isChair: false, isDesk: false };
}

export interface OfficeState {
  layout: OfficeLayout;
  characters: Character[];
  seats: Seat[];
  blocked: Set<string>;
  walkable: { col: number; row: number }[];
  floorImages: Map<number, HTMLImageElement>;
  wallImage: HTMLImageElement | null;
  furnitureImages: Map<string, HTMLImageElement>;
  furnitureSprites: Map<string, SpriteData>;
  characterSheet: HTMLImageElement | null;
  baseSprites: CharacterSprites[];
  zoom: number;
  offsetX: number;
  offsetY: number;
  loaded: boolean;
}

function orientationToFacing(orientation?: string): Direction {
  switch (orientation) {
    case "front": return Direction.DOWN;
    case "back": return Direction.UP;
    case "left": return Direction.LEFT;
    case "right": return Direction.RIGHT;
    default: return Direction.DOWN;
  }
}

export function buildSeats(furniture: PlacedFurniture[]): Seat[] {
  const seats: Seat[] = [];
  for (const item of furniture) {
    const info = getFurnitureInfo(item.type);
    if (!info.isChair) continue;
    seats.push({
      uid: item.uid,
      col: item.col,
      row: item.row,
      facingDir: orientationToFacing(info.orientation),
      assigned: false,
      assignedTo: null,
    });
  }
  return seats;
}

export function buildBlockedTiles(furniture: PlacedFurniture[]): Set<string> {
  const tiles = new Set<string>();
  for (const item of furniture) {
    const info = getFurnitureInfo(item.type);
    const bg = info.backgroundTiles ?? 0;
    for (let dr = 0; dr < info.footprintH; dr++) {
      if (dr < bg) continue;
      for (let dc = 0; dc < info.footprintW; dc++) {
        tiles.add(`${item.col + dc},${item.row + dr}`);
      }
    }
  }
  return tiles;
}

export function createCharacter(
  id: string,
  name: string,
  sprites: CharacterSprites,
  paletteIndex: number,
  startCol: number,
  startRow: number
): Character {
  return {
    id,
    name,
    label: "",
    x: startCol * TILE_SIZE + TILE_SIZE / 2,
    y: startRow * TILE_SIZE + TILE_SIZE / 2,
    tileCol: startCol,
    tileRow: startRow,
    state: CharacterState.IDLE,
    dir: Direction.DOWN,
    frame: 0,
    frameTimer: 0,
    sprites,
    path: [],
    moveProgress: 0,
    wanderTimer: rand(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX),
    wanderCount: 0,
    seatId: null,
    seatTimer: 0,
    isActive: false,
    bubbleText: null,
    bubbleTimer: 0,
    paletteIndex,
  };
}

// Update a single character
function updateCharacter(
  ch: Character,
  dt: number,
  state: OfficeState
): void {
  ch.frameTimer += dt;

  if (ch.bubbleTimer > 0) {
    ch.bubbleTimer -= dt;
    if (ch.bubbleTimer <= 0) ch.bubbleText = null;
  }

  switch (ch.state) {
    case CharacterState.TYPE:
    case CharacterState.READ: {
      if (ch.frameTimer >= TYPE_FRAME_DUR) {
        ch.frameTimer -= TYPE_FRAME_DUR;
        ch.frame = (ch.frame + 1) % 2;
      }
      if (!ch.isActive) {
        ch.seatTimer -= dt;
        if (ch.seatTimer <= 0) {
          ch.state = CharacterState.IDLE;
          ch.wanderTimer = rand(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX);
        }
      }
      break;
    }

    case CharacterState.IDLE: {
      ch.frame = 0;
      // Active → pathfind to seat
      if (ch.isActive && ch.seatId) {
        const seat = state.seats.find((s) => s.uid === ch.seatId);
        if (seat) {
          const path = findPath(
            ch.tileCol, ch.tileRow,
            seat.col, seat.row,
            state.layout.tiles, state.layout.cols, state.layout.rows,
            state.blocked
          );
          if (path.length > 0) {
            ch.path = path;
            ch.state = CharacterState.WALK;
            ch.moveProgress = 0;
            ch.frameTimer = 0;
            ch.frame = 0;
          } else if (ch.tileCol === seat.col && ch.tileRow === seat.row) {
            // Already at seat
            ch.state = CharacterState.TYPE;
            ch.dir = seat.facingDir;
            ch.frame = 0;
            ch.frameTimer = 0;
          }
        }
      }

      // Wander when idle
      ch.wanderTimer -= dt;
      if (ch.wanderTimer <= 0 && !ch.isActive) {
        const wt = state.walkable;
        if (wt.length > 0) {
          const target = wt[Math.floor(Math.random() * wt.length)];
          const path = findPath(
            ch.tileCol, ch.tileRow,
            target.col, target.row,
            state.layout.tiles, state.layout.cols, state.layout.rows,
            state.blocked
          );
          if (path.length > 0 && path.length < 20) {
            ch.path = path;
            ch.state = CharacterState.WALK;
            ch.moveProgress = 0;
            ch.frameTimer = 0;
            ch.frame = 0;
          }
        }
        ch.wanderTimer = rand(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX);
      }
      break;
    }

    case CharacterState.WALK: {
      if (ch.frameTimer >= WALK_FRAME_DUR) {
        ch.frameTimer -= WALK_FRAME_DUR;
        ch.frame = (ch.frame + 1) % 4;
      }

      if (ch.path.length === 0) {
        ch.state = CharacterState.IDLE;
        ch.wanderTimer = rand(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX);
        break;
      }

      const next = ch.path[0];
      const fromX = ch.tileCol * TILE_SIZE + TILE_SIZE / 2;
      const fromY = ch.tileRow * TILE_SIZE + TILE_SIZE / 2;
      const toX = next.col * TILE_SIZE + TILE_SIZE / 2;
      const toY = next.row * TILE_SIZE + TILE_SIZE / 2;

      // Direction
      const dx = next.col - ch.tileCol;
      const dy = next.row - ch.tileRow;
      if (Math.abs(dx) > Math.abs(dy)) {
        ch.dir = dx > 0 ? Direction.RIGHT : Direction.LEFT;
      } else {
        ch.dir = dy > 0 ? Direction.DOWN : Direction.UP;
      }

      ch.moveProgress += (WALK_SPEED / TILE_SIZE) * dt;
      const t = Math.min(ch.moveProgress, 1);
      ch.x = fromX + (toX - fromX) * t;
      ch.y = fromY + (toY - fromY) * t;

      if (ch.moveProgress >= 1) {
        ch.tileCol = next.col;
        ch.tileRow = next.row;
        ch.x = toX;
        ch.y = toY;
        ch.path.shift();
        ch.moveProgress = 0;

        // Arrived at seat?
        if (ch.path.length === 0 && ch.isActive && ch.seatId) {
          const seat = state.seats.find((s) => s.uid === ch.seatId);
          if (seat && ch.tileCol === seat.col && ch.tileRow === seat.row) {
            ch.state = CharacterState.TYPE;
            ch.dir = seat.facingDir;
            ch.frame = 0;
            ch.frameTimer = 0;
          } else {
            ch.state = CharacterState.IDLE;
            ch.wanderTimer = rand(1, 3);
          }
        } else if (ch.path.length === 0) {
          ch.state = CharacterState.IDLE;
          ch.wanderTimer = rand(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX);
        }
      }
      break;
    }
  }
}

// Update all characters
export function updateOffice(state: OfficeState, dt: number): void {
  const clampedDt = Math.min(dt, MAX_DELTA);
  for (const ch of state.characters) {
    updateCharacter(ch, clampedDt, state);
  }
}

// Render the full office
export function renderOffice(
  ctx: CanvasRenderingContext2D,
  state: OfficeState
): void {
  const { layout, characters, zoom, offsetX, offsetY } = state;
  const { cols, rows, tiles } = layout;

  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Fill background
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Draw floor tiles
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = tiles[r * cols + c];
      if (t === TileType.VOID || t === TileType.WALL) continue;

      const x = offsetX + c * TILE_SIZE * zoom;
      const y = offsetY + r * TILE_SIZE * zoom;
      const floorImg = state.floorImages.get(t);
      if (floorImg) {
        ctx.drawImage(floorImg, x, y, TILE_SIZE * zoom, TILE_SIZE * zoom);
      } else {
        // Fallback color
        ctx.fillStyle = "#3d3d5c";
        ctx.fillRect(x, y, TILE_SIZE * zoom, TILE_SIZE * zoom);
      }
    }
  }

  // Draw wall tiles
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = tiles[r * cols + c];
      if (t !== TileType.WALL) continue;
      const x = offsetX + c * TILE_SIZE * zoom;
      const y = offsetY + r * TILE_SIZE * zoom;
      if (state.wallImage) {
        ctx.drawImage(state.wallImage, x, y, TILE_SIZE * zoom, TILE_SIZE * zoom);
      } else {
        ctx.fillStyle = "#2d2d44";
        ctx.fillRect(x, y, TILE_SIZE * zoom, TILE_SIZE * zoom);
      }
    }
  }

  // Build draw queue: furniture + characters, sorted by zY
  interface Drawable {
    zY: number;
    draw: () => void;
  }
  const drawQueue: Drawable[] = [];

  // Furniture
  for (const item of layout.furniture) {
    const img = state.furnitureImages.get(item.type);
    const sprite = state.furnitureSprites.get(item.type);
    const info = getFurnitureInfo(item.type);
    const x = offsetX + item.col * TILE_SIZE * zoom;
    const y = offsetY + item.row * TILE_SIZE * zoom;
    const zY = (item.row + info.footprintH) * TILE_SIZE;

    if (sprite) {
      const cached = getCachedSprite(sprite, zoom);
      drawQueue.push({
        zY,
        draw: () => {
          ctx.drawImage(cached, x, y);
        },
      });
    } else if (img) {
      const w = info.footprintW * TILE_SIZE * zoom;
      const h = info.footprintH * TILE_SIZE * zoom;
      drawQueue.push({
        zY,
        draw: () => ctx.drawImage(img, x, y, w, h),
      });
    }
  }

  // Characters
  for (const ch of characters) {
    const zY = ch.y + TILE_SIZE / 2 + 0.5;
    drawQueue.push({
      zY,
      draw: () => renderCharacter(ctx, ch, state),
    });
  }

  // Sort and draw
  drawQueue.sort((a, b) => a.zY - b.zY);
  for (const d of drawQueue) d.draw();

  // Speech bubbles (always on top)
  for (const ch of characters) {
    if (ch.bubbleText || ch.isActive) {
      renderBubble(ctx, ch, state);
    }
  }
}

function getCharacterSprite(ch: Character): SpriteData | null {
  const dirSprites =
    ch.dir === Direction.DOWN ? ch.sprites.down :
    ch.dir === Direction.UP ? ch.sprites.up :
    ch.dir === Direction.RIGHT ? ch.sprites.right :
    ch.sprites.left;

  if (!dirSprites || dirSprites.length === 0) return null;

  if (ch.state === CharacterState.TYPE) {
    // Type frames: index 3+4 in original sheet, mapped to frame 0-1
    const typeIdx = 3 + (ch.frame % 2);
    return dirSprites[typeIdx] ?? dirSprites[0];
  }
  if (ch.state === CharacterState.READ) {
    const readIdx = 5 + (ch.frame % 2);
    return dirSprites[readIdx] ?? dirSprites[0];
  }
  if (ch.state === CharacterState.WALK) {
    return dirSprites[ch.frame % 4] ?? dirSprites[0];
  }
  // IDLE
  return dirSprites[0];
}

function renderCharacter(
  ctx: CanvasRenderingContext2D,
  ch: Character,
  state: OfficeState
): void {
  const sprite = getCharacterSprite(ch);
  if (!sprite) return;

  const { zoom, offsetX, offsetY } = state;
  const cached = getCachedSprite(sprite, zoom);

  const sittingOff = (ch.state === CharacterState.TYPE || ch.state === CharacterState.READ) ? SITTING_OFFSET : 0;
  const drawX = Math.round(offsetX + (ch.x - TILE_SIZE / 2) * zoom);
  const drawY = Math.round(offsetY + (ch.y - TILE_SIZE + sittingOff) * zoom);

  ctx.drawImage(cached, drawX, drawY);
}

function renderBubble(
  ctx: CanvasRenderingContext2D,
  ch: Character,
  state: OfficeState
): void {
  const { zoom, offsetX, offsetY } = state;
  const text = ch.bubbleText || ch.label || ch.name;
  if (!text) return;

  const sittingOff = (ch.state === CharacterState.TYPE || ch.state === CharacterState.READ) ? SITTING_OFFSET : 0;
  const bubbleX = Math.round(offsetX + ch.x * zoom);
  const bubbleY = Math.round(offsetY + (ch.y + sittingOff - BUBBLE_OFFSET_Y) * zoom);

  // Measure text
  const fontSize = Math.max(8, Math.round(8 * zoom));
  ctx.font = `bold ${fontSize}px monospace`;
  const metrics = ctx.measureText(text);
  const tw = metrics.width;
  const pad = 4 * zoom;
  const bw = tw + pad * 2;
  const bh = fontSize + pad * 2;

  // Background
  ctx.fillStyle = ch.isActive ? "#22c55e" : "#3f3f46";
  ctx.globalAlpha = 0.9;
  const rx = bubbleX - bw / 2;
  const ry = bubbleY - bh;
  ctx.beginPath();
  const r = 3 * zoom;
  ctx.roundRect(rx, ry, bw, bh, r);
  ctx.fill();

  // Pointer
  ctx.beginPath();
  ctx.moveTo(bubbleX - 3 * zoom, ry + bh);
  ctx.lineTo(bubbleX, ry + bh + 3 * zoom);
  ctx.lineTo(bubbleX + 3 * zoom, ry + bh);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Text
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, bubbleX, ry + bh / 2);
}

// Default minimal office layout
export function getDefaultLayout(): OfficeLayout {
  return {
    version: 1,
    cols: 16,
    rows: 12,
    tiles: [
      // Row 0: walls
      0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
      // Row 1: wall + floor
      0,1,1,1,1,1,1,1,0,7,7,7,7,7,7,0,
      // Row 2
      0,1,1,1,1,1,1,1,0,7,7,7,7,7,7,0,
      // Row 3
      0,1,1,1,1,1,1,1,0,7,7,7,7,7,7,0,
      // Row 4
      0,1,1,1,1,1,1,1,0,7,7,7,7,7,7,0,
      // Row 5 — doorway connecting rooms
      0,1,1,1,1,1,1,1,1,7,7,7,7,7,7,0,
      // Row 6
      0,1,1,1,1,1,1,1,1,7,7,7,7,7,7,0,
      // Row 7
      0,1,1,1,1,1,1,1,0,7,7,7,7,7,7,0,
      // Row 8
      0,1,1,1,1,1,1,1,0,7,7,7,7,7,7,0,
      // Row 9
      0,1,1,1,1,1,1,1,0,7,7,7,7,7,7,0,
      // Row 10
      0,1,1,1,1,1,1,1,0,7,7,7,7,7,7,0,
      // Row 11: walls
      0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
    ],
    furniture: [
      // Left room — 3 workstations
      { uid: "d1", type: "DESK_FRONT", col: 2, row: 2 },
      { uid: "c1", type: "WOODEN_CHAIR_FRONT", col: 2, row: 3 },
      { uid: "p1", type: "PC_FRONT_ON_1", col: 3, row: 2 },

      { uid: "d2", type: "DESK_FRONT", col: 5, row: 2 },
      { uid: "c2", type: "WOODEN_CHAIR_FRONT", col: 5, row: 3 },
      { uid: "p2", type: "PC_FRONT_ON_2", col: 6, row: 2 },

      { uid: "d3", type: "DESK_FRONT", col: 2, row: 7 },
      { uid: "c3", type: "WOODEN_CHAIR_FRONT", col: 2, row: 8 },
      { uid: "p3", type: "PC_FRONT_ON_3", col: 3, row: 7 },

      // Left room decor
      { uid: "pl1", type: "PLANT", col: 1, row: 1 },
      { uid: "bs1", type: "BOOKSHELF", col: 7, row: 1 },
      { uid: "bn1", type: "BIN", col: 4, row: 10 },

      // Right room — 3 more workstations
      { uid: "d4", type: "DESK_FRONT", col: 10, row: 2 },
      { uid: "c4", type: "WOODEN_CHAIR_FRONT", col: 10, row: 3 },
      { uid: "p4", type: "PC_FRONT_ON_1", col: 11, row: 2 },

      { uid: "d5", type: "DESK_FRONT", col: 13, row: 2 },
      { uid: "c5", type: "WOODEN_CHAIR_FRONT", col: 13, row: 3 },
      { uid: "p5", type: "PC_FRONT_ON_2", col: 14, row: 2 },

      { uid: "d6", type: "DESK_FRONT", col: 10, row: 7 },
      { uid: "c6", type: "WOODEN_CHAIR_FRONT", col: 10, row: 8 },
      { uid: "p6", type: "PC_FRONT_ON_3", col: 11, row: 7 },

      // Right room decor
      { uid: "pl2", type: "LARGE_PLANT", col: 14, row: 9 },
      { uid: "ct1", type: "COFFEE_TABLE", col: 12, row: 5 },
      { uid: "cf1", type: "COFFEE", col: 13, row: 5 },
      { uid: "wb1", type: "WHITEBOARD", col: 10, row: 1 },
      { uid: "cl1", type: "CLOCK", col: 14, row: 1 },
    ],
  };
}

// Load all assets
export async function initOffice(
  layoutOrNull?: OfficeLayout | null
): Promise<OfficeState> {
  const layout = layoutOrNull ?? getDefaultLayout();
  const blocked = buildBlockedTiles(layout.furniture);
  const seats = buildSeats(layout.furniture);
  const walkable = getWalkableTiles(
    layout.tiles, layout.cols, layout.rows, blocked
  );

  // Load individual character sprite sheets (char_0.png through char_5.png)
  // Each is 112×96: 7 frames × 3 directions (down, up, right), each frame 16×32
  let characterSheet: HTMLImageElement | null = null;
  const baseSprites: CharacterSprites[] = [];
  for (let i = 0; i < NUM_BASE_CHARS; i++) {
    try {
      const img = await loadCharacterSheet(
        `/pixel-office/assets/characters/char_${i}.png`
      );
      if (i === 0) characterSheet = img;
      baseSprites.push(extractCharacter(img, 0)); // Each file is 1 character (row 0)
    } catch (e) {
      console.warn(`Failed to load char_${i}:`, e);
    }
  }

  // Load floor tiles
  const floorImages = new Map<number, HTMLImageElement>();
  for (let i = 0; i <= 8; i++) {
    try {
      const img = await loadTileImage(
        `/pixel-office/assets/floors/floor_${i}.png`
      );
      floorImages.set(i + 1, img); // TileType 1-9
    } catch {
      // OK — will use fallback color
    }
  }

  // Load wall tile
  let wallImage: HTMLImageElement | null = null;
  try {
    wallImage = await loadTileImage("/pixel-office/assets/walls/wall_0.png");
  } catch {
    // OK
  }

  // Load furniture images and extract SpriteData
  const furnitureImages = new Map<string, HTMLImageElement>();
  const furnitureSprites = new Map<string, SpriteData>();
  const furnitureTypes = new Set(layout.furniture.map((f) => f.type));
  for (const type of furnitureTypes) {
    // Determine image path from type
    const baseType = type.replace(/:left$/, "");
    const parts = baseType.split("_");
    // Try to load with various folder guesses
    const folderGuesses = new Set<string>();
    // Single-word items: PLANT, CACTUS, BIN, COFFEE, POT
    folderGuesses.add(baseType);
    // Two-word prefix: WOODEN_CHAIR, CUSHIONED_CHAIR, etc.
    if (parts.length >= 3) {
      folderGuesses.add(parts.slice(0, 2).join("_"));
    }
    // First word: DESK, PC, SOFA, etc.
    folderGuesses.add(parts[0]);

    let loaded = false;
    for (const fg of folderGuesses) {
      try {
        const path = `/pixel-office/assets/furniture/${fg}/${baseType}.png`;
        const img = await loadTileImage(path);
        furnitureImages.set(type, img);
        // Extract sprite data
        const info = getFurnitureInfo(type);
        const sd = extractSpriteData(
          img, 0, 0, img.naturalWidth, img.naturalHeight
        );
        // If it's a :left variant, flip horizontally
        if (type.endsWith(":left")) {
          furnitureSprites.set(type, sd.map((row) => [...row].reverse()));
        } else {
          furnitureSprites.set(type, sd);
        }
        loaded = true;
        break;
      } catch {
        continue;
      }
    }
    if (!loaded) {
      console.warn(`Could not load furniture: ${type}`);
    }
  }

  return {
    layout,
    characters: [],
    seats,
    blocked,
    walkable,
    floorImages,
    wallImage,
    furnitureImages,
    furnitureSprites,
    characterSheet,
    baseSprites,
    zoom: 3,
    offsetX: 0,
    offsetY: 0,
    loaded: true,
  };
}

// Sync agent list → characters
export function syncAgents(
  state: OfficeState,
  agents: ActiveAgent[]
): void {
  const existingIds = new Set(state.characters.map((c) => c.id));
  const activeIds = new Set(agents.map((a) => a.worker));

  // Remove characters for agents that are no longer active
  for (const ch of state.characters) {
    if (!activeIds.has(ch.id)) {
      ch.isActive = false;
      ch.bubbleText = null;
      // Don't remove immediately — let them wander a bit then fade
    }
  }

  // Add characters for new agents
  for (const agent of agents) {
    if (existingIds.has(agent.worker)) {
      // Update existing character
      const ch = state.characters.find((c) => c.id === agent.worker)!;
      ch.isActive = true;
      ch.label = truncate(agent.title || agent.cardId, 20);
      ch.bubbleText = truncate(agent.title || agent.cardId, 20);
      ch.bubbleTimer = 10;
      continue;
    }

    // Create new character
    if (state.baseSprites.length === 0) continue;

    const idx = state.characters.length;
    const baseIdx = idx % state.baseSprites.length;
    const hueShift = HUE_SHIFTS[idx % HUE_SHIFTS.length];
    const sprites = adjustCharacterHue(state.baseSprites[baseIdx], hueShift);

    // Find a spawn point
    const spawn = state.walkable.length > 0
      ? state.walkable[Math.floor(Math.random() * state.walkable.length)]
      : { col: 3, row: 5 };

    const ch = createCharacter(
      agent.worker,
      agent.worker,
      sprites,
      idx,
      spawn.col,
      spawn.row
    );
    ch.isActive = true;
    ch.label = truncate(agent.title || agent.cardId, 20);
    ch.bubbleText = truncate(agent.title || agent.cardId, 20);
    ch.bubbleTimer = 10;

    // Assign to a seat
    const freeSeat = state.seats.find((s) => !s.assigned);
    if (freeSeat) {
      freeSeat.assigned = true;
      freeSeat.assignedTo = agent.worker;
      ch.seatId = freeSeat.uid;
    }

    state.characters.push(ch);
  }

  // Clean up long-inactive characters (> 60 sync cycles idle)
  state.characters = state.characters.filter((ch) => {
    if (ch.isActive) {
      ch.inactiveTimer = 0;
      return true;
    }
    // Track how long this character has been inactive
    ch.inactiveTimer = (ch.inactiveTimer ?? 0) + 1;
    // Remove after ~60 sync cycles of being inactive and idle
    if (ch.inactiveTimer > 60 && ch.state === CharacterState.IDLE) {
      // Free the seat
      const seat = state.seats.find((s) => s.assignedTo === ch.id);
      if (seat) {
        seat.assigned = false;
        seat.assignedTo = null;
      }
      return false;
    }
    return true;
  });
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "…";
}

// Auto-center the view
export function centerView(
  state: OfficeState,
  canvasWidth: number,
  canvasHeight: number
): void {
  const worldW = state.layout.cols * TILE_SIZE * state.zoom;
  const worldH = state.layout.rows * TILE_SIZE * state.zoom;
  state.offsetX = Math.round((canvasWidth - worldW) / 2);
  state.offsetY = Math.round((canvasHeight - worldH) / 2);
}
