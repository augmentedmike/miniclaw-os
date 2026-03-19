"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import useSWR from "swr";
import type { ActiveAgent, OfficeLayout } from "@/lib/pixel-office/types";
import type { Card } from "@/lib/types";
import {
  initOffice,
  updateOffice,
  renderOffice,
  syncAgents,
  centerView,
  hitTestBubble,
  applyZoneMap,
  type OfficeState,
} from "@/lib/pixel-office/engine";
import { clearSpriteCache } from "@/lib/pixel-office/sprites";
import { CardModal } from "./card-modal";
import { OfficeZoneEditor } from "./office-zone-editor";
import { OfficePlanner } from "./office-planner";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function cardsToAgents(cards: Card[], activeWorkers: Record<string, string>): ActiveAgent[] {
  return cards
    .filter((c) => c.column !== "shipped" && activeWorkers[c.id] != null)
    .map((c) => ({
      cardId: c.id,
      title: c.title,
      worker: activeWorkers[c.id],
      column: c.column,
      pickedUpAt: c.updated_at,
    }));
}

interface Props {
  onSwitchToBoard?: () => void;
}

export function PixelOfficeTab({ onSwitchToBoard }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<OfficeState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentCount, setAgentCount] = useState(0);
  const [zoom, setZoom] = useState(3);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [showNewWork, setShowNewWork] = useState(false);
  const [newWorkDesc, setNewWorkDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showPlanner, setShowPlanner] = useState(false);

  const { data: boardData, mutate: mutateBoardData } = useSWR<{
    cards: Card[];
    activeWorkers: Record<string, string>;
    projects: { id: string; name: string }[];
  }>("/api/board", fetcher, { refreshInterval: 5000 });

  const nonShippedCount = boardData?.cards
    ? boardData.cards.filter((c) => c.column !== "shipped").length
    : -1;

  const [reloadKey, setReloadKey] = useState(0);

  // Initialize office (re-runs when reloadKey changes)
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
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
                layout = ld.layout ?? ld; // unwrap if nested
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
        // Validate layout before init
        if (layout && (!layout.tiles || !layout.furniture || !layout.cols || !layout.rows)) {
          layout = null; // force default
        }
        const state = await initOffice(layout);
        if (cancelled) return;
        // Load user-defined zones
        try {
          const zr = await fetch("/api/office/zones");
          if (zr.ok) {
            const zd = await zr.json();
            if (zd.zones && Object.keys(zd.zones).length > 0) {
              applyZoneMap(state, zd.zones, zd.spots, zd.spawnPoints);
            } else if (zd.spawnPoints?.length > 0) {
              applyZoneMap(state, {}, [], zd.spawnPoints);
            }
          }
        } catch {}
        stateRef.current = state;
        // Set canvas size from container so first frame renders correctly
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (container && canvas) {
          const rect = container.getBoundingClientRect();
          canvas.width = Math.floor(rect.width);
          canvas.height = Math.floor(rect.height);
          centerView(state, canvas.width, canvas.height);
        }
        setLoaded(true);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    }
    init();
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Sync board cards → characters
  useEffect(() => {
    const state = stateRef.current;
    if (!state || !loaded || !boardData?.cards) return;
    const agents = cardsToAgents(boardData.cards, boardData.activeWorkers ?? {});
    syncAgents(state, agents);
    setAgentCount(state.characters.filter((c) => c.isActive).length);
  }, [boardData, loaded]);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    clearSpriteCache();
    state.zoom = zoom;
    const canvas = canvasRef.current;
    if (canvas) centerView(state, canvas.width, canvas.height);
  }, [zoom]);

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
    let lastTime = 0;
    const frame = (time: number) => {
      const dt = lastTime === 0 ? 0 : (time - lastTime) / 1000;
      lastTime = time;
      const state = stateRef.current;
      const canvas = canvasRef.current;
      if (state && canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) { updateOffice(state, dt); renderOffice(ctx, state); }
      }
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      clearSpriteCache();
    };
  }, [loaded]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !state) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const cardId = hitTestBubble(state, e.clientX - rect.left, e.clientY - rect.top, ctx);
    if (cardId) setOpenCardId(cardId);
  }, []);

  // Attach wheel listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => Math.max(1, Math.min(6, z + (e.deltaY > 0 ? -0.5 : 0.5))));
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  async function handleSubmitWork(e: React.FormEvent) {
    e.preventDefault();
    if (!newWorkDesc.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: newWorkDesc.trim() }),
      });
      if (res.ok) {
        setNewWorkDesc("");
        setShowNewWork(false);
        mutateBoardData();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (showEditor) {
    return <OfficeZoneEditor onClose={() => setShowEditor(false)} />;
  }

  if (showPlanner) {
    return <OfficePlanner onClose={() => { setShowPlanner(false); setZoom(3); setReloadKey(k => k + 1); }} />;
  }

  if (error) {
    return (
      <div style={{ padding: 32, color: "#f87171", fontFamily: "monospace" }}>
        <h3>Pixel Office Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#0f0f23" }}>
      {/* Status bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "8px 16px",
        borderBottom: "1px solid #27272a", background: "#18181b", fontSize: 13, color: "#a1a1aa", flexShrink: 0,
      }}>
        <span style={{ fontSize: 16 }}>🏢</span>
        <span style={{ fontWeight: 600, color: "#e4e4e7" }}>Agent Office</span>
        <span style={{
          background: agentCount > 0 ? "#22c55e22" : "#3f3f4622",
          color: agentCount > 0 ? "#22c55e" : "#71717a",
          padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600,
        }}>
          {agentCount} active
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowPlanner(true)}
          style={{
            background: "#27272a", border: "1px solid #3f3f46", color: "#a1a1aa", borderRadius: 4,
            padding: "4px 10px", cursor: "pointer", fontSize: 12,
          }}>
          Edit Layout
        </button>
        <button
          onClick={() => setShowNewWork(true)}
          style={{
            background: "#3b82f6", border: "none", color: "#fff", borderRadius: 4,
            padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600,
          }}
        >
          + New Request
        </button>
        <button onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
          style={{ background: "#27272a", border: "1px solid #3f3f46", color: "#a1a1aa", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 12 }}>
          −
        </button>
        <span style={{ fontSize: 11, minWidth: 30, textAlign: "center" }}>{zoom}×</span>
        <button onClick={() => setZoom((z) => Math.min(6, z + 0.5))}
          style={{ background: "#27272a", border: "1px solid #3f3f46", color: "#a1a1aa", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 12 }}>
          +
        </button>
      </div>

      {/* Canvas container */}
      <div ref={containerRef}
        style={{ flex: 1, overflow: "hidden", position: "relative", cursor: "grab" }}>
        {!loaded && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            color: "#71717a", fontSize: 14, fontFamily: "monospace",
          }}>
            Loading pixel office...
          </div>
        )}
        <canvas ref={canvasRef} onClick={handleCanvasClick}
          style={{ display: "block", width: "100%", height: "100%", cursor: "pointer" }} />

        {/* Empty office overlay */}
        {loaded && nonShippedCount === 0 && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 16,
            background: "rgba(15, 15, 35, 0.7)", zIndex: 10,
          }}>
            <div style={{ fontSize: 48 }}>✅</div>
            <div style={{ color: "#e4e4e7", fontSize: 20, fontWeight: 600 }}>All work is done!</div>
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => setShowNewWork(true)}
                style={{
                  background: "#3b82f6", border: "none", color: "#fff", borderRadius: 6,
                  padding: "10px 24px", cursor: "pointer", fontSize: 14, fontWeight: 600,
                }}>
                + Add New Work
              </button>
              {onSwitchToBoard && (
                <button onClick={onSwitchToBoard}
                  style={{
                    background: "#27272a", border: "1px solid #3f3f46", color: "#a1a1aa", borderRadius: 6,
                    padding: "10px 24px", cursor: "pointer", fontSize: 14,
                  }}>
                  View Board
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Agent legend */}
      {loaded && stateRef.current && stateRef.current.characters.length > 0 && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 8, padding: "8px 16px",
          borderTop: "1px solid #27272a", background: "#18181b", fontSize: 11, color: "#a1a1aa", flexShrink: 0,
        }}>
          {stateRef.current.characters.map((ch) => (
            <div key={ch.id} onClick={() => ch.cardId && setOpenCardId(ch.cardId)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "3px 8px",
                background: ch.isActive ? "#22c55e11" : "#27272a",
                border: `1px solid ${ch.isActive ? "#22c55e33" : "#3f3f46"}`,
                borderRadius: 4, cursor: ch.cardId ? "pointer" : "default",
              }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: ch.isActive ? "#22c55e" : "#52525b", flexShrink: 0 }} />
              <span style={{ color: ch.isActive ? "#e4e4e7" : "#71717a" }}>{ch.cardId ?? ch.name}</span>
              {ch.column && <span style={{ color: "#52525b", fontSize: 10 }}>{ch.column}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Card detail modal */}
      {openCardId && (
        <CardModal cardId={openCardId} projects={boardData?.projects ?? []} onClose={() => setOpenCardId(null)} />
      )}

      {/* New work request modal */}
      {showNewWork && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={(e) => { if (e.target === e.currentTarget) setShowNewWork(false); }}>
          <form onSubmit={handleSubmitWork} style={{
            background: "#18181b", border: "1px solid #27272a", borderRadius: 8,
            padding: 24, width: 480, maxWidth: "90vw", display: "flex", flexDirection: "column", gap: 16,
          }}>
            <h3 style={{ color: "#e4e4e7", fontSize: 16, fontWeight: 600, margin: 0 }}>New Work Request</h3>
            <p style={{ color: "#71717a", fontSize: 13, margin: 0 }}>
              Describe what you need done. The board will handle triaging, planning, and execution.
            </p>
            <textarea
              autoFocus
              value={newWorkDesc}
              onChange={(e) => setNewWorkDesc(e.target.value)}
              placeholder="What do you need done?"
              rows={5}
              style={{
                background: "#09090b", border: "1px solid #27272a", borderRadius: 6, color: "#e4e4e7",
                padding: 12, fontSize: 14, resize: "vertical", fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowNewWork(false)}
                style={{
                  background: "#27272a", border: "1px solid #3f3f46", color: "#a1a1aa",
                  borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13,
                }}>
                Cancel
              </button>
              <button type="submit" disabled={submitting || !newWorkDesc.trim()}
                style={{
                  background: submitting ? "#1e40af" : "#3b82f6", border: "none", color: "#fff",
                  borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  opacity: !newWorkDesc.trim() ? 0.5 : 1,
                }}>
                {submitting ? "Creating..." : "Submit"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
