"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface Props {
  accent: string;
}

type Phase = "connecting" | "running" | "done" | "error";

interface StepInfo {
  name: string;
}

export default function InstallOverlay({ accent }: Props) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [lines, setLines] = useState<string[]>([]);
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [currentStep, setCurrentStep] = useState("");
  const [open, setOpen] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  // Drag state
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [initialized, setInitialized] = useState(false);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // Center the modal on first open
  useEffect(() => {
    if (open && !initialized) {
      setPos({
        x: Math.max(0, (window.innerWidth - 560) / 2),
        y: Math.max(40, (window.innerHeight - 440) / 2),
      });
      setInitialized(true);
    }
  }, [open, initialized]);

  // Auto-scroll terminal
  useEffect(() => {
    if (termRef.current && open) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [lines, open]);

  // Auto-start install on mount
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startInstall();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startInstall = useCallback(async () => {
    setPhase("connecting");
    try {
      const res = await fetch("/api/setup/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      // Already finished or already running — show as done
      if (res.status === 409) {
        setPhase("running");
        setLines((p) => [...p, "Install already in progress..."]);
        // Poll until it's done
        const poll = setInterval(async () => {
          try {
            const s = await fetch("/api/setup/install").then(r => r.json());
            if (!s.running) {
              clearInterval(poll);
              setPhase("done");
            }
          } catch { /* keep polling */ }
        }, 2000);
        return;
      }

      if (!res.ok || !res.body) {
        // Check if install already completed previously
        try {
          const status = await fetch("/api/setup/install").then(r => r.json());
          if (!status.running) {
            setPhase("done");
            setLines((p) => [...p, "Install already complete."]);
            return;
          }
        } catch { /* fall through */ }
        setPhase("error");
        setLines((p) => [...p, `Server error: ${res.status}`]);
        return;
      }

      setPhase("running");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const parts = sseBuffer.split("\n\n");
        sseBuffer = parts.pop() || "";

        for (const part of parts) {
          const dataLine = part.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const evt = JSON.parse(dataLine.slice(6));

            if (evt.type === "output") {
              setLines((p) => [...p, evt.data]);
            }
            if (evt.type === "step") {
              setCurrentStep(evt.name);
              setSteps((p) => [...p, { name: evt.name }]);
            }
            if (evt.type === "done") {
              setExitCode(evt.code);
              setPhase(evt.code === 0 ? "done" : "error");
              setCurrentStep("");
            }
            if (evt.type === "error") {
              setLines((p) => [...p, `ERROR: ${evt.message}`]);
              setPhase("error");
            }
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      setPhase("error");
      setLines((p) => [...p, `Connection failed: ${err instanceof Error ? err.message : "unknown"}`]);
    }
  }, []);

  // Drag handlers
  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 200, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 100, e.clientY - dragOffset.current.y)),
      });
    };
    const onMouseUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [pos]);

  // Hide the pill 8 seconds after install completes (if modal is closed)
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (phase === "done" && !open) {
      const t = setTimeout(() => setDismissed(true), 8000);
      return () => clearTimeout(t);
    }
  }, [phase, open]);

  if (dismissed && !open) return null;

  // ── Floating pill ─────────────────────────────────────────────────────────
  const pillColor =
    phase === "done" ? "#4ade80" :
    phase === "error" ? "#FF5252" :
    accent;

  const pillLabel =
    phase === "connecting" ? "Connecting..." :
    phase === "running" ? (currentStep ? currentStep.replace(/^Step\s+\S+:?\s*/, "") : "Installing...") :
    phase === "done" ? "Install complete" :
    "Install issue";

  return (
    <>
      {/* Floating pill — fixed bottom-right */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-full transition-all hover:scale-105 active:scale-95 shadow-lg animate-[fadeSlideIn_0.4s_ease-out]"
          style={{
            background: "#1a1a1a",
            border: `1px solid ${pillColor}55`,
            boxShadow: `0 0 24px ${pillColor}20, 0 2px 8px rgba(0,0,0,0.4)`,
          }}
        >
          {/* Status dot */}
          {phase === "running" || phase === "connecting" ? (
            <div
              className="w-2.5 h-2.5 rounded-full animate-pulse"
              style={{ background: pillColor }}
            />
          ) : (
            <span className="text-xs" style={{ color: pillColor }}>
              {phase === "done" ? "✓" : "✗"}
            </span>
          )}
          <span className="text-xs font-medium text-[#aaa] max-w-[180px] truncate">
            {pillLabel}
          </span>
        </button>
      )}

      {/* Draggable modal */}
      {open && (
        <div
          className="fixed z-50 rounded-2xl shadow-2xl overflow-hidden"
          style={{
            left: pos.x,
            top: pos.y,
            width: 560,
            background: "#111",
            border: `1px solid ${pillColor}33`,
            boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 30px ${pillColor}10`,
          }}
        >
          {/* Title bar — draggable */}
          <div
            onMouseDown={onMouseDown}
            className="flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing select-none"
            style={{ background: "#0d0d0d", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="flex items-center gap-2.5">
              {phase === "running" || phase === "connecting" ? (
                <div
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{ background: pillColor }}
                />
              ) : (
                <span className="text-xs" style={{ color: pillColor }}>
                  {phase === "done" ? "✓" : "✗"}
                </span>
              )}
              <span className="text-sm font-medium text-[#ccc]">
                {phase === "done" ? "Install complete" : phase === "error" ? "Install issue" : "Installing MiniClaw..."}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Step count */}
              {steps.length > 0 && (
                <span className="text-xs text-[#555]">{steps.length} steps</span>
              )}
              {/* Close / minimize */}
              <button
                onClick={() => setOpen(false)}
                className="w-6 h-6 rounded-full flex items-center justify-center text-[#555] hover:text-white hover:bg-[rgba(255,255,255,0.1)] transition-all text-xs"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Step badges */}
          {steps.length > 0 && (
            <div className="flex flex-wrap gap-1.5 px-4 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
              {steps.map((s, i) => {
                const isCurrent = s.name === currentStep && phase === "running";
                return (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded text-[10px] font-medium"
                    style={{
                      background: isCurrent ? `${accent}22` : "rgba(255,255,255,0.04)",
                      color: isCurrent ? accent : "#555",
                      border: isCurrent ? `1px solid ${accent}33` : "1px solid transparent",
                    }}
                  >
                    {s.name.replace(/^Step\s+\S+:?\s*/, "")}
                  </span>
                );
              })}
            </div>
          )}

          {/* Terminal output */}
          <div
            ref={termRef}
            className="font-mono text-[11px] leading-[18px] overflow-y-auto p-4"
            style={{ height: 300, background: "#0a0a0a" }}
          >
            {lines.map((line, i) => (
              <div key={i} className={lineClass(line)}>
                {stripAnsi(line)}
              </div>
            ))}
            {(phase === "running" || phase === "connecting") && (
              <div className="animate-pulse" style={{ color: accent }}>▋</div>
            )}
          </div>

          {/* Footer */}
          {phase === "error" && (
            <div className="px-4 py-3 flex justify-end" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <button
                onClick={() => {
                  setLines([]);
                  setSteps([]);
                  setCurrentStep("");
                  setExitCode(null);
                  startedRef.current = false;
                  startInstall();
                }}
                className="px-4 py-2 rounded-lg text-xs font-medium transition-all hover:opacity-90"
                style={{ background: accent, color: "#0f0f0f" }}
              >
                Retry install
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function lineClass(line: string): string {
  if (line.includes("[✓]") || line.includes("✓")) return "text-[#4ade80]";
  if (line.includes("[✗]") || line.includes("✗")) return "text-[#FF5252]";
  if (line.includes("[!]") || line.includes("⚠")) return "text-[#fbbf24]";
  if (line.includes("[i]")) return "text-[#60a5fa]";
  if (line.startsWith("──")) return "text-white font-bold mt-2";
  return "text-[#888]";
}

function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
