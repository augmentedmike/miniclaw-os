"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { OfficeLayout, PlacedFurniture } from "@/lib/pixel-office/types";
import { TILE_SIZE, TileType } from "@/lib/pixel-office/types";
import {
  initOffice,
  renderOffice,
  centerView,
  FURNITURE_DB,
  getFurnitureInfo,
  ensureFurnitureLoaded,
  type OfficeState,
} from "@/lib/pixel-office/engine";
import { getCachedSprite } from "@/lib/pixel-office/sprites";

type EditorMode = "tile" | "furniture" | "erase" | "hand" | "select" | "component" | "spawn" | "zone";
type Layer = "floor" | "walls" | "furniture" | "objects" | "zones";
type ZoneType = "in-progress" | "backlog" | "in-review";
type Facing = "up" | "down" | "left" | "right";
type SpotAction = "sit" | "stand";

interface ZoneSpot {
  col: number;
  row: number;
  facing: Facing;
  action: SpotAction;
}

const ZONE_COLORS: Record<ZoneType, string> = {
  "in-progress": "rgba(96, 165, 250, 0.45)",
  "backlog": "rgba(192, 132, 252, 0.45)",
  "in-review": "rgba(251, 146, 60, 0.45)",
};

const ZONE_DEFAULT_ACTION: Record<ZoneType, SpotAction> = {
  "in-progress": "sit",
  "backlog": "sit",
  "in-review": "stand",
};

const FACING_ARROWS: Record<Facing, string> = {
  up: "↑", down: "↓", left: "←", right: "→",
};

interface FurnitureComponent {
  name: string;
  items: { type: string; dx: number; dy: number }[];
}

// Saved components persist in localStorage
function loadComponents(): FurnitureComponent[] {
  try { return JSON.parse(localStorage.getItem("office-components") ?? "[]"); } catch { return []; }
}
function saveComponents(comps: FurnitureComponent[]) {
  localStorage.setItem("office-components", JSON.stringify(comps));
}

/** Try multiple image paths, show first that loads. Apply transform for variants. */
function FurnitureImg({ candidates, alt, transform }: { candidates: string[]; alt: string; transform?: string }) {
  const [idx, setIdx] = useState(0);
  if (idx >= candidates.length) return <span style={{ color: "#52525b", fontSize: 8 }}>{alt.split("_").pop()}</span>;
  return (
    <img
      src={candidates[idx]}
      alt={alt}
      style={{ width: "100%", height: "100%", objectFit: "contain", imageRendering: "pixelated", transform }}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}

/** Get CSS transform for a furniture type based on its variant */
function furnitureTransform(type: string): string | undefined {
  // Bookshelf side variants: right = rotate 90°, left = rotate -90°
  if (type === "BOOKSHELF_SIDE") return "rotate(90deg)";
  if (type === "BOOKSHELF_SIDE:left") return "rotate(-90deg)";
  if (type === "DOUBLE_BOOKSHELF_SIDE") return "rotate(90deg)";
  if (type === "DOUBLE_BOOKSHELF_SIDE:left") return "rotate(-90deg)";
  // Other :left variants are mirrored
  if (type.endsWith(":left")) return "scaleX(-1)";
  return undefined;
}

interface Props {
  onClose: () => void;
}

// Tile palette entries
const TILE_PALETTE: { label: string; value: number; key: string; color: string }[] = [
  { label: "Wall", value: TileType.WALL, key: "W", color: "#2d2d44" },
  { label: "Floor 1", value: TileType.FLOOR_1, key: "1", color: "#3d3d5c" },
  { label: "Floor 2", value: TileType.FLOOR_2, key: "2", color: "#4a3d5c" },
  { label: "Floor 3", value: TileType.FLOOR_3, key: "3", color: "#3d4a5c" },
  { label: "Floor 4", value: TileType.FLOOR_4, key: "4", color: "#5c3d4a" },
  { label: "Floor 5", value: TileType.FLOOR_5, key: "5", color: "#4a5c3d" },
  { label: "Floor 6", value: TileType.FLOOR_6, key: "6", color: "#5c4a3d" },
  { label: "Floor 7", value: TileType.FLOOR_7, key: "7", color: "#3d5c4a" },
  { label: "Floor 8", value: TileType.FLOOR_8, key: "8", color: "#5c3d3d" },
  { label: "Floor 9", value: TileType.FLOOR_9, key: "9", color: "#3d3d3d" },
  { label: "Void", value: TileType.VOID, key: "V", color: "#1a1a2e" },
];

// Group furniture by category
function buildFurnitureCategories(): Record<string, string[]> {
  const cats: Record<string, string[]> = {};
  for (const type of Object.keys(FURNITURE_DB)) {
    const base = type.replace(/:left$/, "");
    const parts = base.split("_");
    let cat: string;
    if (parts.length >= 3) {
      cat = parts.slice(0, 2).join(" ");
    } else if (parts.length === 2) {
      cat = parts[0];
    } else {
      cat = "Misc";
    }
    cat = cat.charAt(0) + cat.slice(1).toLowerCase();
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(type);
  }
  return cats;
}

const FURNITURE_CATEGORIES = buildFurnitureCategories();

// Split into furniture (structural) vs objects (decorative/small)
const OBJECT_TYPES = new Set([
  "PLANT", "PLANT_2", "LARGE_PLANT", "CACTUS", "HANGING_PLANT",
  "BIN", "COFFEE", "POT",
  "SMALL_PAINTING", "SMALL_PAINTING_2", "LARGE_PAINTING",
  "CLOCK", "WHITEBOARD",
  "PC_FRONT_ON_1", "PC_FRONT_ON_2", "PC_FRONT_ON_3", "PC_FRONT_OFF",
  "PC_SIDE", "PC_SIDE:left", "PC_BACK",
]);

function isObject(type: string): boolean {
  return OBJECT_TYPES.has(type.replace(/:left$/, ""));
}

const FURNITURE_ITEMS: Record<string, string[]> = {};
const OBJECT_ITEMS: Record<string, string[]> = {};
for (const [cat, items] of Object.entries(FURNITURE_CATEGORIES)) {
  const furn = items.filter((t) => !isObject(t));
  const obj = items.filter((t) => isObject(t));
  if (furn.length > 0) FURNITURE_ITEMS[cat] = furn;
  if (obj.length > 0) OBJECT_ITEMS[cat] = obj;
}

// Rotation map: cycle through related variants
function rotateFurnitureType(type: string): string {
  // Strip :left suffix
  const base = type.replace(/:left$/, "");
  const isLeft = type.endsWith(":left");
  const parts = base.split("_");
  const suffix = parts[parts.length - 1]; // FRONT, SIDE, BACK etc.

  // Build potential variants by replacing the last part
  const prefix = parts.slice(0, -1).join("_");
  const orientations = ["FRONT", "SIDE", "BACK"];

  // Check which orientations exist in FURNITURE_DB
  const available: string[] = [];
  for (const ori of orientations) {
    const candidate = `${prefix}_${ori}`;
    if (FURNITURE_DB[candidate]) available.push(candidate);
    const leftCandidate = `${candidate}:left`;
    if (FURNITURE_DB[leftCandidate]) available.push(leftCandidate);
  }

  if (available.length <= 1) return type;

  const idx = available.indexOf(type);
  if (idx === -1) {
    // Try without :left
    const baseIdx = available.indexOf(base);
    if (baseIdx === -1) return available[0];
    return available[(baseIdx + 1) % available.length];
  }
  return available[(idx + 1) % available.length];
}

function generateUid(): string {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// Tile type color fallbacks (for sidebar swatches and ghost preview)
function tileColor(t: number): string {
  const entry = TILE_PALETTE.find((p) => p.value === t);
  return entry?.color ?? "#3d3d5c";
}

export function OfficePlanner({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<OfficeState | null>(null);

  const spawnPaintAdding = useRef(true);
  const [zoneMap, setZoneMap] = useState<Record<string, ZoneType>>({});
  const [zoneSpots, setZoneSpots] = useState<ZoneSpot[]>([]);
  const [spawnPoints, setSpawnPoints] = useState<{ col: number; row: number }[]>([]);
  const [activeZoneType, setActiveZoneType] = useState<ZoneType>("in-progress");
  const [pendingSeat, setPendingSeat] = useState<{ col: number; row: number } | null>(null);
  const pendingSeatRef = useRef<{ col: number; row: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [layer, setLayer] = useState<Layer>("floor");
  const [mode, setMode] = useState<EditorMode>("tile");
  const [selectedTile, setSelectedTile] = useState<number | null>(TileType.FLOOR_1);
  const [selectedFurniture, setSelectedFurniture] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [layoutName, setLayoutName] = useState("Office-1");
  const [layouts, setLayouts] = useState<string[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [hoveredTile, setHoveredTile] = useState<{ col: number; row: number } | null>(null);
  const [rectStart, setRectStart] = useState<{ col: number; row: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [selectedUids, setSelectedUids] = useState<Set<string>>(new Set());
  const [components, setComponents] = useState<FurnitureComponent[]>(loadComponents);
  const [activeComponent, setActiveComponent] = useState<FurnitureComponent | null>(null);

  const [layout, setLayout] = useState<OfficeLayout | null>(null);
  const [painting, setPainting] = useState(false);
  const [panning, setPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const layoutRef = useRef<OfficeLayout | null>(null);

  // Keep layoutRef in sync
  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === "s") {
          e.preventDefault();
          handleSave();
          return;
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case "e": setMode("erase"); break;
        case "h": setMode("hand"); break;
        case "p": setMode("spawn"); break;
        case "s": if (!e.ctrlKey && !e.metaKey) { setMode("select"); setSelectedUids(new Set()); } break;
        case "g":
          // Group selected furniture into a component
          if (selectedUids.size >= 2) {
            const state = stateRef.current;
            if (state) {
              const items = state.layout.furniture.filter(f => selectedUids.has(f.uid));
              if (items.length >= 2) {
                const minCol = Math.min(...items.map(f => f.col));
                const minRow = Math.min(...items.map(f => f.row));
                const compItems = items.map(f => ({ type: f.type, dx: f.col - minCol, dy: f.row - minRow }));
                const name = prompt("Component name:");
                if (name) {
                  const comp: FurnitureComponent = { name, items: compItems };
                  const updated = [...components, comp];
                  setComponents(updated);
                  saveComponents(updated);
                  setSelectedUids(new Set());
                }
              }
            }
          }
          break;
        case "r":
          if (selectedFurniture) {
            setSelectedFurniture(rotateFurnitureType(selectedFurniture));
          }
          break;
        case "delete":
        case "backspace":
          // Delete selected furniture
          if (selectedUids.size > 0) {
            const state = stateRef.current;
            if (state) {
              state.layout.furniture = state.layout.furniture.filter(f => !selectedUids.has(f.uid));
              setLayout({ ...state.layout });
              setDirty(true);
              setSelectedUids(new Set());
            }
          }
          break;
        // Layer shortcuts
        case "1": setLayer("floor"); setMode("tile"); break;
        case "2": setLayer("walls"); setMode("tile"); setSelectedTile(TileType.WALL); break;
        case "3": setLayer("furniture"); setMode("furniture"); break;
        case "4": setLayer("objects"); setMode("furniture"); break;
        case "5": setLayer("zones"); setMode("zone"); break;
        case "v": setMode("tile"); setSelectedTile(TileType.VOID); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedFurniture]);

  // Load layout list + default to active layout
  useEffect(() => {
    async function loadLayouts() {
      try {
        const resp = await fetch("/api/office/layouts");
        if (resp.ok) {
          const data = await resp.json();
          setLayouts((data.layouts ?? []).map((l: { name: string }) => l.name));
        }
      } catch {}
      try {
        const ar = await fetch("/api/office/layouts/active");
        if (ar.ok) {
          const ad = await ar.json();
          if (ad.active) setLayoutName(ad.active);
        }
      } catch {}
    }
    loadLayouts();
  }, []);

  // Preload sprite when furniture is selected
  useEffect(() => {
    const state = stateRef.current;
    if (!state || !selectedFurniture) return;
    ensureFurnitureLoaded(state, selectedFurniture);
  }, [selectedFurniture]);

  // Load specific layout + init office
  useEffect(() => {
    let cancelled = false;
    async function loadLayout() {
      let layoutData: OfficeLayout | null = null;
      try {
        const resp = await fetch(`/api/office/layouts/${encodeURIComponent(layoutName)}`);
        if (resp.ok) {
          const data = await resp.json();
          layoutData = data.layout ?? data;
        }
      } catch {
        // fallback
      }
      if (!layoutData) {
        // Load the live default layout and auto-save it
        try {
          const resp = await fetch("/pixel-office/assets/default-layout-1.json");
          if (resp.ok) {
            layoutData = await resp.json();
            // Auto-save as the current layout name
            try {
              await fetch(`/api/office/layouts/${encodeURIComponent(layoutName)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(layoutData),
              });
              // Refresh layout list
              const lr = await fetch("/api/office/layouts");
              if (lr.ok) {
                const ld = await lr.json();
                setLayouts((ld.layouts ?? []).map((l: { name: string }) => l.name));
              }
            } catch {}
          }
        } catch {}
      }
      if (cancelled) return;
      const state = await initOffice(layoutData);
      if (cancelled) return;
      stateRef.current = state;
      setLayout({ ...state.layout });
      // Load zones
      try {
        const zr = await fetch("/api/office/zones");
        if (zr.ok) {
          const zd = await zr.json();
          if (zd.zones) setZoneMap(zd.zones);
          if (zd.spots) setZoneSpots(zd.spots);
          if (zd.spawnPoints) setSpawnPoints(zd.spawnPoints);
        }
      } catch {}
      setLoaded(true);
    }
    setLoaded(false);
    loadLayout();
    return () => { cancelled = true; };
  }, [layoutName, reloadKey]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      canvas.width = Math.floor(rect.width);
      canvas.height = Math.floor(rect.height);
      const state = stateRef.current;
      if (state) centerView(state, canvas.width, canvas.height);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Render loop
  useEffect(() => {
    if (!loaded) return;
    let rafId: number;
    const frame = () => {
      const state = stateRef.current;
      const canvas = canvasRef.current;
      if (state && canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          renderOffice(ctx, state);
          const { zoom, offsetX, offsetY } = state;
          const currentLayout = state.layout;
          const sz = TILE_SIZE * zoom;

          // Spawn point overlay (editor only)
          for (const sp of spawnPoints) {
            ctx.fillStyle = "rgba(34, 197, 94, 0.3)";
            ctx.fillRect(offsetX + sp.col * sz, offsetY + sp.row * sz, sz, sz);
          }

          // Zone overlays (always visible in editor)
          for (const [key, zone] of Object.entries(zoneMap)) {
            const [zc, zr] = key.split(",").map(Number);
            ctx.fillStyle = ZONE_COLORS[zone] ?? "rgba(255,255,255,0.2)";
            ctx.fillRect(offsetX + zc * sz, offsetY + zr * sz, sz, sz);
          }

          // Seat markers — colored by zone
          const SEAT_COLORS: Record<string, string> = {
            "in-progress": "#60a5fa",
            "backlog": "#c084fc",
            "in-review": "#fb923c",
          };
          for (const spot of zoneSpots) {
            const sx = offsetX + spot.col * sz;
            const sy = offsetY + spot.row * sz;
            const spotZone = zoneMap[`${spot.col},${spot.row}`];
            const color = SEAT_COLORS[spotZone] ?? "#facc15";
            ctx.fillStyle = color.replace(")", ", 0.3)").replace("rgb", "rgba");
            ctx.fillRect(sx + 1, sy + 1, sz - 2, sz - 2);
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(2, zoom);
            ctx.strokeRect(sx + 2, sy + 2, sz - 4, sz - 4);
            ctx.fillStyle = "#fff";
            const fs = Math.max(12, Math.round(12 * zoom));
            ctx.font = `bold ${fs}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(FACING_ARROWS[spot.facing], sx + sz / 2, sy + sz / 2);
          }

          // Pending seat — pulsing highlight
          if (pendingSeat) {
            const px = offsetX + pendingSeat.col * sz;
            const py = offsetY + pendingSeat.row * sz;
            const alpha = 0.5 + 0.4 * Math.sin(Date.now() / 150);
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = 3;
            ctx.strokeRect(px, py, sz, sz);
            const dirs: [number, number, Facing][] = [[0, -1, "up"], [0, 1, "down"], [-1, 0, "left"], [1, 0, "right"]];
            ctx.font = `bold ${Math.max(16, Math.round(14 * zoom))}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            for (const [dc, dr, facing] of dirs) {
              const nc = pendingSeat.col + dc;
              const nr = pendingSeat.row + dr;
              if (nc >= 0 && nr >= 0 && nc < currentLayout.cols && nr < currentLayout.rows) {
                ctx.fillStyle = `rgba(255, 255, 100, ${alpha})`;
                ctx.fillText(FACING_ARROWS[facing], offsetX + nc * sz + sz / 2, offsetY + nr * sz + sz / 2);
              }
            }
          }

          // Grid overlay
          ctx.strokeStyle = "rgba(255,255,255,0.08)";
          ctx.lineWidth = 1;
          for (let r = 0; r <= currentLayout.rows; r++) {
            const y = offsetY + r * sz;
            ctx.beginPath();
            ctx.moveTo(offsetX, y);
            ctx.lineTo(offsetX + currentLayout.cols * sz, y);
            ctx.stroke();
          }
          for (let c = 0; c <= currentLayout.cols; c++) {
            const x = offsetX + c * sz;
            ctx.beginPath();
            ctx.moveTo(x, offsetY);
            ctx.lineTo(x, offsetY + currentLayout.rows * sz);
            ctx.stroke();
          }

          // Selected furniture highlight
          if (selectedUids.size > 0) {
            for (const furn of currentLayout.furniture) {
              if (!selectedUids.has(furn.uid)) continue;
              const fi = getFurnitureInfo(furn.type);
              const fx = offsetX + furn.col * sz;
              const fy = offsetY + furn.row * sz;
              ctx.strokeStyle = "#facc15";
              ctx.lineWidth = 3;
              ctx.strokeRect(fx - 1, fy - 1, fi.footprintW * sz + 2, fi.footprintH * sz + 2);
            }
          }

          // Component ghost preview
          if (mode === "component" && activeComponent && hoveredTile) {
            ctx.globalAlpha = 0.33;
            for (const item of activeComponent.items) {
              const cx = offsetX + (hoveredTile.col + item.dx) * sz;
              const cy = offsetY + (hoveredTile.row + item.dy) * sz;
              const sd = state.furnitureSprites.get(item.type);
              if (sd) {
                const cached = getCachedSprite(sd, zoom);
                ctx.drawImage(cached, cx, cy);
              } else {
                const fi = getFurnitureInfo(item.type);
                ctx.fillStyle = "#60a5fa";
                ctx.fillRect(cx, cy, fi.footprintW * sz, fi.footprintH * sz);
              }
            }
            ctx.globalAlpha = 1;
          }

          // Rectangle fill preview
          if (rectStart && hoveredTile) {
            const minC = Math.min(rectStart.col, hoveredTile.col);
            const maxC = Math.max(rectStart.col, hoveredTile.col);
            const minR = Math.min(rectStart.row, hoveredTile.row);
            const maxR = Math.max(rectStart.row, hoveredTile.row);
            ctx.globalAlpha = 0.35;
            ctx.fillStyle = "#60a5fa";
            ctx.fillRect(
              offsetX + minC * sz, offsetY + minR * sz,
              (maxC - minC + 1) * sz, (maxR - minR + 1) * sz
            );
            ctx.globalAlpha = 1;
            ctx.strokeStyle = "#60a5fa";
            ctx.lineWidth = 2;
            ctx.strokeRect(
              offsetX + minC * sz, offsetY + minR * sz,
              (maxC - minC + 1) * sz, (maxR - minR + 1) * sz
            );
          }

          // Ghost preview at hovered tile
          if (hoveredTile && mode !== "hand") {
            const hx = offsetX + hoveredTile.col * sz;
            const hy = offsetY + hoveredTile.row * sz;

            if (mode === "tile" && selectedTile !== null) {
              ctx.globalAlpha = 0.5;
              ctx.fillStyle = tileColor(selectedTile);
              ctx.fillRect(hx, hy, sz, sz);
              ctx.globalAlpha = 1;
              ctx.strokeStyle = "rgba(255,255,255,0.4)";
              ctx.lineWidth = 2;
              ctx.strokeRect(hx, hy, sz, sz);
            } else if (mode === "furniture" && selectedFurniture) {
              const info = getFurnitureInfo(selectedFurniture);
              const spriteData = state.furnitureSprites.get(selectedFurniture);

              // Render actual sprite as ghost at 33% opacity
              if (spriteData) {
                const cached = getCachedSprite(spriteData, zoom);
                ctx.globalAlpha = 0.33;
                ctx.drawImage(cached, hx, hy);
                ctx.globalAlpha = 1;
                ctx.strokeStyle = "#22c55e";
                ctx.lineWidth = 2;
                ctx.strokeRect(hx, hy, cached.width, cached.height);
              } else {
                const fw = info.footprintW * sz;
                const fh = info.footprintH * sz;
                ctx.globalAlpha = 0.33;
                ctx.fillStyle = "#22c55e";
                ctx.fillRect(hx, hy, fw, fh);
                ctx.globalAlpha = 1;
              }

            } else if (mode === "erase") {
              ctx.globalAlpha = 0.4;
              ctx.fillStyle = "#ef4444";
              ctx.fillRect(hx, hy, sz, sz);
              ctx.globalAlpha = 1;
              ctx.strokeStyle = "#ef4444";
              ctx.lineWidth = 2;
              ctx.strokeRect(hx, hy, sz, sz);
            }
          }
        }
      }
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [loaded, hoveredTile, mode, selectedTile, selectedFurniture, zoneMap, zoneSpots, pendingSeat, spawnPoints]);

  const canvasToTile = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): { col: number; row: number } | null => {
      const state = stateRef.current;
      const canvas = canvasRef.current;
      if (!state || !canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const { zoom, offsetX, offsetY, layout: l } = state;
      const col = Math.floor((e.clientX - rect.left - offsetX) / (TILE_SIZE * zoom));
      const row = Math.floor((e.clientY - rect.top - offsetY) / (TILE_SIZE * zoom));
      if (col < 0 || row < 0 || col >= l.cols || row >= l.rows) return null;
      return { col, row };
    },
    []
  );

  const applyTilePaint = useCallback(
    (col: number, row: number) => {
      const state = stateRef.current;
      if (!state || selectedTile === null) return;
      const idx = row * state.layout.cols + col;
      if (state.layout.tiles[idx] === selectedTile) return;
      state.layout.tiles[idx] = selectedTile;
      setLayout({ ...state.layout });
      setDirty(true);
    },
    [selectedTile]
  );

  const placeFurniture = useCallback(
    async (col: number, row: number) => {
      const state = stateRef.current;
      if (!state || !selectedFurniture) return;
      const info = getFurnitureInfo(selectedFurniture);

      // Bounds check
      if (col + info.footprintW > state.layout.cols || row + info.footprintH > state.layout.rows) return;

      // Load sprite if not already loaded
      await ensureFurnitureLoaded(state, selectedFurniture);

      const newItem: PlacedFurniture = {
        uid: generateUid(),
        type: selectedFurniture,
        col,
        row,
      };
      state.layout.furniture.push(newItem);
      setLayout({ ...state.layout });
      setDirty(true);
    },
    [selectedFurniture]
  );

  const eraseTile = useCallback(
    (col: number, row: number) => {
      const state = stateRef.current;
      if (!state) return;

      if (layer === "furniture" || layer === "objects") {
        // Only erase furniture/objects on the active layer
        const isObjLayer = layer === "objects";
        const furnIdx = state.layout.furniture.findIndex((f) => {
          if (isObjLayer !== isObject(f.type)) return false;
          const info = getFurnitureInfo(f.type);
          return col >= f.col && col < f.col + info.footprintW && row >= f.row && row < f.row + info.footprintH;
        });
        if (furnIdx !== -1) {
          state.layout.furniture.splice(furnIdx, 1);
          setLayout({ ...state.layout });
          setDirty(true);
        }
      } else if (layer === "floor") {
        // Only erase floor tiles (set to VOID), leave walls alone
        const idx = row * state.layout.cols + col;
        const t = state.layout.tiles[idx];
        if (t !== TileType.VOID && t !== TileType.WALL) {
          state.layout.tiles[idx] = TileType.VOID;
          setLayout({ ...state.layout });
          setDirty(true);
        }
      } else if (layer === "walls") {
        // Only erase wall tiles (set to VOID), check clicked row and row+1 for offset
        const idx = row * state.layout.cols + col;
        const idx1 = (row + 1) * state.layout.cols + col;
        if (state.layout.tiles[idx] === TileType.WALL) {
          state.layout.tiles[idx] = TileType.VOID;
          setLayout({ ...state.layout });
          setDirty(true);
        } else if (row + 1 < state.layout.rows && state.layout.tiles[idx1] === TileType.WALL) {
          state.layout.tiles[idx1] = TileType.VOID;
          setLayout({ ...state.layout });
          setDirty(true);
        }
      }
    },
    [layer]
  );

  const removeFurnitureAt = useCallback(
    (col: number, row: number) => {
      const state = stateRef.current;
      if (!state) return;
      const furnIdx = state.layout.furniture.findIndex((f) => {
        const info = getFurnitureInfo(f.type);
        return col >= f.col && col < f.col + info.footprintW && row >= f.row && row < f.row + info.footprintH;
      });
      if (furnIdx !== -1) {
        state.layout.furniture.splice(furnIdx, 1);
        setLayout({ ...state.layout });
        setDirty(true);
      }
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Middle-click or hand mode = pan
      if (mode === "hand" || e.button === 1) {
        e.preventDefault();
        const state = stateRef.current;
        if (!state) return;
        setPanning(true);
        panStart.current = { x: e.clientX, y: e.clientY, ox: state.offsetX, oy: state.offsetY };
        return;
      }

      // Right-click = delete furniture
      if (e.button === 2) {
        e.preventDefault();
        const tile = canvasToTile(e);
        if (tile) removeFurnitureAt(tile.col, tile.row);
        return;
      }

      const tile = canvasToTile(e);

      // Handle pending seat facing (allow clicking any tile including walls for direction)
      if (pendingSeatRef.current && mode === "zone" && tile) {
        const ps = pendingSeatRef.current;
        const dc = tile.col - ps.col;
        const dr = tile.row - ps.row;
        if (Math.abs(dc) + Math.abs(dr) === 1) {
          const facing: Facing = dr === -1 ? "up" : dr === 1 ? "down" : dc === -1 ? "left" : "right";
          const zone = zoneMap[`${ps.col},${ps.row}`];
          const action: SpotAction = zone ? ZONE_DEFAULT_ACTION[zone] : "sit";
          setZoneSpots((prev) => [
            ...prev.filter((s) => !(s.col === ps.col && s.row === ps.row)),
            { col: ps.col, row: ps.row, facing, action },
          ]);
          setDirty(true);
          pendingSeatRef.current = null;
          pendingSeatRef.current = null; setPendingSeat(null);
          return;
        }
        // Non-adjacent: cancel pending and fall through to paint new zone
        pendingSeatRef.current = null;
        pendingSeatRef.current = null; setPendingSeat(null);
      }

      if (!tile) return;

      if (mode === "tile") {
        if (e.shiftKey) {
          // Start rectangle fill
          setRectStart(tile);
          return;
        }
        applyTilePaint(tile.col, tile.row);
        setPainting(true);
      } else if (mode === "furniture") {
        placeFurniture(tile.col, tile.row);
      } else if (mode === "erase") {
        if (layer === "zones") {
          const key = `${tile.col},${tile.row}`;
          setZoneMap((prev) => { const n = { ...prev }; delete n[key]; return n; });
          setZoneSpots((prev) => prev.filter((s) => !(s.col === tile.col && s.row === tile.row)));
          setSpawnPoints((prev) => prev.filter((sp) => !(sp.col === tile.col && sp.row === tile.row)));
          setDirty(true);
        } else {
          eraseTile(tile.col, tile.row);
        }
        setPainting(true);
      } else if (mode === "select") {
        // Toggle selection of furniture at click position
        const state = stateRef.current;
        if (state) {
          const furn = state.layout.furniture.find((f) => {
            const fi = getFurnitureInfo(f.type);
            return tile.col >= f.col && tile.col < f.col + fi.footprintW && tile.row >= f.row && tile.row < f.row + fi.footprintH;
          });
          if (furn) {
            setSelectedUids((prev) => {
              const next = new Set(prev);
              if (next.has(furn.uid)) next.delete(furn.uid);
              else next.add(furn.uid);
              return next;
            });
          }
        }
      } else if (mode === "spawn") {
        const exists = spawnPoints.some((sp) => sp.col === tile.col && sp.row === tile.row);
        spawnPaintAdding.current = !exists;
        if (exists) {
          setSpawnPoints((prev) => prev.filter((sp) => !(sp.col === tile.col && sp.row === tile.row)));
        } else {
          setSpawnPoints((prev) => [...prev, { col: tile.col, row: tile.row }]);
        }
        setDirty(true);
        setPainting(true);
      } else if (mode === "zone") {
        // Paint zone + start pending seat
        const key = `${tile.col},${tile.row}`;
        setZoneMap((prev) => ({ ...prev, [key]: activeZoneType }));
        const ps = { col: tile.col, row: tile.row };
        pendingSeatRef.current = ps;
        setPendingSeat(ps);
        setDirty(true);
        // Don't set painting=true — next click should be for facing, not drag-painting
      } else if (mode === "component" && activeComponent) {
        // Place all items in the component
        const state = stateRef.current;
        if (state) {
          for (const item of activeComponent.items) {
            const col = tile.col + item.dx;
            const row = tile.row + item.dy;
            if (col >= 0 && row >= 0 && col < state.layout.cols && row < state.layout.rows) {
              ensureFurnitureLoaded(state, item.type);
              state.layout.furniture.push({
                uid: generateUid(),
                type: item.type,
                col,
                row,
              });
            }
          }
          setLayout({ ...state.layout });
          setDirty(true);
        }
      }
    },
    [mode, canvasToTile, applyTilePaint, placeFurniture, eraseTile, removeFurnitureAt, activeComponent, activeZoneType, zoneMap, spawnPoints, layer]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Update hover
      const tile = canvasToTile(e);
      setHoveredTile(tile);

      if (panning && panStart.current) {
        const state = stateRef.current;
        if (!state) return;
        state.offsetX = panStart.current.ox + (e.clientX - panStart.current.x);
        state.offsetY = panStart.current.oy + (e.clientY - panStart.current.y);
        return;
      }
      if (!painting) return;
      if (!tile) return;

      if (mode === "tile") {
        applyTilePaint(tile.col, tile.row);
      } else if (mode === "erase") {
        if (layer === "zones") {
          const key = `${tile.col},${tile.row}`;
          setZoneMap((prev) => { const n = { ...prev }; delete n[key]; return n; });
          setZoneSpots((prev) => prev.filter((s) => !(s.col === tile.col && s.row === tile.row)));
          setDirty(true);
        } else {
          eraseTile(tile.col, tile.row);
        }
      } else if (mode === "spawn") {
        if (spawnPaintAdding.current) {
          setSpawnPoints((prev) => {
            if (prev.some((sp) => sp.col === tile.col && sp.row === tile.row)) return prev;
            return [...prev, { col: tile.col, row: tile.row }];
          });
        } else {
          setSpawnPoints((prev) => prev.filter((sp) => !(sp.col === tile.col && sp.row === tile.row)));
        }
        setDirty(true);
      } else if (mode === "zone") {
        const key = `${tile.col},${tile.row}`;
        setZoneMap((prev) => ({ ...prev, [key]: activeZoneType }));
        setDirty(true);
      }
    },
    [painting, panning, canvasToTile, mode, applyTilePaint, eraseTile, activeZoneType, layer]
  );

  const handleMouseUp = useCallback((e?: React.MouseEvent<HTMLCanvasElement>) => {
    // Complete rectangle fill
    if (rectStart && hoveredTile && selectedTile !== null && mode === "tile") {
      const state = stateRef.current;
      if (state) {
        const minC = Math.min(rectStart.col, hoveredTile.col);
        const maxC = Math.max(rectStart.col, hoveredTile.col);
        const minR = Math.min(rectStart.row, hoveredTile.row);
        const maxR = Math.max(rectStart.row, hoveredTile.row);
        for (let r = minR; r <= maxR; r++) {
          for (let c = minC; c <= maxC; c++) {
            if (c >= 0 && r >= 0 && c < state.layout.cols && r < state.layout.rows) {
              state.layout.tiles[r * state.layout.cols + c] = selectedTile;
            }
          }
        }
        setLayout({ ...state.layout });
        setDirty(true);
      }
      setRectStart(null);
    }
    setPainting(false);
    setPanning(false);
    panStart.current = null;
  }, [rectStart, hoveredTile, selectedTile, mode]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const state = stateRef.current;
    const canvas = canvasRef.current;
    if (!state || !canvas) return;
    const oldZoom = state.zoom;
    const newZoom = Math.max(1, Math.min(10, oldZoom + (e.deltaY > 0 ? -0.3 : 0.3)));
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    state.offsetX = mx - (mx - state.offsetX) * (newZoom / oldZoom);
    state.offsetY = my - (my - state.offsetY) * (newZoom / oldZoom);
    state.zoom = newZoom;
  }, []);

  async function handleSave() {
    const state = stateRef.current;
    if (!state) return;
    setSaving(true);
    try {
      await fetch(`/api/office/layouts/${encodeURIComponent(layoutName)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: state.layout }),
      });
      // Save zones alongside layout
      await fetch("/api/office/zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zones: zoneMap, spots: zoneSpots, spawnPoints }),
      });
      setDirty(false);
      // Refresh layout list
      try {
        const resp = await fetch("/api/office/layouts");
        if (resp.ok) {
          const data = await resp.json();
          setLayouts((data.layouts ?? []).map((l: { name: string }) => l.name));
        }
      } catch {}
    } finally {
      setSaving(false);
    }
  }

  const [activated, setActivated] = useState(false);

  async function handleSetActive() {
    setSaving(true);
    try {
      const resp = await fetch("/api/office/layouts/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: layoutName }),
      });
      if (resp.ok) {
        setActivated(true);
        setTimeout(() => setActivated(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleNew() {
    const name = prompt("New layout name:");
    if (!name || !name.trim()) return;
    setLayoutName(name.trim());
    setDirty(true);
  }

  async function handleDelete() {
    if (!confirm(`Delete layout "${layoutName}"?`)) return;
    try {
      await fetch(`/api/office/layouts/${encodeURIComponent(layoutName)}`, {
        method: "DELETE",
      });
      setLayouts((prev) => prev.filter((n) => n !== layoutName));
      setLayoutName("default");
    } catch {}
  }

  const cursorStyle =
    mode === "hand" || panning
      ? "grab"
      : mode === "select"
        ? "pointer"
        : mode === "component"
          ? "copy"
          : mode === "erase"
            ? "crosshair"
            : mode === "furniture"
          ? "copy"
          : "cell";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0f0f23" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderBottom: "1px solid #27272a",
          background: "#18181b",
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {/* Layout selector */}
        <select
          value={layoutName}
          onChange={(e) => setLayoutName(e.target.value)}
          style={{
            background: "#27272a",
            color: "#e4e4e7",
            border: "1px solid #3f3f46",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 12,
          }}
        >
          {layouts.length === 0 && <option value="default">default</option>}
          {layouts.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          onClick={handleNew}
          style={toolbarBtnStyle(false)}
          title="New layout"
        >
          New
        </button>
        <button
          onClick={handleDelete}
          style={toolbarBtnStyle(false)}
          title="Delete layout"
        >
          Del
        </button>
        <button
          onClick={handleSetActive}
          style={{ ...toolbarBtnStyle(false), background: activated ? "#22c55e" : "#065f46", color: activated ? "#fff" : "#34d399" }}
          title="Set as active layout for the office view"
        >
          {activated ? "Active!" : "Activate"}
        </button>

        <div style={{ width: 1, height: 20, background: "#3f3f46", margin: "0 4px" }} />

        {/* Layer tabs — z-index order */}
        {(["floor", "walls", "furniture", "objects", "zones"] as Layer[]).map((l, i) => {
          const labels: Record<Layer, string> = { floor: "Floor", walls: "Walls", furniture: "Furniture", objects: "Objects", zones: "Zones" };
          const active = layer === l;
          return (
            <button key={l}
              onClick={() => { setLayer(l); setMode(l === "furniture" || l === "objects" ? "furniture" : l === "zones" ? "zone" : "tile"); pendingSeatRef.current = null; setPendingSeat(null); }}
              style={{
                ...toolbarBtnStyle(active),
                borderBottom: active ? "2px solid #60a5fa" : "2px solid transparent",
              }}>
              {i + 1}. {labels[l]}
            </button>
          );
        })}
        <div style={{ width: 1, height: 20, background: "#3f3f46", margin: "0 2px" }} />
        <button onClick={() => setMode("spawn")} style={{
          ...toolbarBtnStyle(mode === "spawn"),
          ...(mode === "spawn" ? { background: "#22c55e33", borderColor: "#22c55e", color: "#22c55e" } : {}),
        }}>
          Spawn [P]
        </button>
        <button onClick={() => setMode("erase")} style={toolbarBtnStyle(mode === "erase")}>
          Erase {layer} [E]
        </button>
        <button onClick={() => { setMode("select"); setSelectedUids(new Set()); }} style={toolbarBtnStyle(mode === "select")}>
          Select [S]
        </button>
        <button onClick={() => setMode("hand")} style={toolbarBtnStyle(mode === "hand")}>
          Pan [H]
        </button>

        <div style={{ flex: 1 }} />

        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          style={{
            background: dirty ? "#3b82f6" : "#27272a",
            border: "none",
            color: dirty ? "#fff" : "#52525b",
            borderRadius: 4,
            padding: "4px 14px",
            cursor: dirty ? "pointer" : "default",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          disabled={!dirty}
          style={{
            background: dirty ? "#27272a" : "#1a1a1a",
            border: "1px solid #3f3f46",
            color: dirty ? "#f87171" : "#52525b",
            borderRadius: 4,
            padding: "4px 10px",
            cursor: dirty ? "pointer" : "default",
            fontSize: 12,
          }}
        >
          Reset
        </button>
        <button
          onClick={onClose}
          style={{
            background: "#27272a",
            border: "1px solid #3f3f46",
            color: "#a1a1aa",
            borderRadius: 4,
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Done
        </button>
      </div>

      {/* Main area: sidebar + canvas */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left sidebar palette */}
        <div
          style={{
            width: 200,
            flexShrink: 0,
            borderRight: "1px solid #27272a",
            background: "#18181b",
            overflowY: "auto",
            padding: "8px",
            fontSize: 11,
          }}
        >
          {mode === "tile" && (layer === "floor" || layer === "walls") && (
            <>
              <div style={{ color: "#71717a", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", fontSize: 10 }}>
                {layer === "floor" ? "Floor Tiles" : "Wall Tiles"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {TILE_PALETTE.filter((entry) => {
                  if (layer === "walls") return entry.value === TileType.WALL || entry.value === TileType.VOID;
                  return entry.value !== TileType.WALL;
                }).map((entry) => (
                  <button
                    key={entry.value}
                    onClick={() => setSelectedTile(entry.value)}
                    title={`${entry.label} [${entry.key}]`}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 4,
                      border: selectedTile === entry.value ? "2px solid #60a5fa" : "1px solid #3f3f46",
                      background: "#09090b",
                      cursor: "pointer",
                      padding: 0,
                      overflow: "hidden",
                      position: "relative",
                    }}
                  >
                    {entry.value === 0 ? (
                      <img src="/pixel-office/assets/walls/wall_0.png" alt="Wall" style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} />
                    ) : entry.value === 255 ? (
                      <span style={{ color: "#52525b", fontSize: 16 }}>X</span>
                    ) : (
                      <img src={`/pixel-office/assets/floors/floor_${entry.value - 1}.png`} alt={entry.label} style={{ width: "100%", height: "100%", imageRendering: "pixelated" }} />
                    )}
                    <span style={{ position: "absolute", bottom: 1, right: 2, fontSize: 8, color: "#fff", textShadow: "0 0 3px #000" }}>{entry.key}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {mode === "furniture" && (layer === "furniture" || layer === "objects") && (
            <>
              <div style={{ color: "#71717a", marginBottom: 6, fontWeight: 600, textTransform: "uppercase", fontSize: 10 }}>
                {layer === "furniture" ? "Furniture" : "Objects"}
              </div>
              {selectedFurniture && (
                <div style={{ marginBottom: 8, padding: "4px 6px", background: "#27272a", borderRadius: 4, fontSize: 10 }}>
                  <span style={{ color: "#60a5fa" }}>{selectedFurniture.replace(/_/g, " ").toLowerCase()}</span>
                  <span style={{ color: "#52525b", marginLeft: 4 }}>R: rotate</span>
                </div>
              )}
              {Object.entries(layer === "objects" ? OBJECT_ITEMS : FURNITURE_ITEMS).map(([cat, items]) => (
                <div key={cat} style={{ marginBottom: 8 }}>
                  <div style={{ color: "#52525b", fontSize: 9, fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>
                    {cat}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {items.map((type) => {
                      const baseType = type.replace(/:left$/, "");
                      // Bookshelf SIDE variants reuse the front image
                      const imgType = (baseType === "BOOKSHELF_SIDE" || baseType === "DOUBLE_BOOKSHELF_SIDE")
                        ? baseType.replace(/_SIDE$/, "") : baseType;
                      const parts = imgType.split("_");
                      const candidates: string[] = [];
                      if (parts.length >= 3) candidates.push(`/pixel-office/assets/furniture/${parts.slice(0, 2).join("_")}/${imgType}.png`);
                      candidates.push(`/pixel-office/assets/furniture/${parts[0]}/${imgType}.png`);
                      candidates.push(`/pixel-office/assets/furniture/${imgType}/${imgType}.png`);
                      const info = getFurnitureInfo(type);
                      return (
                        <button
                          key={type}
                          onClick={() => setSelectedFurniture(type)}
                          title={`${type} (${info.footprintW}x${info.footprintH})`}
                          style={{
                            width: Math.max(40, info.footprintW * 32),
                            height: Math.max(40, info.footprintH * 32),
                            background: selectedFurniture === type ? "#1e3a5f" : "#27272a",
                            border: selectedFurniture === type ? "2px solid #60a5fa" : "1px solid #3f3f46",
                            borderRadius: 4,
                            cursor: "pointer",
                            padding: 2,
                            overflow: "hidden",
                          }}
                        >
                          <FurnitureImg candidates={candidates} alt={type} transform={furnitureTransform(type)} />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}

          {mode === "erase" && layer === "zones" && (
            <div style={{ color: "#71717a", padding: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Eraser — Zones</div>
              <div style={{ fontSize: 10, color: "#52525b", marginBottom: 12 }}>
                Click to erase zones, seats, and spawn points.
              </div>
              <button
                onClick={() => {
                  if (!confirm("Clear ALL zones, seats, and spawn points?")) return;
                  setZoneMap({});
                  setZoneSpots([]);
                  setSpawnPoints([]);
                  pendingSeatRef.current = null; setPendingSeat(null);
                  setDirty(true);
                }}
                style={{
                  background: "#450a0a", border: "1px solid #7f1d1d", color: "#fca5a5",
                  borderRadius: 4, padding: "6px 12px", cursor: "pointer", fontSize: 11, width: "100%",
                }}>
                Clear All Zones
              </button>
            </div>
          )}

          {mode === "erase" && layer !== "zones" && (
            <div style={{ color: "#71717a", padding: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Eraser</div>
              <div style={{ fontSize: 10, color: "#52525b", marginBottom: 12 }}>
                Click to erase furniture or set tile to void.
              </div>
              <button
                onClick={() => {
                  if (!confirm("Erase ALL tiles and furniture? This cannot be undone.")) return;
                  setLayout((prev) => {
                    if (!prev) return prev;
                    const cleared = { ...prev, tiles: prev.tiles.map(() => 255), furniture: [] };
                    const state = stateRef.current;
                    if (state) {
                      state.layout.tiles = cleared.tiles;
                      state.layout.furniture = [];
                    }
                    return cleared;
                  });
                  setDirty(true);
                }}
                style={{
                  background: "#450a0a", border: "1px solid #7f1d1d", color: "#fca5a5",
                  borderRadius: 4, padding: "6px 12px", cursor: "pointer", fontSize: 11, width: "100%",
                }}>
                Erase All
              </button>
            </div>
          )}

          {(mode === "zone" || (layer === "zones" && mode === "spawn")) && (
            <div style={{ color: "#a1a1aa", padding: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 8, color: "#e4e4e7" }}>Zones & Seats</div>

              {/* Zone type buttons */}
              <div style={{ fontSize: 10, color: "#71717a", marginBottom: 4 }}>ZONE TYPE</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                {(["in-progress", "backlog", "in-review"] as ZoneType[]).map((z) => (
                  <button key={z} onClick={() => { setActiveZoneType(z); setMode("zone"); }}
                    style={{
                      background: activeZoneType === z && mode === "zone" ? ZONE_COLORS[z].replace("0.45", "0.7") : "#27272a",
                      border: activeZoneType === z && mode === "zone" ? "2px solid #fff" : "1px solid #3f3f46",
                      color: "#e4e4e7", borderRadius: 4, padding: "6px 8px", cursor: "pointer", fontSize: 11, textAlign: "left",
                    }}>
                    {z === "in-progress" ? "In Progress" : z === "backlog" ? "Backlog" : "In Review"}
                  </button>
                ))}
              </div>

              {/* Spawn points */}
              <div style={{ fontSize: 10, color: "#71717a", marginBottom: 4 }}>SPAWN POINTS</div>
              <button onClick={() => setMode("spawn")}
                style={{
                  background: mode === "spawn" ? "#22c55e33" : "#27272a",
                  border: mode === "spawn" ? "2px solid #22c55e" : "1px solid #3f3f46",
                  color: mode === "spawn" ? "#22c55e" : "#e4e4e7", borderRadius: 4,
                  padding: "6px 8px", cursor: "pointer", fontSize: 11, width: "100%", textAlign: "left", marginBottom: 12,
                }}>
                Paint Spawn Points
              </button>

              {/* Info */}
              <div style={{ fontSize: 10, color: "#52525b", marginBottom: 12 }}>
                {mode === "zone" ? "Click to paint zone, then click adjacent tile to set seat facing. Esc to skip."
                  : mode === "spawn" ? "Click/drag to paint spawn points (green). Click again to remove."
                  : ""}
              </div>

              {/* Stats */}
              <div style={{ fontSize: 10, color: "#52525b", display: "flex", flexDirection: "column", gap: 2, marginBottom: 12 }}>
                {(["in-progress", "backlog", "in-review"] as ZoneType[]).map((z) => (
                  <span key={z} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: ZONE_COLORS[z].replace("0.45", "0.8") }} />
                    {Object.values(zoneMap).filter((v) => v === z).length} tiles
                  </span>
                ))}
                <span>{zoneSpots.length} seats</span>
              </div>

              {/* Clear all */}
              <button
                onClick={() => {
                  if (!confirm("Clear ALL zones, seats, and spawn points?")) return;
                  setZoneMap({});
                  setZoneSpots([]);
                  setSpawnPoints([]);
                  pendingSeatRef.current = null; setPendingSeat(null);
                  setDirty(true);
                }}
                style={{
                  background: "#450a0a", border: "1px solid #7f1d1d", color: "#fca5a5",
                  borderRadius: 4, padding: "6px 12px", cursor: "pointer", fontSize: 11, width: "100%",
                }}>
                Clear All Zones
              </button>
            </div>
          )}

          {mode === "hand" && (
            <div style={{ color: "#71717a", padding: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Pan</div>
              <div style={{ fontSize: 10, color: "#52525b" }}>
                Drag to pan. Scroll to zoom.
              </div>
            </div>
          )}

          {mode === "select" && (
            <div style={{ color: "#71717a", padding: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Select</div>
              <div style={{ fontSize: 10, color: "#52525b", marginBottom: 8 }}>
                Click furniture to select/deselect.
                <br />G: group selection into component.
                <br />Delete: remove selected.
              </div>
              <div style={{ fontSize: 11, color: "#facc15", marginBottom: 8 }}>
                {selectedUids.size} selected
              </div>
              {selectedUids.size >= 2 && (
                <button
                  onClick={() => {
                    const state = stateRef.current;
                    if (!state) return;
                    const items = state.layout.furniture.filter(f => selectedUids.has(f.uid));
                    if (items.length < 2) return;
                    const minCol = Math.min(...items.map(f => f.col));
                    const minRow = Math.min(...items.map(f => f.row));
                    const compItems = items.map(f => ({ type: f.type, dx: f.col - minCol, dy: f.row - minRow }));
                    const name = prompt("Component name:");
                    if (name) {
                      const comp: FurnitureComponent = { name, items: compItems };
                      const updated = [...components, comp];
                      setComponents(updated);
                      saveComponents(updated);
                      setSelectedUids(new Set());
                    }
                  }}
                  style={{ background: "#27272a", border: "1px solid #facc15", color: "#facc15", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 11, width: "100%" }}>
                  Group as Component [G]
                </button>
              )}
              {components.length > 0 && (
                <>
                  <div style={{ fontWeight: 600, marginTop: 12, marginBottom: 6, fontSize: 10, textTransform: "uppercase", color: "#52525b" }}>
                    Saved Components
                  </div>
                  {components.map((comp, i) => (
                    <div key={i} style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                      <button
                        onClick={() => { setActiveComponent(comp); setMode("component"); }}
                        style={{
                          flex: 1, background: "#27272a", border: "1px solid #3f3f46", color: "#e4e4e7",
                          borderRadius: 4, padding: "3px 6px", cursor: "pointer", fontSize: 10, textAlign: "left",
                        }}>
                        {comp.name} ({comp.items.length})
                      </button>
                      <button
                        onClick={() => {
                          const updated = components.filter((_, j) => j !== i);
                          setComponents(updated);
                          saveComponents(updated);
                        }}
                        style={{ background: "#27272a", border: "1px solid #3f3f46", color: "#f87171", borderRadius: 4, padding: "3px 6px", cursor: "pointer", fontSize: 10 }}>
                        X
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {mode === "component" && activeComponent && (
            <div style={{ color: "#71717a", padding: 8 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Placing: {activeComponent.name}</div>
              <div style={{ fontSize: 10, color: "#52525b", marginBottom: 8 }}>
                Click to place. {activeComponent.items.length} items.
                <br />Press S to go back to select.
              </div>
              {activeComponent.items.map((item, i) => (
                <div key={i} style={{ fontSize: 10, color: "#a1a1aa" }}>
                  {item.type} (+{item.dx}, +{item.dy})
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Canvas */}
        <div
          ref={containerRef}
          onWheel={handleWheel}
          style={{ flex: 1, overflow: "hidden", position: "relative" }}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={(e) => {
              handleMouseUp();
              setHoveredTile(null);
            }}
            onContextMenu={(e) => e.preventDefault()}
            style={{ display: "block", width: "100%", height: "100%", cursor: cursorStyle }}
          />
          {!loaded && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#71717a",
                fontSize: 14,
                fontFamily: "monospace",
              }}
            >
              Loading map...
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          padding: "5px 12px",
          borderTop: "1px solid #27272a",
          background: "#18181b",
          fontSize: 10,
          color: "#52525b",
          flexShrink: 0,
          alignItems: "center",
        }}
      >
        <span>
          {layout ? `${layout.cols}x${layout.rows}` : "--"} tiles
        </span>
        <span>
          {layout ? layout.furniture.length : 0} furniture
        </span>
        {hoveredTile && (
          <span>
            ({hoveredTile.col}, {hoveredTile.row})
          </span>
        )}
        <div style={{ flex: 1 }} />
        <span>T F E H: modes | R: rotate | Ctrl+S: save | Scroll: zoom | Middle: pan</span>
      </div>
    </div>
  );
}

function toolbarBtnStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? "#3b82f6" : "#27272a",
    border: active ? "2px solid #93c5fd" : "1px solid #3f3f46",
    color: active ? "#fff" : "#a1a1aa",
    borderRadius: 4,
    padding: "4px 10px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: active ? 600 : 400,
  };
}
