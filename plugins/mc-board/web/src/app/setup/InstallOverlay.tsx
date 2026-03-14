"use client";

import { useState, useEffect, useRef } from "react";
import { LogDisplay } from "@/components/log-display";

interface Props {
  accent: string;
}

/**
 * Read-only viewer of the install log file.
 * Install is started by bootstrap.sh BEFORE the web app opens.
 * This just tails the log via GET /api/setup/install/log
 */
export default function InstallOverlay({ accent }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState("Installing...");
  const [done, setDone] = useState(false);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Drag state
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [posInit, setPosInit] = useState(false);
  const dragging = useRef(false);
  const dragOff = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (open && !posInit) {
      setPos({ x: Math.max(0, (window.innerWidth - 560) / 2), y: 20 });
      setPosInit(true);
    }
  }, [open, posInit]);

  // Poll the log file
  useEffect(() => {
    let cancelled = false;
    let offset = 0;

    const poll = async () => {
      while (!cancelled) {
        try {
          const res = await fetch(`/api/setup/install/log?offset=${offset}`);
          if (res.ok) {
            const data = await res.json();
            if (data.lines && data.lines.length > 0) {
              setLines((p) => [...p, ...data.lines]);
              offset = data.offset;
              // Parse step names from new lines
              for (const line of data.lines) {
                const m = line.match(/^──\s+(Step\s+\S+:?\s*.*)$/);
                if (m) setCurrentStep(m[1].replace(/^Step\s+\S+:?\s*/, ""));
              }
            }
            if (data.done) {
              setDone(true);
              setCurrentStep("Complete");
              return;
            }
          }
        } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 2000));
      }
    };

    poll();
    return () => { cancelled = true; };
  }, []);

  // Fade pill after done
  useEffect(() => {
    if (done && !open) {
      const t = setTimeout(() => setDismissed(true), 10000);
      return () => clearTimeout(t);
    }
  }, [done, open]);

  // Drag
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    dragOff.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({ x: Math.max(0, e.clientX - dragOff.current.x), y: Math.max(0, e.clientY - dragOff.current.y) });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  if (dismissed) return null;
  // Don't show if no log output yet (install hasn't started or no log)
  if (lines.length === 0 && !done) return null;

  const color = done ? "#4ade80" : accent;

  return (
    <>
      {/* Floating pill */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full transition-all hover:scale-105 active:scale-95 shadow-lg"
          style={{ background: "#1a1a1a", border: `1px solid ${color}55`, boxShadow: `0 0 24px ${color}20` }}
        >
          {done ? (
            <span className="text-xs" style={{ color }}>✓</span>
          ) : (
            <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: color }} />
          )}
          <span className="text-xs font-medium text-[#aaa] max-w-[200px] truncate">
            {done ? "Install complete" : currentStep}
          </span>
        </button>
      )}

      {/* Draggable terminal window */}
      {open && (
        <div
          className="fixed z-50 rounded-2xl shadow-2xl overflow-hidden"
          style={{ left: pos.x, top: pos.y, width: 560, background: "#111", border: `1px solid ${color}33`, boxShadow: `0 8px 40px rgba(0,0,0,0.6)` }}
        >
          <div
            onMouseDown={onMouseDown}
            className="flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing select-none"
            style={{ background: "#0d0d0d", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center gap-2.5">
              {done ? (
                <span className="text-xs" style={{ color }}>✓</span>
              ) : (
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: color }} />
              )}
              <span className="text-sm font-medium text-[#ccc]">
                {done ? "Install complete" : "Installing MiniClaw..."}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[#555] hover:text-white hover:bg-[rgba(255,255,255,0.1)] transition-all text-xs"
            >
              ✕
            </button>
          </div>
          <LogDisplay
            lines={lines}
            height={Math.max(300, window.innerHeight - 200)}
            showDebugToggle={true}
            autoScroll={true}
            running={!done}
            accent={accent}
          />
        </div>
      )}
    </>
  );
}

