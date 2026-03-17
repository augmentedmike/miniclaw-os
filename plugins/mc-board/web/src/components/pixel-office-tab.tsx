"use client";

import { useRef, useEffect, useState } from "react";
import useSWR from "swr";
import type { ActiveAgent, OfficeLayout } from "@/lib/pixel-office/types";
import {
  initOffice,
  updateOffice,
  renderOffice,
  syncAgents,
  centerView,
  type OfficeState,
} from "@/lib/pixel-office/engine";
import { clearSpriteCache } from "@/lib/pixel-office/sprites";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function PixelOfficeTab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<OfficeState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentCount, setAgentCount] = useState(0);
  const [zoom, setZoom] = useState(3);

  // Fetch active agents from board API
  const { data: activeData } = useSWR<{ active: ActiveAgent[] }>(
    "/api/active",
    fetcher,
    { refreshInterval: 5000 }
  );

  // Initialize office on mount
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Try loading the upstream default layout first
        let layout: OfficeLayout | null = null;
        try {
          const resp = await fetch("/pixel-office/assets/default-layout-1.json");
          if (resp.ok) {
            layout = await resp.json();
          }
        } catch {
          // Fall back to built-in layout
        }

        const state = await initOffice(layout);
        if (cancelled) return;
        stateRef.current = state;
        setLoaded(true);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  // Sync agents when data changes
  useEffect(() => {
    const state = stateRef.current;
    if (!state || !activeData?.active) return;
    syncAgents(state, activeData.active);
    setAgentCount(state.characters.filter((c) => c.isActive).length);
  }, [activeData, loaded]);

  // Handle zoom changes
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    clearSpriteCache();
    state.zoom = zoom;
    const canvas = canvasRef.current;
    if (canvas) {
      centerView(state, canvas.width, canvas.height);
    }
  }, [zoom]);

  // Canvas resize observer
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ro = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      canvas.width = Math.floor(rect.width);
      canvas.height = Math.floor(rect.height);
      const state = stateRef.current;
      if (state) {
        centerView(state, canvas.width, canvas.height);
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Game loop
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
        if (ctx) {
          updateOffice(state, dt);
          renderOffice(ctx, state);
        }
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(rafId);
      clearSpriteCache();
    };
  }, [loaded]);

  // If no agents are active and we have no characters, add demo characters
  useEffect(() => {
    const state = stateRef.current;
    if (!state || !loaded) return;
    if (state.characters.length === 0 && (!activeData?.active || activeData.active.length === 0)) {
      // Add 3 demo idle characters so the office doesn't look empty
      const demoAgents: ActiveAgent[] = [
        { cardId: "demo-1", title: "Cron Worker", worker: "cron-worker-1", column: "idle", pickedUpAt: new Date().toISOString() },
        { cardId: "demo-2", title: "Board Runner", worker: "board-runner", column: "idle", pickedUpAt: new Date().toISOString() },
        { cardId: "demo-3", title: "TG Handler", worker: "tg-handler", column: "idle", pickedUpAt: new Date().toISOString() },
      ];
      syncAgents(state, demoAgents);
      setAgentCount(3);
    }
  }, [loaded, activeData]);

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

  if (error) {
    return (
      <div style={{ padding: 32, color: "#f87171", fontFamily: "monospace" }}>
        <h3>Pixel Office Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0f0f23",
      }}
    >
      {/* Status bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 16px",
          borderBottom: "1px solid #27272a",
          background: "#18181b",
          fontSize: 13,
          color: "#a1a1aa",
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 16 }}>🏢</span>
        <span style={{ fontWeight: 600, color: "#e4e4e7" }}>
          Agent Office
        </span>
        <span style={{
          background: agentCount > 0 ? "#22c55e22" : "#3f3f4622",
          color: agentCount > 0 ? "#22c55e" : "#71717a",
          padding: "2px 8px",
          borderRadius: 4,
          fontSize: 11,
          fontWeight: 600,
        }}>
          {agentCount} active
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
          style={{
            background: "#27272a",
            border: "1px solid #3f3f46",
            color: "#a1a1aa",
            borderRadius: 4,
            padding: "2px 8px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          −
        </button>
        <span style={{ fontSize: 11, minWidth: 30, textAlign: "center" }}>{zoom}×</span>
        <button
          onClick={() => setZoom((z) => Math.min(6, z + 0.5))}
          style={{
            background: "#27272a",
            border: "1px solid #3f3f46",
            color: "#a1a1aa",
            borderRadius: 4,
            padding: "2px 8px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          +
        </button>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: "hidden",
          position: "relative",
          cursor: "grab",
        }}
      >
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
            Loading pixel office...
          </div>
        )}
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "100%" }}
        />
      </div>

      {/* Agent legend */}
      {loaded && stateRef.current && stateRef.current.characters.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            padding: "8px 16px",
            borderTop: "1px solid #27272a",
            background: "#18181b",
            fontSize: 11,
            color: "#a1a1aa",
            flexShrink: 0,
          }}
        >
          {stateRef.current.characters.map((ch) => (
            <div
              key={ch.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 8px",
                background: ch.isActive ? "#22c55e11" : "#27272a",
                border: `1px solid ${ch.isActive ? "#22c55e33" : "#3f3f46"}`,
                borderRadius: 4,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: ch.isActive ? "#22c55e" : "#52525b",
                  flexShrink: 0,
                }}
              />
              <span style={{ color: ch.isActive ? "#e4e4e7" : "#71717a" }}>
                {ch.name}
              </span>
              {ch.label && ch.isActive && (
                <span style={{ color: "#52525b", fontSize: 10 }}>
                  {ch.label}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
