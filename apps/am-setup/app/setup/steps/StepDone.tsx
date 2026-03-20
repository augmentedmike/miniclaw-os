"use client";

import { useEffect, useState } from "react";

interface Props {
  name: string;
  accent: string;
}

export default function StepDone({ name, accent }: Props) {
  const [boardReady, setBoardReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Check if board web is reachable, then redirect
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      for (let i = 0; i < 30; i++) {
        if (cancelled) return;
        try {
          const res = await fetch("http://localhost:4220/api/health", { mode: "no-cors" });
          // no-cors means we can't read the response, but if it doesn't throw, the server is up
          setBoardReady(true);
          setTimeout(() => {
            if (!cancelled) window.location.href = "http://localhost:4220";
          }, 1500);
          return;
        } catch {
          // not ready yet
        }
        await new Promise((r) => setTimeout(r, 2000));
        if (!cancelled) setElapsed((e) => e + 2);
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="text-center flex flex-col items-center gap-8">
      <div
        className="w-24 h-24 rounded-full flex items-center justify-center text-4xl"
        style={{ background: `${accent}22`, border: `2px solid ${accent}` }}
      >
        ✦
      </div>

      <div>
        <h2 className="text-4xl font-bold text-white mb-3">
          {name} is ready.
        </h2>
        <p className="text-[#888] text-lg">
          {boardReady
            ? "Taking you to the brain board now."
            : "Waiting for the brain board to start..."}
        </p>
      </div>

      <div className="flex flex-col items-center gap-2">
        <div
          className="h-1 rounded-full overflow-hidden w-48"
          style={{ background: "rgba(255,255,255,0.08)" }}
        >
          {boardReady ? (
            <div
              className="h-full rounded-full"
              style={{
                background: accent,
                width: "100%",
                animation: "grow-bar 1.5s linear forwards",
              }}
            />
          ) : (
            <div
              className="h-full rounded-full animate-pulse"
              style={{ background: `${accent}66`, width: "60%" }}
            />
          )}
        </div>
        <p className="text-xs text-[#555]">
          {boardReady ? "Redirecting..." : `Starting board web...${elapsed > 10 ? " (this can take a moment)" : ""}`}
        </p>
      </div>

      {/* Manual fallback after 20 seconds */}
      {elapsed >= 20 && !boardReady && (
        <a
          href="http://localhost:4220"
          className="px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
          style={{ background: accent, color: "#0f0f0f" }}
        >
          Open brain board manually →
        </a>
      )}

      <style>{`
        @keyframes grow-bar {
          from { transform: scaleX(0); transform-origin: left; }
          to { transform: scaleX(1); transform-origin: left; }
        }
      `}</style>
    </div>
  );
}
