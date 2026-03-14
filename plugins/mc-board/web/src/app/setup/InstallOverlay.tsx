"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Props {
  accent: string;
}

type Phase = "waiting" | "running" | "done" | "idle";

export default function InstallOverlay({ accent }: Props) {
  const [phase, setPhase] = useState<Phase>("waiting");
  const [lines, setLines] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState("Preparing...");
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const retryCount = useRef(0);

  // Drag state
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [posInit, setPosInit] = useState(false);
  const dragging = useRef(false);
  const dragOff = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (open && !posInit) {
      setPos({ x: Math.max(0, (window.innerWidth - 560) / 2), y: Math.max(40, (window.innerHeight - 440) / 2) });
      setPosInit(true);
    }
  }, [open, posInit]);

  useEffect(() => {
    if (termRef.current && open) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [lines, open]);

  // Auto-start on mount
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    runInstall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLine = (line: string) => setLines((p) => [...p, line]);

  const runInstall = useCallback(async () => {
    setPhase("waiting");
    setCurrentStep("Connecting...");

    while (true) {
      try {
        const res = await fetch("/api/setup/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        if (res.status === 409) {
          // Already running — poll until done
          setPhase("running");
          setCurrentStep("Installing...");
          addLine("Install already in progress — watching...");
          await pollUntilDone();
          return;
        }

        if (res.status === 503) {
          // Repo not ready yet — wait and retry
          addLine("Waiting for download to finish...");
          await delay(5000);
          continue;
        }

        if (!res.ok || !res.body) {
          // Unknown error — wait and retry silently
          retryCount.current++;
          if (retryCount.current > 20) {
            setPhase("idle");
            return;
          }
          await delay(3000);
          continue;
        }

        // Success — stream the SSE output
        setPhase("running");
        setCurrentStep("Installing...");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() || "";
          for (const part of parts) {
            const dl = part.split("\n").find((l) => l.startsWith("data: "));
            if (!dl) continue;
            try {
              const evt = JSON.parse(dl.slice(6));
              if (evt.type === "output") addLine(evt.data);
              if (evt.type === "step") setCurrentStep(evt.name.replace(/^Step\s+\S+:?\s*/, ""));
              if (evt.type === "done") {
                setPhase("done");
                setCurrentStep(evt.code === 0 ? "Complete" : `Exit ${evt.code}`);
                return;
              }
            } catch { /* skip */ }
          }
        }
        // Stream ended without done event
        setPhase("done");
        setCurrentStep("Complete");
        return;
      } catch {
        // Network error — retry silently
        retryCount.current++;
        if (retryCount.current > 20) { setPhase("idle"); return; }
        await delay(3000);
      }
    }
  }, []);

  async function pollUntilDone() {
    for (let i = 0; i < 300; i++) {
      await delay(3000);
      try {
        const r = await fetch("/api/setup/install").then((r) => r.json());
        if (!r.running) { setPhase("done"); setCurrentStep("Complete"); return; }
      } catch { /* keep polling */ }
    }
    setPhase("done");
    setCurrentStep("Complete");
  }

  // Fade out after done
  useEffect(() => {
    if (phase === "done" && !open) {
      const t = setTimeout(() => setDismissed(true), 10000);
      return () => clearTimeout(t);
    }
  }, [phase, open]);

  // Drag handlers
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

  if (dismissed || phase === "idle") return null;

  const color = phase === "done" ? "#4ade80" : accent;

  return (
    <>
      {/* Floating pill */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full transition-all hover:scale-105 active:scale-95 shadow-lg"
          style={{ background: "#1a1a1a", border: `1px solid ${color}55`, boxShadow: `0 0 24px ${color}20` }}
        >
          {phase === "done" ? (
            <span className="text-xs" style={{ color }}>✓</span>
          ) : (
            <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: color }} />
          )}
          <span className="text-xs font-medium text-[#aaa] max-w-[200px] truncate">
            {phase === "done" ? "Install complete" : currentStep}
          </span>
        </button>
      )}

      {/* Draggable terminal window */}
      {open && (
        <div
          className="fixed z-50 rounded-2xl shadow-2xl overflow-hidden"
          style={{ left: pos.x, top: pos.y, width: 560, background: "#111", border: `1px solid ${color}33`, boxShadow: `0 8px 40px rgba(0,0,0,0.6)` }}
        >
          {/* Title bar */}
          <div
            onMouseDown={onMouseDown}
            className="flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing select-none"
            style={{ background: "#0d0d0d", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center gap-2.5">
              {phase === "done" ? (
                <span className="text-xs" style={{ color }}>✓</span>
              ) : (
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: color }} />
              )}
              <span className="text-sm font-medium text-[#ccc]">
                {phase === "done" ? "Install complete" : "Installing MiniClaw..."}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded-full flex items-center justify-center text-[#555] hover:text-white hover:bg-[rgba(255,255,255,0.1)] transition-all text-xs"
            >
              ✕
            </button>
          </div>

          {/* Terminal */}
          <div
            ref={termRef}
            className="font-mono text-[11px] leading-[18px] overflow-y-auto p-4"
            style={{ height: 300, background: "#0a0a0a" }}
          >
            {lines.map((line, i) => (
              <div key={i} className={lc(line)}>{strip(line)}</div>
            ))}
            {phase !== "done" && (
              <div className="animate-pulse" style={{ color: accent }}>▋</div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function strip(s: string) { return s.replace(/\x1b\[[0-9;]*m/g, ""); }
function lc(l: string): string {
  if (l.includes("[✓]") || l.includes("✓")) return "text-[#4ade80]";
  if (l.includes("[✗]") || l.includes("✗")) return "text-[#FF5252]";
  if (l.includes("[!]") || l.includes("⚠")) return "text-[#fbbf24]";
  if (l.includes("[i]")) return "text-[#60a5fa]";
  if (l.startsWith("──")) return "text-white font-bold mt-2";
  return "text-[#888]";
}
