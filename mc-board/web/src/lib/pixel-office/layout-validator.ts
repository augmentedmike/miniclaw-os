// Layout validator — checks a layout against zone requirements
// Ensures enough seats, furniture in bounds, and walkable space

import { TileType, OfficeLayout } from "./types";
import { FURNITURE_DB, getFurnitureInfo, buildSeats, buildBlockedTiles } from "./engine";

export interface ZoneConfig {
  name: string;
  max_concurrency: number;
}

export interface ValidationError {
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validate a layout, optionally against zone seat requirements.
 *
 * Checks:
 * 1. All furniture is within grid bounds
 * 2. At least one walkable tile exists
 * 3. Enough chair/seats for each zone's max_concurrency (if zones provided)
 */
export function validateLayout(
  layout: OfficeLayout,
  zones?: ZoneConfig[]
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const { cols, rows, tiles, furniture } = layout;

  // Basic structure checks
  if (cols <= 0 || rows <= 0) {
    errors.push({
      code: "INVALID_DIMENSIONS",
      message: `Layout dimensions must be positive (got ${cols}x${rows})`,
    });
    return { valid: false, errors, warnings };
  }

  if (tiles.length !== cols * rows) {
    errors.push({
      code: "TILE_COUNT_MISMATCH",
      message: `Expected ${cols * rows} tiles but got ${tiles.length}`,
    });
    return { valid: false, errors, warnings };
  }

  // Check all furniture is within bounds
  for (const item of furniture) {
    const info = getFurnitureInfo(item.type);
    const rightEdge = item.col + info.footprintW;
    const bottomEdge = item.row + info.footprintH;

    if (item.col < 0 || item.row < 0 || rightEdge > cols || bottomEdge > rows) {
      errors.push({
        code: "FURNITURE_OUT_OF_BOUNDS",
        message: `"${item.type}" (uid: ${item.uid}) at (${item.col},${item.row}) extends outside the ${cols}x${rows} grid`,
      });
    }
  }

  // Check furniture is not placed on wall/void tiles (unless it has backgroundTiles)
  for (const item of furniture) {
    const info = getFurnitureInfo(item.type);
    const bg = info.backgroundTiles ?? 0;
    for (let dr = 0; dr < info.footprintH; dr++) {
      for (let dc = 0; dc < info.footprintW; dc++) {
        const c = item.col + dc;
        const r = item.row + dr;
        if (c >= 0 && c < cols && r >= 0 && r < rows) {
          const tileVal = tiles[r * cols + c];
          // Background rows of furniture can be on walls (e.g. bookshelves)
          if (dr < bg) continue;
          if (tileVal === TileType.WALL || tileVal === TileType.VOID) {
            warnings.push({
              code: "FURNITURE_ON_WALL",
              message: `"${item.type}" (uid: ${item.uid}) overlaps a wall/void tile at (${c},${r})`,
            });
          }
        }
      }
    }
  }

  // Check at least one walkable tile
  const blocked = buildBlockedTiles(furniture);
  let walkableCount = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = tiles[r * cols + c];
      if (
        t !== TileType.WALL &&
        t !== TileType.VOID &&
        !blocked.has(`${c},${r}`)
      ) {
        walkableCount++;
      }
    }
  }

  if (walkableCount === 0) {
    errors.push({
      code: "NO_WALKABLE_TILES",
      message: "Layout has no walkable tiles — agents cannot move",
    });
  }

  // Check seat counts against zone requirements
  if (zones && zones.length > 0) {
    const seats = buildSeats(furniture);
    const totalSeats = seats.length;
    const totalRequired = zones.reduce((sum, z) => sum + z.max_concurrency, 0);

    if (totalSeats < totalRequired) {
      errors.push({
        code: "INSUFFICIENT_SEATS",
        message: `Layout has ${totalSeats} seats but zones require at least ${totalRequired} (${zones.map((z) => `${z.name}:${z.max_concurrency}`).join(", ")})`,
      });
    }

    // Warn if seats are tight
    if (totalSeats === totalRequired && totalSeats > 0) {
      warnings.push({
        code: "SEATS_AT_CAPACITY",
        message: `Layout has exactly ${totalSeats} seats for ${totalRequired} required — no room for overflow`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
