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

export const FURNITURE_DB: Record<string, SimpleFurniture> = {
  DESK_FRONT: { footprintW: 2, footprintH: 1, isChair: false, isDesk: true },
  DESK_SIDE: { footprintW: 1, footprintH: 2, isChair: false, isDesk: true },
  PC_FRONT_ON_1: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  PC_FRONT_ON_2: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  PC_FRONT_ON_3: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  PC_FRONT_OFF: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
  PC_BACK: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false },
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
  BOOKSHELF_SIDE: { footprintW: 1, footprintH: 1, isChair: false, isDesk: false, backgroundTiles: 1 },
  "BOOKSHELF_SIDE:left": { footprintW: 1, footprintH: 1, isChair: false, isDesk: false, backgroundTiles: 1 },
  DOUBLE_BOOKSHELF: { footprintW: 2, footprintH: 1, isChair: false, isDesk: false, backgroundTiles: 1 },
  DOUBLE_BOOKSHELF_SIDE: { footprintW: 1, footprintH: 2, isChair: false, isDesk: false, backgroundTiles: 1 },
  "DOUBLE_BOOKSHELF_SIDE:left": { footprintW: 1, footprintH: 2, isChair: false, isDesk: false, backgroundTiles: 1 },
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

export function getFurnitureInfo(type: string): SimpleFurniture {
  return FURNITURE_DB[type] ?? { footprintW: 1, footprintH: 1, isChair: false, isDesk: false };
}

export type Zone = "desk" | "lounge" | "books";

export interface OfficeState {
  layout: OfficeLayout;
  characters: Character[];
  seats: Seat[];
  blocked: Set<string>;
  walkable: { col: number; row: number }[];
  spawnTiles: { col: number; row: number }[];
  zoneWaypoints: Record<Zone, { col: number; row: number }[]>;
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

/** Map card column to office zone */
function columnToZone(column: string): Zone {
  switch (column) {
    case "in-progress": return "desk";
    case "in-review": return "books";
    case "backlog": return "lounge";
    case "on-hold": return "lounge";
    default: return "lounge";
  }
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
      action: "sit",
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
    cardId: null,
    column: "idle",
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

    case CharacterState.SIT_IDLE: {
      // Slow idle sit animation (2 frames)
      if (ch.frameTimer >= TYPE_FRAME_DUR * 3) {
        ch.frameTimer -= TYPE_FRAME_DUR * 3;
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
      const zone = columnToZone(ch.column);

      // Active with assigned seat → pathfind near it, then snap to seat
      if (ch.isActive && ch.seatId) {
        const seat = state.seats.find((s) => s.uid === ch.seatId);
        if (seat) {
          // Already at or adjacent to seat → snap and sit/stand
          // seat.row is offset by -1 for rendering, so check within 2
          const dx = Math.abs(ch.tileCol - seat.col);
          const dy = Math.abs(ch.tileRow - seat.row);
          if (dx + dy <= 2) {
            ch.tileCol = seat.col;
            ch.tileRow = seat.row;
            ch.x = seat.col * TILE_SIZE + TILE_SIZE / 2;
            ch.y = seat.row * TILE_SIZE + TILE_SIZE / 2;
            // stand = READ (head bob), sit at desk = TYPE (typing), sit elsewhere = SIT_IDLE
            ch.state = seat.action === "stand" ? CharacterState.READ
              : zone === "desk" ? CharacterState.TYPE : CharacterState.SIT_IDLE;
            ch.dir = seat.facingDir;
            ch.frame = 0;
            ch.frameTimer = 0;
            ch.seatTimer = 999;
            break;
          }
          // Find walkable tile adjacent to seat and pathfind there
          const neighbors = [
            { col: seat.col, row: seat.row - 1 },
            { col: seat.col, row: seat.row + 1 },
            { col: seat.col - 1, row: seat.row },
            { col: seat.col + 1, row: seat.row },
          ];
          let bestPath: { col: number; row: number }[] = [];
          for (const nb of neighbors) {
            if (state.blocked.has(`${nb.col},${nb.row}`)) continue;
            const path = findPath(
              ch.tileCol, ch.tileRow,
              nb.col, nb.row,
              state.layout.tiles, state.layout.cols, state.layout.rows,
              state.blocked
            );
            if (path.length > 0 && (bestPath.length === 0 || path.length < bestPath.length)) {
              bestPath = path;
            }
          }
          if (bestPath.length > 0) {
            ch.path = bestPath;
            ch.state = CharacterState.WALK;
            ch.moveProgress = 0;
            ch.frameTimer = 0;
            ch.frame = 0;
          }
          break;
        }
      }

      // Active without seat → wander within their zone
      if (ch.isActive && !ch.seatId) {
        ch.wanderTimer -= dt;
        if (ch.wanderTimer <= 0) {
          const zoneWps = state.zoneWaypoints[zone];
          const wt = zoneWps.length > 0 ? zoneWps : state.walkable;
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

      // Inactive → wander randomly
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

        // Arrived near seat? Snap to it.
        if (ch.path.length === 0 && ch.isActive && ch.seatId) {
          const seat = state.seats.find((s) => s.uid === ch.seatId);
          if (seat) {
            const dist = Math.abs(ch.tileCol - seat.col) + Math.abs(ch.tileRow - seat.row);
            if (dist <= 2) {
              ch.tileCol = seat.col;
              ch.tileRow = seat.row;
              ch.x = seat.col * TILE_SIZE + TILE_SIZE / 2;
              ch.y = seat.row * TILE_SIZE + TILE_SIZE / 2;
              const arriveZone = columnToZone(ch.column);
              ch.state = seat.action === "stand" ? CharacterState.READ
                : arriveZone === "desk" ? CharacterState.TYPE : CharacterState.SIT_IDLE;
              ch.dir = seat.facingDir;
              ch.frame = 0;
              ch.frameTimer = 0;
              ch.seatTimer = 999;
            } else {
              ch.state = CharacterState.IDLE;
              ch.wanderTimer = rand(1, 3);
            }
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

  // Object types that render on top of furniture
  const OBJECT_SET = new Set([
    "PC_FRONT_ON_1","PC_FRONT_ON_2","PC_FRONT_ON_3","PC_FRONT_OFF",
    "PC_SIDE","PC_SIDE:left","PC_BACK",
    "PLANT","PLANT_2","LARGE_PLANT","CACTUS","HANGING_PLANT",
    "BIN","COFFEE","POT",
    "SMALL_PAINTING","SMALL_PAINTING_2","LARGE_PAINTING",
    "CLOCK","WHITEBOARD",
  ]);

  function drawFurnitureItem(item: PlacedFurniture) {
    const sprite = state.furnitureSprites.get(item.type);
    const img = state.furnitureImages.get(item.type);
    const info = getFurnitureInfo(item.type);
    const x = offsetX + item.col * TILE_SIZE * zoom;
    const y = offsetY + item.row * TILE_SIZE * zoom;
    if (sprite) {
      ctx.drawImage(getCachedSprite(sprite, zoom), x, y);
    } else if (img) {
      ctx.drawImage(img, x, y, info.footprintW * TILE_SIZE * zoom, info.footprintH * TILE_SIZE * zoom);
    }
  }

  // Layer 3: All non-BACK furniture (rendered behind characters)
  for (const item of layout.furniture) {
    if (item.type.includes("BACK")) continue;
    drawFurnitureItem(item);
  }

  // Layer 4: Characters (rendered on top of non-BACK furniture)
  const sortedChars = [...characters].sort((a, b) => a.y - b.y);
  for (const ch of sortedChars) {
    renderCharacter(ctx, ch, state);
  }

  // Layer 5: BACK furniture only (occludes characters)
  for (const item of layout.furniture) {
    if (!item.type.includes("BACK")) continue;
    drawFurnitureItem(item);
  }

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

  if (ch.state === CharacterState.SIT_IDLE) {
    const sit = ch.sprites.sitIdle;
    if (sit && sit.length > 0 && (ch.dir === Direction.RIGHT || ch.dir === Direction.LEFT)) {
      // Both frames are right-facing side sit. Flip for left.
      if (ch.dir === Direction.RIGHT) return sit[ch.frame % sit.length];
      return sit[ch.frame % sit.length].map(row => [...row].reverse());
    }
    // DOWN/UP: use seated type frame (frame 3) — sits without typing arms
    return dirSprites[3] ?? dirSprites[0];
  }
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

  const sittingOff = (ch.state === CharacterState.TYPE || ch.state === CharacterState.READ || ch.state === CharacterState.SIT_IDLE) ? SITTING_OFFSET : 0;
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

  const sittingOff = (ch.state === CharacterState.TYPE || ch.state === CharacterState.READ || ch.state === CharacterState.SIT_IDLE) ? SITTING_OFFSET : 0;
  const bubbleX = Math.round(offsetX + ch.x * zoom);
  const bubbleY = Math.round(offsetY + (ch.y + sittingOff - BUBBLE_OFFSET_Y) * zoom);

  // Measure text
  const fontSize = Math.max(6, Math.round(5 * zoom));
  ctx.font = `${fontSize}px monospace`;
  const metrics = ctx.measureText(text);
  const tw = metrics.width;
  const pad = 4 * zoom;
  const bw = tw + pad * 2;
  const bh = fontSize + pad * 2;

  // Background — color by column (matches mc-board COLUMN_COLORS)
  const bubbleColors: Record<string, string> = {
    "backlog": "#c084fc",
    "in-progress": "#60a5fa",
    "in-review": "#fb923c",
  };
  ctx.fillStyle = ch.isActive ? (bubbleColors[ch.column] ?? "#60a5fa") : "#3f3f46";
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

      // Right room decor + bookshelves (in-review zone)
      { uid: "pl2", type: "LARGE_PLANT", col: 14, row: 9 },
      { uid: "ct1", type: "COFFEE_TABLE", col: 12, row: 5 },
      { uid: "cf1", type: "COFFEE", col: 13, row: 5 },
      { uid: "wb1", type: "WHITEBOARD", col: 10, row: 1 },
      { uid: "cl1", type: "CLOCK", col: 14, row: 1 },
      { uid: "bs2", type: "DOUBLE_BOOKSHELF", col: 12, row: 1 },
      { uid: "bs3", type: "BOOKSHELF", col: 9, row: 1 },
    ],
  };
}


// Load all assets
export async function initOffice(
  layoutOrNull?: OfficeLayout | null
): Promise<OfficeState> {
  const layout = layoutOrNull ?? getDefaultLayout();
  // Sanitize: convert any old SPAWN_ZONE (10) or unknown tile values back to FLOOR_1
  const KNOWN_TILES = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 255]);
  for (let i = 0; i < layout.tiles.length; i++) {
    if (!KNOWN_TILES.has(layout.tiles[i])) {
      layout.tiles[i] = TileType.FLOOR_1;
    }
  }
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

  // Build zone waypoints from furniture positions
  const walkableSet = new Set(walkable.map(w => `${w.col},${w.row}`));
  function nearbyWalkable(col: number, row: number, radius: number): { col: number; row: number }[] {
    const pts: { col: number; row: number }[] = [];
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const key = `${col + dc},${row + dr}`;
        if (walkableSet.has(key)) pts.push({ col: col + dc, row: row + dr });
      }
    }
    return pts;
  }

  const zoneWaypoints: Record<Zone, { col: number; row: number }[]> = {
    desk: [],
    lounge: [],
    books: [],
  };

  for (const item of layout.furniture) {
    const t = item.type;
    if (t.startsWith("SOFA") || t === "COFFEE_TABLE" || t === "CUSHIONED_BENCH") {
      zoneWaypoints.lounge.push(...nearbyWalkable(item.col, item.row, 2));
    } else if (t.startsWith("DOUBLE_BOOKSHELF") || t.startsWith("BOOKSHELF")) {
      zoneWaypoints.books.push(...nearbyWalkable(item.col, item.row, 2));
    }
  }
  // Desk zone = walkable tiles near chairs (seats)
  for (const seat of seats) {
    zoneWaypoints.desk.push(...nearbyWalkable(seat.col, seat.row, 1));
  }

  // Auto-generate stand spots near bookshelves for the "books" zone
  const autoBookSpots: Seat[] = [];
  for (const item of layout.furniture) {
    const t = item.type;
    if (!t.startsWith("BOOKSHELF") && !t.startsWith("DOUBLE_BOOKSHELF")) continue;
    // Find a walkable tile directly in front of (below) the bookshelf
    const candidates = [
      { col: item.col, row: item.row + 1 },
      { col: item.col + 1, row: item.row + 1 },
      { col: item.col, row: item.row + 2 },
    ];
    for (const c of candidates) {
      if (walkableSet.has(`${c.col},${c.row}`)) {
        autoBookSpots.push({
          uid: `auto-book-${item.uid}-${c.col}-${c.row}`,
          col: c.col,
          row: c.row,
          facingDir: Direction.UP,
          action: "stand",
          assigned: false,
          assignedTo: null,
        });
        break;
      }
    }
  }
  seats.push(...autoBookSpots);

  // Deduplicate
  for (const zone of Object.keys(zoneWaypoints) as Zone[]) {
    const seen = new Set<string>();
    zoneWaypoints[zone] = zoneWaypoints[zone].filter(p => {
      const k = `${p.col},${p.row}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  return {
    layout,
    characters: [],
    seats,
    blocked,
    walkable,
    spawnTiles: [],  // populated later via setSpawnPoints()
    zoneWaypoints,
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

/** Determine which zone a seat belongs to based on proximity to zoneWaypoints */
function seatZone(state: OfficeState, seatId: string): Zone | null {
  const seat = state.seats.find(s => s.uid === seatId);
  if (!seat) return null;
  // Check exact match first, then proximity (within 2 tiles)
  for (const [zone, wps] of Object.entries(state.zoneWaypoints) as [Zone, { col: number; row: number }[]][]) {
    if (wps.some(w => w.col === seat.col && w.row === seat.row)) return zone;
  }
  for (const [zone, wps] of Object.entries(state.zoneWaypoints) as [Zone, { col: number; row: number }[]][]) {
    if (wps.some(w => Math.abs(w.col - seat.col) + Math.abs(w.row - seat.row) <= 2)) return zone;
  }
  return null;
}

/** Find a free seat within a specific zone (exact or nearby) */
function findFreeSeatInZone(state: OfficeState, zone: Zone, charCol?: number, charRow?: number): Seat | undefined {
  const wps = state.zoneWaypoints[zone];
  const candidates = state.seats.filter(s => {
    if (s.assigned) return false;
    // Exact match
    if (wps.some(w => w.col === s.col && w.row === s.row)) return true;
    // Proximity (within 2 tiles of any zone waypoint)
    if (wps.some(w => Math.abs(w.col - s.col) + Math.abs(w.row - s.row) <= 2)) return true;
    return false;
  });
  if (candidates.length === 0) {
    // Fallback: any free seat
    return state.seats.find(s => !s.assigned);
  }
  if (charCol === undefined || charRow === undefined) return candidates[0];
  // Pick closest seat to the character
  candidates.sort((a, b) => {
    const da = Math.abs(a.col - charCol) + Math.abs(a.row - charRow);
    const db = Math.abs(b.col - charCol) + Math.abs(b.row - charRow);
    return da - db;
  });
  return candidates[0];
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

  // Add or update characters for agents
  for (const agent of agents) {
    const zone = columnToZone(agent.column);

    if (existingIds.has(agent.worker)) {
      // Update existing character
      const ch = state.characters.find((c) => c.id === agent.worker)!;
      ch.isActive = true;
      ch.cardId = agent.cardId;
      ch.column = agent.column;
      ch.label = agent.cardId;
      ch.bubbleText = agent.cardId;
      ch.bubbleTimer = 10;

      // If column changed, release old seat and reassign
      const oldZone = ch.seatId ? seatZone(state, ch.seatId) : null;
      if (ch.seatId && oldZone !== zone) {
        const oldSeat = state.seats.find(s => s.uid === ch.seatId);
        if (oldSeat) { oldSeat.assigned = false; oldSeat.assignedTo = null; }
        ch.seatId = null;
        ch.state = CharacterState.IDLE;
      }
      // Assign a seat in the correct zone if needed
      if (!ch.seatId) {
        const freeSeat = findFreeSeatInZone(state, zone, ch.tileCol, ch.tileRow);
        if (freeSeat) {
          freeSeat.assigned = true;
          freeSeat.assignedTo = agent.worker;
          ch.seatId = freeSeat.uid;
          ch.state = CharacterState.IDLE;
        }
      }
      continue;
    }

    // Create new character
    if (state.baseSprites.length === 0) continue;

    const idx = state.characters.length;
    const baseIdx = idx % state.baseSprites.length;
    // Use character sprites as-is — each char file has unique art, no hue shift needed
    const sprites = state.baseSprites[baseIdx];

    // Spawn priority: painted spawn zones > zone waypoints > all walkable
    const zoneWps = state.zoneWaypoints[zone];
    const spawnPool = state.spawnTiles.length > 0
      ? state.spawnTiles
      : zoneWps.length > 0
        ? zoneWps
        : state.walkable;
    const fallback = state.walkable.length > 0
      ? state.walkable[Math.floor(Math.random() * state.walkable.length)]
      : { col: 5, row: 5 };
    const spawn = spawnPool.length > 0
      ? spawnPool[Math.floor(Math.random() * spawnPool.length)]
      : fallback;

    const ch = createCharacter(
      agent.worker,
      agent.worker,
      sprites,
      idx,
      spawn.col,
      spawn.row
    );
    ch.isActive = true;
    ch.cardId = agent.cardId;
    ch.column = agent.column;
    ch.label = agent.cardId;
    ch.bubbleText = agent.cardId;
    ch.bubbleTimer = 10;

    // Assign a seat in the character's zone
    {
      const freeSeat = findFreeSeatInZone(state, zone, spawn.col, spawn.row);
      if (freeSeat) {
        freeSeat.assigned = true;
        freeSeat.assignedTo = agent.worker;
        ch.seatId = freeSeat.uid;
      }
    }

    state.characters.push(ch);
  }

  // Remove inactive characters immediately — no ghosts
  state.characters = state.characters.filter((ch) => {
    if (ch.isActive) return true;
    // Free the seat
    const seat = state.seats.find((s) => s.assignedTo === ch.id);
    if (seat) { seat.assigned = false; seat.assignedTo = null; }
    return false;
  });
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + "…";
}

/** Rotate sprite data 90° clockwise */
function rotateSpriteData90(sd: SpriteData): SpriteData {
  const h = sd.length;
  const w = sd[0]?.length ?? 0;
  const result: SpriteData = [];
  for (let c = 0; c < w; c++) {
    const row: string[] = [];
    for (let r = h - 1; r >= 0; r--) {
      row.push(sd[r][c] ?? "");
    }
    result.push(row);
  }
  return result;
}

/** Load a furniture sprite into the state if not already loaded. */
export async function ensureFurnitureLoaded(state: OfficeState, type: string): Promise<void> {
  if (state.furnitureSprites.has(type)) return;
  const baseType = type.replace(/:left$/, "");
  // Bookshelf SIDE variants reuse the front image
  const imgType = (baseType === "BOOKSHELF_SIDE" || baseType === "DOUBLE_BOOKSHELF_SIDE")
    ? baseType.replace(/_SIDE$/, "") : baseType;
  const parts = imgType.split("_");
  const folderGuesses = new Set<string>();
  folderGuesses.add(imgType);
  if (parts.length >= 3) folderGuesses.add(parts.slice(0, 2).join("_"));
  folderGuesses.add(parts[0]);

  for (const fg of folderGuesses) {
    try {
      const p = `/pixel-office/assets/furniture/${fg}/${imgType}.png`;
      const img = await loadTileImage(p);
      state.furnitureImages.set(type, img);
      let sd = extractSpriteData(img, 0, 0, img.naturalWidth, img.naturalHeight);
      // Rotate 90° for SIDE variants, flip for :left
      if (baseType !== imgType) {
        sd = rotateSpriteData90(sd);
      }
      if (type.endsWith(":left")) {
        sd = sd.map((row) => [...row].reverse());
      }
      state.furnitureSprites.set(type, sd);
      return;
    } catch { continue; }
  }
}

export function centerView(
  state: OfficeState,
  canvasWidth: number,
  canvasHeight: number
): void {
  const { cols, rows, tiles } = state.layout;

  // Find content bounds (skip void/wall-only rows/cols)
  let minR = rows, maxR = 0, minC = cols, maxC = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = tiles[r * cols + c];
      if (t !== 0 && t !== 255) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  // Add 1-tile padding
  minR = Math.max(0, minR - 1);
  minC = Math.max(0, minC - 1);
  maxR = Math.min(rows - 1, maxR + 1);
  maxC = Math.min(cols - 1, maxC + 1);

  const contentW = (maxC - minC + 1) * TILE_SIZE;
  const contentH = (maxR - minR + 1) * TILE_SIZE;

  // Auto-zoom to fit within the canvas without clipping
  if (canvasWidth > 0 && canvasHeight > 0 && contentW > 0 && contentH > 0) {
    state.zoom = Math.min(canvasWidth / contentW, canvasHeight / contentH) * 0.9;
  }

  const scaledW = contentW * state.zoom;
  const scaledH = contentH * state.zoom;
  const TOP_MARGIN = 120;
  state.offsetX = Math.round((canvasWidth - scaledW) / 2) - minC * TILE_SIZE * state.zoom;
  state.offsetY = Math.max(TOP_MARGIN, Math.round((canvasHeight - scaledH) / 2)) - minR * TILE_SIZE * state.zoom;
}

interface SpotData {
  col: number;
  row: number;
  facing: string;
  action: string;
}

/** Apply user-defined zone map and spots, overriding furniture-based zones/seats. */
export function applyZoneMap(
  state: OfficeState,
  zoneMap: Record<string, string>,
  spotsData?: SpotData[],
  spawnPoints?: { col: number; row: number }[]
): void {
  const COLUMN_TO_ZONE: Record<string, Zone> = {
    "in-progress": "desk",
    "backlog": "lounge",
    "in-review": "books",
  };
  const FACING_TO_DIR: Record<string, Direction> = {
    up: Direction.UP,
    down: Direction.DOWN,
    left: Direction.LEFT,
    right: Direction.RIGHT,
  };

  const zoneWaypoints: Record<Zone, { col: number; row: number }[]> = {
    desk: [],
    lounge: [],
    books: [],
  };
  for (const [key, column] of Object.entries(zoneMap)) {
    const zone = COLUMN_TO_ZONE[column];
    if (!zone) continue;
    const [col, row] = key.split(",").map(Number);
    zoneWaypoints[zone].push({ col, row });
  }
  if (Object.keys(zoneMap).length > 0) {
    state.zoneWaypoints = zoneWaypoints;
  }

  // Apply user-defined spots as seats, replacing auto-detected ones
  if (spotsData && spotsData.length > 0) {
    // Release all existing seat assignments
    for (const seat of state.seats) {
      seat.assigned = false;
      seat.assignedTo = null;
    }
    state.seats = spotsData.map((s, i) => ({
      uid: `user-spot-${i}`,
      col: s.col,
      row: s.row - 1,  // Character tileRow is top of 2-tile sprite; shift up 1 so body aligns with chair
      facingDir: FACING_TO_DIR[s.facing] ?? Direction.DOWN,
      action: (s.action === "stand" ? "stand" : "sit") as "sit" | "stand",
      assigned: false,
      assignedTo: null,
    }));
    // Reset character seat assignments since seats changed
    for (const ch of state.characters) {
      ch.seatId = null;
      ch.state = CharacterState.IDLE;
    }
  }

  // Apply spawn points (filter to walkable only)
  if (spawnPoints && spawnPoints.length > 0) {
    state.spawnTiles = spawnPoints.filter((sp) =>
      !state.blocked.has(`${sp.col},${sp.row}`) &&
      state.walkable.some((w) => w.col === sp.col && w.row === sp.row)
    );
  }
}

/** Hit-test: returns the cardId of the character whose bubble was clicked, or null. */
export function hitTestBubble(
  state: OfficeState,
  canvasX: number,
  canvasY: number,
  ctx: CanvasRenderingContext2D
): string | null {
  const { zoom, offsetX, offsetY } = state;
  for (const ch of state.characters) {
    if (!ch.isActive || !ch.cardId) continue;
    const text = ch.bubbleText || ch.label || ch.name;
    if (!text) continue;

    const sittingOff = (ch.state === CharacterState.TYPE || ch.state === CharacterState.READ || ch.state === CharacterState.SIT_IDLE) ? SITTING_OFFSET : 0;
    const bubbleX = Math.round(offsetX + ch.x * zoom);
    const bubbleY = Math.round(offsetY + (ch.y + sittingOff - BUBBLE_OFFSET_Y) * zoom);

    const fontSize = Math.max(8, Math.round(8 * zoom));
    ctx.font = `bold ${fontSize}px monospace`;
    const tw = ctx.measureText(text).width;
    const pad = 4 * zoom;
    const bw = tw + pad * 2;
    const bh = fontSize + pad * 2;
    const rx = bubbleX - bw / 2;
    const ry = bubbleY - bh;

    if (canvasX >= rx && canvasX <= rx + bw && canvasY >= ry && canvasY <= ry + bh) {
      return ch.cardId;
    }
  }
  return null;
}
