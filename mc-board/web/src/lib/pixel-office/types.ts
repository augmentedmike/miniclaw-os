// Pixel Office – Type definitions
// Extracted from pixel-agents (MIT) and adapted for MiniClaw

export const TILE_SIZE = 16;

export enum TileType {
  WALL = 0,
  FLOOR_1 = 1, FLOOR_2 = 2, FLOOR_3 = 3, FLOOR_4 = 4, FLOOR_5 = 5,
  FLOOR_6 = 6, FLOOR_7 = 7, FLOOR_8 = 8, FLOOR_9 = 9,
  VOID = 255,
}

export enum Direction { DOWN = 0, UP = 1, RIGHT = 2, LEFT = 3 }

export enum CharacterState { IDLE = 0, WALK = 1, TYPE = 2, READ = 3, SIT_IDLE = 4 }

export type SpriteData = string[][]; // 2D array of hex color strings ('' = transparent)

export interface CharacterSprites {
  down: SpriteData[];
  up: SpriteData[];
  right: SpriteData[];
  left: SpriteData[];
  sitIdle: SpriteData[]; // sit idle frames (direction-independent)
}

export interface Character {
  id: string;
  name: string;
  label: string; // current task label for speech bubble
  x: number;
  y: number;
  tileCol: number;
  tileRow: number;
  state: CharacterState;
  dir: Direction;
  frame: number;
  frameTimer: number;
  sprites: CharacterSprites;
  path: { col: number; row: number }[];
  moveProgress: number;
  wanderTimer: number;
  wanderCount: number;
  seatId: string | null;
  seatTimer: number;
  isActive: boolean;
  cardId: string | null;
  column: string;
  bubbleText: string | null;
  bubbleTimer: number;
  paletteIndex: number;
  inactiveTimer?: number;
}

export interface PlacedFurniture {
  uid: string;
  type: string;
  col: number;
  row: number;
}

export interface OfficeLayout {
  version: number;
  cols: number;
  rows: number;
  tiles: number[];
  furniture: PlacedFurniture[];
  tileColors?: (FloorColor | null)[];
}

export interface FloorColor {
  h: number;
  s: number;
  b: number;
  c: number;
  colorize?: boolean;
}

export interface Seat {
  uid: string;
  col: number;
  row: number;
  facingDir: Direction;
  action: "sit" | "stand";
  assigned: boolean;
  assignedTo: string | null;
}

export interface FurnitureCatalogEntry {
  type: string;
  label: string;
  footprintW: number;
  footprintH: number;
  isDesk: boolean;
  category?: string;
  orientation?: string;
  backgroundTiles?: number;
  canPlaceOnWalls?: boolean;
  canPlaceOnSurfaces?: boolean;
}

export interface ActiveAgent {
  cardId: string;
  title: string;
  worker: string;
  column: string;
  pickedUpAt: string;
}
