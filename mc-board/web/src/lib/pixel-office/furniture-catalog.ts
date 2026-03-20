// Furniture catalog — rotation groups and categorized browsing
// Derived from the FURNITURE_DB in engine.ts

import { FURNITURE_DB, getFurnitureInfo } from "./engine";

export type FurnitureCategory =
  | "desks"
  | "chairs"
  | "seating"
  | "wall_decor"
  | "plants"
  | "tables"
  | "misc";

interface RotationGroup {
  base: string;
  variants: string[];
}

/**
 * ROTATION_GROUPS maps a base furniture name to all its orientation variants.
 * e.g. "DESK" -> ["DESK_FRONT", "DESK_SIDE"]
 *      "WOODEN_CHAIR" -> ["WOODEN_CHAIR_FRONT", "WOODEN_CHAIR_BACK", "WOODEN_CHAIR_SIDE", "WOODEN_CHAIR_SIDE:left"]
 */
export const ROTATION_GROUPS: Record<string, string[]> = buildRotationGroups();

function buildRotationGroups(): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  const keys = Object.keys(FURNITURE_DB);

  // Orientation suffixes that indicate a rotation variant
  const orientationSuffixes = ["_FRONT", "_BACK", "_SIDE", "_SIDE:left"];

  for (const key of keys) {
    // Check if this key ends with a known orientation suffix
    let matched = false;
    for (const suffix of orientationSuffixes) {
      if (key.endsWith(suffix)) {
        const base = key.slice(0, key.length - suffix.length);
        if (!groups[base]) groups[base] = [];
        if (!groups[base].includes(key)) groups[base].push(key);
        matched = true;
        break;
      }
    }

    // Items like PC_FRONT_ON_1, PC_SIDE — group by shared prefix pattern
    if (!matched && key.startsWith("PC_")) {
      if (!groups["PC"]) groups["PC"] = [];
      if (!groups["PC"].includes(key)) groups["PC"].push(key);
      matched = true;
    }

    // Standalone items (no orientation) are their own group
    if (!matched) {
      if (!groups[key]) groups[key] = [];
      if (!groups[key].includes(key)) groups[key].push(key);
    }
  }

  return groups;
}

/**
 * Given a furniture type, return the next rotation variant.
 * Cycles through the rotation group for that piece.
 */
export function getNextRotation(currentType: string): string {
  for (const variants of Object.values(ROTATION_GROUPS)) {
    const idx = variants.indexOf(currentType);
    if (idx !== -1) {
      return variants[(idx + 1) % variants.length];
    }
  }
  // No group found — return the same type
  return currentType;
}

interface CatalogEntry {
  type: string;
  footprintW: number;
  footprintH: number;
  isChair: boolean;
  isDesk: boolean;
}

function categorize(type: string): FurnitureCategory {
  const info = getFurnitureInfo(type);

  if (info.isDesk) return "desks";
  if (info.isChair) return "chairs";

  // Seating: sofas, benches
  if (
    type.startsWith("SOFA") ||
    type.includes("BENCH") ||
    type.includes("CUSHIONED_BENCH")
  ) {
    return "seating";
  }

  // Wall decor: paintings, whiteboard, clock, bookshelf, hanging plants
  if (
    type.includes("PAINTING") ||
    type.includes("WHITEBOARD") ||
    type.includes("CLOCK") ||
    type.includes("BOOKSHELF") ||
    type === "HANGING_PLANT"
  ) {
    return "wall_decor";
  }

  // Plants
  if (
    type.startsWith("PLANT") ||
    type === "LARGE_PLANT" ||
    type === "CACTUS" ||
    type === "POT"
  ) {
    return "plants";
  }

  // Tables
  if (
    type.includes("TABLE") ||
    type === "COFFEE"
  ) {
    return "tables";
  }

  return "misc";
}

/**
 * Return the full furniture catalog grouped by category.
 * Each group uses the first variant from each rotation group as the representative.
 */
export function getGroupedCatalog(): Record<FurnitureCategory, CatalogEntry[]> {
  const result: Record<FurnitureCategory, CatalogEntry[]> = {
    desks: [],
    chairs: [],
    seating: [],
    wall_decor: [],
    plants: [],
    tables: [],
    misc: [],
  };

  for (const [_base, variants] of Object.entries(ROTATION_GROUPS)) {
    // Use the first variant as representative
    const rep = variants[0];
    const info = getFurnitureInfo(rep);
    const category = categorize(rep);

    result[category].push({
      type: rep,
      footprintW: info.footprintW,
      footprintH: info.footprintH,
      isChair: info.isChair,
      isDesk: info.isDesk,
    });
  }

  return result;
}
