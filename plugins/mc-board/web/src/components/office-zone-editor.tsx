"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { OfficeLayout } from "@/lib/pixel-office/types";
import { TILE_SIZE, TileType } from "@/lib/pixel-office/types";
import {
  initOffice,
  renderOffice,
  centerView,
  type OfficeState,
} from "@/lib/pixel-office/engine";

type ZoneType = "in-progress" | "backlog" | "in-review";
type Facing = "up" | "down" | "left" | "right";
type SpotAction = "sit" | "stand";
type Mode = ZoneType | "erase" | "hand";

interface Spot {
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

const FACING_ARROWS: Record<Facing, string> = {
  up: "↑", down: "↓", left: "←", right: "→",
};

const ZONE_DEFAULT_ACTION: Record<ZoneType, SpotAction> = {
  "in-progress": "sit",
  "backlog": "sit",
  "in-review": "stand",
};

const MODE_LABELS: Record<Mode, string> = {
  "in-progress": "In Progress [P]",
  "backlog": "Backlog [B]",
  "in-review": "In Review [R]",
  "erase": "Eraser [E]",
  "hand": "Pan [H]",
};

interface Props {
  onClose: () => void;
}

export function OfficeZoneEditor({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<OfficeState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [zones, setZones] = useState<Record<string, ZoneType>>({});
  const [spots, setSpots] = useState<Spot[]>([]);
  const [mode, setMode] = useState<Mode>("in-progress");
  const [painting, setPainting] = useState(false);
  const [panning, setPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastPainted, setLastPainted] = useState<{ col: number; row: number } | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toLowerCase()) {
        case "p": setMode("in-progress"); setLastPainted(null); break;
        case "b": setMode("backlog"); setLastPainted(null); break;
        case "r": setMode("in-review"); setLastPainted(null); break;
        case "e": setMode("erase"); setLastPainted(null); break;
        case "h": setMode("hand"); setLastPainted(null); break;
        case "escape": setLastPainted(null); break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const resp = await fetch("/api/office/zones");
        if (resp.ok) {
          const data = await resp.json();
          if (data.zones) setZones(data.zones);
          if (data.spots) setSpots(data.spots);
        }
      } catch {}
      let layout: OfficeLayout | null = null;
      // Try active saved layout first
      try {
        const ar = await fetch("/api/office/layouts/active");
        if (ar.ok) {
          const ad = await ar.json();
          if (ad.active) {
            const lr = await fetch(`/api/office/layouts/${encodeURIComponent(ad.active)}`);
            if (lr.ok) {
              const ld = await lr.json();
              layout = ld.layout ?? ld;
            }
          }
        }
      } catch {}
      // Fallback to default
      if (!layout) {
        try {
          const resp = await fetch("/pixel-office/assets/default-layout-1.json");
          if (resp.ok) layout = await resp.json();
        } catch {}
      }
      const state = await initOffice(layout);
      if (cancelled) return;
      stateRef.current = state;
      setLoaded(true);
    }
    init();
    return () => { cancelled = true; };
  }, []);

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
          const { zoom, offsetX, offsetY, layout } = state;
          const sz = TILE_SIZE * zoom;

          // Zone overlays
          for (const [key, zone] of Object.entries(zones)) {
            const [c, r] = key.split(",").map(Number);
            ctx.fillStyle = ZONE_COLORS[zone] ?? "rgba(255,255,255,0.2)";
            ctx.fillRect(offsetX + c * sz, offsetY + r * sz, sz, sz);
          }

          // Spots
          for (const spot of spots) {
            const x = offsetX + spot.col * sz;
            const y = offsetY + spot.row * sz;
            ctx.strokeStyle = spot.action === "sit" ? "#facc15" : "#34d399";
            ctx.lineWidth = Math.max(2, zoom);
            ctx.strokeRect(x + 2, y + 2, sz - 4, sz - 4);
            ctx.fillStyle = "#fff";
            const fs = Math.max(12, Math.round(12 * zoom));
            ctx.font = `bold ${fs}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(FACING_ARROWS[spot.facing], x + sz / 2, y + sz / 2);
          }

          // Pending spot — pulsing + direction hints
          if (lastPainted) {
            const x = offsetX + lastPainted.col * sz;
            const y = offsetY + lastPainted.row * sz;
            const alpha = 0.5 + 0.4 * Math.sin(Date.now() / 150);
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, sz, sz);
            const dirs: [number, number, Facing][] = [[0, -1, "up"], [0, 1, "down"], [-1, 0, "left"], [1, 0, "right"]];
            ctx.font = `bold ${Math.max(16, Math.round(14 * zoom))}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            for (const [dc, dr, facing] of dirs) {
              const nc = lastPainted.col + dc;
              const nr = lastPainted.row + dr;
              if (nc >= 0 && nr >= 0 && nc < layout.cols && nr < layout.rows) {
                ctx.fillStyle = `rgba(255, 255, 100, ${alpha})`;
                ctx.fillText(FACING_ARROWS[facing], offsetX + nc * sz + sz / 2, offsetY + nr * sz + sz / 2);
              }
            }
          }

          // Grid
          ctx.strokeStyle = "rgba(255,255,255,0.08)";
          ctx.lineWidth = 1;
          for (let r = 0; r <= layout.rows; r++) {
            const y = offsetY + r * sz;
            ctx.beginPath(); ctx.moveTo(offsetX, y); ctx.lineTo(offsetX + layout.cols * sz, y); ctx.stroke();
          }
          for (let c = 0; c <= layout.cols; c++) {
            const x = offsetX + c * sz;
            ctx.beginPath(); ctx.moveTo(x, offsetY); ctx.lineTo(x, offsetY + layout.rows * sz); ctx.stroke();
          }
        }
      }
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [loaded, zones, spots, lastPainted]);

  // Convert mouse to tile — for painting: floor only. For facing: any non-void.
  const canvasToTile = useCallback((e: React.MouseEvent<HTMLCanvasElement>, allowWalls: boolean): { col: number; row: number } | null => {
    const state = stateRef.current;
    const canvas = canvasRef.current;
    if (!state || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const { zoom, offsetX, offsetY, layout } = state;
    const col = Math.floor((e.clientX - rect.left - offsetX) / (TILE_SIZE * zoom));
    const row = Math.floor((e.clientY - rect.top - offsetY) / (TILE_SIZE * zoom));
    if (col < 0 || row < 0 || col >= layout.cols || row >= layout.rows) return null;
    const t = layout.tiles[row * layout.cols + col];
    if (t === TileType.VOID) return null;
    if (!allowWalls && t === TileType.WALL) return null;
    return { col, row };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Middle-click or hand mode = pan
    if (mode === "hand" || e.button === 1) {
      e.preventDefault();
      const state = stateRef.current;
      if (!state) return;
      setPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, ox: state.offsetX, oy: state.offsetY };
      return;
    }

    // If pending facing direction
    if (lastPainted && mode !== "erase") {
      const tile = canvasToTile(e, true); // allow walls/furniture for facing
      if (tile) {
        const dc = tile.col - lastPainted.col;
        const dr = tile.row - lastPainted.row;
        if (Math.abs(dc) + Math.abs(dr) === 1) {
          let facing: Facing;
          if (dr === -1) facing = "up";
          else if (dr === 1) facing = "down";
          else if (dc === -1) facing = "left";
          else facing = "right";
          const zone = zones[`${lastPainted.col},${lastPainted.row}`];
          const action: SpotAction = zone ? ZONE_DEFAULT_ACTION[zone] : "sit";
          setSpots((prev) => {
            const filtered = prev.filter((s) => !(s.col === lastPainted.col && s.row === lastPainted.row));
            return [...filtered, { col: lastPainted.col, row: lastPainted.row, facing, action }];
          });
          setDirty(true);
          setLastPainted(null);
          return;
        }
      }
      // Non-adjacent click — fall through to paint new tile
    }

    const tile = canvasToTile(e, false); // floor only for painting
    if (!tile) { setLastPainted(null); return; }

    if (mode === "erase") {
      const key = `${tile.col},${tile.row}`;
      setZones((prev) => { const n = { ...prev }; delete n[key]; return n; });
      setSpots((prev) => prev.filter((s) => !(s.col === tile.col && s.row === tile.row)));
      setLastPainted(null);
      setDirty(true);
      setPainting(true);
    } else {
      setZones((prev) => ({ ...prev, [`${tile.col},${tile.row}`]: mode }));
      setLastPainted({ col: tile.col, row: tile.row });
      setDirty(true);
      setPainting(true);
    }
  }, [mode, canvasToTile, zones, lastPainted]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (panning && panStart.current) {
      const state = stateRef.current;
      if (!state) return;
      state.offsetX = panStart.current.ox + (e.clientX - panStart.current.x);
      state.offsetY = panStart.current.oy + (e.clientY - panStart.current.y);
      return;
    }
    if (!painting) return;
    const tile = canvasToTile(e, false);
    if (!tile) return;
    if (mode === "erase") {
      setZones((prev) => { const n = { ...prev }; delete n[`${tile.col},${tile.row}`]; return n; });
      setSpots((prev) => prev.filter((s) => !(s.col === tile.col && s.row === tile.row)));
    } else if (mode !== "hand") {
      setZones((prev) => ({ ...prev, [`${tile.col},${tile.row}`]: mode }));
    }
    setDirty(true);
  }, [painting, panning, canvasToTile, mode]);

  const handleMouseUp = useCallback(() => {
    setPainting(false);
    setPanning(false);
    panStart.current = null;
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await fetch("/api/office/zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zones, spots }),
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

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

  const cursorStyle = mode === "hand" || panning ? "grab" : lastPainted ? "crosshair" : mode === "erase" ? "crosshair" : "cell";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0f0f23" }}>
      {/* Toolbar — 3 zone buttons + save/done */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
        borderBottom: "1px solid #27272a", background: "#18181b", fontSize: 12, flexShrink: 0,
      }}>
        {(["in-progress", "backlog", "in-review"] as ZoneType[]).map((z) => (
          <button key={z} onClick={() => { setMode(z); setLastPainted(null); }}
            style={{
              background: mode === z ? ZONE_COLORS[z].replace("0.45", "0.8") : "#27272a",
              border: mode === z ? "2px solid #fff" : "1px solid #3f3f46",
              color: "#e4e4e7", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 12,
            }}>
            {MODE_LABELS[z]}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ color: "#52525b", fontSize: 11 }}>
          {mode === "hand" ? "✋ Pan" : mode === "erase" ? "🧹 Erase" : ""}
        </span>
        <button onClick={handleSave} disabled={saving || !dirty}
          style={{
            background: dirty ? "#3b82f6" : "#27272a", border: "none", color: dirty ? "#fff" : "#52525b",
            borderRadius: 4, padding: "4px 14px", cursor: dirty ? "pointer" : "default", fontSize: 12, fontWeight: 600,
          }}>
          {saving ? "Saving..." : "Save"}
        </button>
        <button onClick={onClose}
          style={{ background: "#27272a", border: "1px solid #3f3f46", color: "#a1a1aa", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontSize: 12 }}>
          Done
        </button>
      </div>

      {/* Facing hint */}
      {lastPainted && (
        <div style={{ padding: "3px 12px", background: "#1c1917", borderBottom: "1px solid #27272a", fontSize: 11, color: "#facc15", flexShrink: 0 }}>
          Click adjacent tile to set seat facing · Esc to skip
        </div>
      )}

      {/* Canvas */}
      <div ref={containerRef} onWheel={handleWheel}
        style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <canvas ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onContextMenu={(e) => e.preventDefault()}
          style={{ display: "block", width: "100%", height: "100%", cursor: cursorStyle }}
        />
        {!loaded && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#71717a", fontSize: 14, fontFamily: "monospace" }}>
            Loading map...
          </div>
        )}
      </div>

      {/* Status */}
      <div style={{
        display: "flex", gap: 10, padding: "5px 12px", borderTop: "1px solid #27272a",
        background: "#18181b", fontSize: 10, color: "#52525b", flexShrink: 0, alignItems: "center",
      }}>
        {(["in-progress", "backlog", "in-review"] as ZoneType[]).map((z) => (
          <span key={z} style={{ display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: ZONE_COLORS[z].replace("0.45", "0.8") }} />
            {Object.values(zones).filter((v) => v === z).length}
          </span>
        ))}
        <span>{spots.length} seats</span>
        <div style={{ flex: 1 }} />
        <span>P B R: zones · E: erase · H: pan · Scroll: zoom</span>
      </div>
    </div>
  );
}
