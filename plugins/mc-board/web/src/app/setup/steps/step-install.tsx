"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Props {
  onDone: () => void;
  accent: string;
}

type Phase = "password" | "installing" | "done" | "error";

interface StepInfo {
  name: string;
  status: "done" | "active" | "pending";
}

export default function StepInstall({ onDone, accent }: Props) {
  const [phase, setPhase] = useState<Phase>("password");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [steps, setSteps] = useState<StepInfo[]>([]);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const termRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [lines]);

  const startInstall = useCallback(async () => {
    if (!password.trim()) {
      setPasswordError("Password is required");
      return;
    }

    setSubmitting(true);
    setPasswordError("");

    try {
      const res = await fetch("/api/setup/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      if (res.status === 401) {
        setPasswordError("Incorrect password — try again");
        setSubmitting(false);
        return;
      }

      if (!res.ok || !res.body) {
        setPasswordError("Server error — is the app running?");
        setSubmitting(false);
        return;
      }

      setPhase("installing");

      // Read SSE stream
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
          const dataLine = part
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!dataLine) continue;

          try {
            const evt = JSON.parse(dataLine.slice(6));

            if (evt.type === "output") {
              setLines((prev) => [...prev, evt.data]);
            }

            if (evt.type === "step") {
              setSteps((prev) => {
                const updated = prev.map((s) =>
                  s.status === "active" ? { ...s, status: "done" as const } : s
                );
                return [...updated, { name: evt.name, status: "active" }];
              });
            }

            if (evt.type === "done") {
              setExitCode(evt.code);
              setSteps((prev) =>
                prev.map((s) =>
                  s.status === "active" ? { ...s, status: "done" as const } : s
                )
              );
              if (evt.code === 0) {
                setPhase("done");
                setTimeout(onDone, 2000);
              } else {
                setPhase("error");
              }
            }

            if (evt.type === "error") {
              setLines((prev) => [...prev, `ERROR: ${evt.message}`]);
              setPhase("error");
            }
          } catch {
            // skip malformed events
          }
        }
      }
    } catch (err) {
      setPasswordError(`Connection failed: ${err instanceof Error ? err.message : "unknown"}`);
      setSubmitting(false);
    }
  }, [password, onDone]);

  // ── Password screen ───────────────────────────────────────────────────────
  if (phase === "password") {
    return (
      <div className="flex flex-col gap-6 items-center text-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl"
          style={{ background: `${accent}22`, border: `2px solid ${accent}` }}>
          🦀
        </div>

        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Install MiniClaw</h2>
          <p className="text-[#888]">
            This will set up everything your AM needs to run.
            <br />
            Enter your Mac password to begin.
          </p>
        </div>

        <div className="w-full flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setPasswordError(""); }}
            onKeyDown={(e) => e.key === "Enter" && startInstall()}
            placeholder="Mac password"
            autoFocus
            disabled={submitting}
            className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border text-white text-sm placeholder-[#444] focus:outline-none transition-all"
            style={{ borderColor: passwordError ? "#FF5252" : password ? `${accent}66` : "rgba(255,255,255,0.1)" }}
          />
          {passwordError && (
            <div className="rounded-xl px-4 py-2 bg-[#FF525222] border border-[#FF525244] text-sm text-[#FF8080]">
              {passwordError}
            </div>
          )}
        </div>

        <button
          onClick={startInstall}
          disabled={submitting || !password.trim()}
          className="w-full py-4 rounded-xl font-semibold text-base transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-40"
          style={{ background: accent, color: "#0f0f0f" }}
        >
          {submitting ? "Checking..." : "Install →"}
        </button>

        <p className="text-xs text-[#555]">
          Your password is only used locally for installing system packages.
          <br />
          It is never stored or sent anywhere.
        </p>
      </div>
    );
  }

  // ── Installing / Done / Error screen ──────────────────────────────────────
  return (
    <div className="flex flex-col gap-5">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-white mb-2">
          {phase === "done" ? "Installed!" : phase === "error" ? "Install issue" : "Installing..."}
        </h2>
        <p className="text-[#888]">
          {phase === "done"
            ? "Everything is set up. Moving on..."
            : phase === "error"
              ? "Something went wrong. Check the output below."
              : "This takes a few minutes. Sit tight."}
        </p>
      </div>

      {/* Step progress sidebar */}
      {steps.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {steps.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{
                background:
                  s.status === "done" ? `${accent}15` :
                  s.status === "active" ? "rgba(255,255,255,0.08)" :
                  "rgba(255,255,255,0.03)",
                color:
                  s.status === "done" ? accent :
                  s.status === "active" ? "#fff" :
                  "#555",
                border:
                  s.status === "active" ? `1px solid ${accent}44` :
                  "1px solid transparent",
              }}
            >
              {s.status === "done" && <span>✓</span>}
              {s.status === "active" && (
                <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: accent }} />
              )}
              {s.name.replace(/^Step\s+\S+:?\s*/, "")}
            </div>
          ))}
        </div>
      )}

      {/* Terminal output */}
      <div
        ref={termRef}
        className="w-full rounded-xl bg-[#0a0a0a] border border-[rgba(255,255,255,0.06)] font-mono text-xs leading-5 overflow-y-auto p-4"
        style={{ height: "320px" }}
      >
        {lines.map((line, i) => (
          <div key={i} className={lineClass(line)}>
            {stripAnsi(line)}
          </div>
        ))}
        {phase === "installing" && (
          <div className="animate-pulse" style={{ color: accent }}>▋</div>
        )}
      </div>

      {/* Done / Error actions */}
      {phase === "done" && (
        <div
          className="rounded-xl px-4 py-3 text-sm text-center"
          style={{ background: `${accent}22`, border: `1px solid ${accent}44`, color: accent }}
        >
          ✓ Installation complete — continuing setup...
        </div>
      )}

      {phase === "error" && (
        <div className="flex gap-3">
          <button
            onClick={() => {
              setPhase("password");
              setLines([]);
              setSteps([]);
              setExitCode(null);
            }}
            className="flex-1 py-3 rounded-xl border border-[rgba(255,255,255,0.1)] text-[#888] font-medium hover:text-white transition-all"
          >
            ← Try again
          </button>
          <button
            onClick={onDone}
            className="flex-[2] py-3 rounded-xl font-semibold transition-all hover:opacity-90"
            style={{ background: accent, color: "#0f0f0f" }}
          >
            Continue anyway →
          </button>
        </div>
      )}
    </div>
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
