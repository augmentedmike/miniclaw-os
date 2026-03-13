"use client";

import { useState, useEffect, useRef } from "react";
import type { WizardState } from "../SetupWizard";

interface Props {
  state: WizardState;
  onDone: () => void;
  accent: string;
}

type CheckStatus = "pending" | "running" | "ok" | "error";

interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail?: string;
}

interface SmokeResult {
  status: "pass" | "fail" | "warn";
  label: string;
}

export default function StepInstalling({ state, onDone, accent }: Props) {
  const [checks, setChecks] = useState<Check[]>([
    { id: "config", label: "Saving your configuration", status: "pending" },
    { id: "gateway", label: "Starting the gateway", status: "pending" },
    { id: "complete", label: "Finalizing setup", status: "pending" },
    { id: "smoke", label: "Running system checks", status: "pending" },
  ]);
  const [smokeResults, setSmokeResults] = useState<SmokeResult[]>([]);
  const [smokeSummary, setSmokeSummary] = useState<{ passed: number; failed: number; warned: number } | null>(null);

  const checksRef = useRef(checks);
  const updateCheck = (id: string, patch: Partial<Check>) => {
    setChecks((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...patch } : c));
      checksRef.current = next;
      return next;
    });
  };

  useEffect(() => {
    const run = async () => {
      // 1. Save config + persist state
      updateCheck("config", { status: "running" });
      await delay(400);
      try {
        await fetch("/api/setup/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assistantName: state.assistantName,
            shortName: state.shortName,
            accentColor: state.accentColor,
            pronouns: state.pronouns,
            personaBlurb: state.personaBlurb,
          }),
        });
        updateCheck("config", { status: "ok", detail: "Config saved" });
      } catch {
        updateCheck("config", { status: "error", detail: "Failed to save config" });
      }

      // 2. Complete setup (registers telegram, starts gateway, etc.)
      updateCheck("gateway", { status: "running" });
      try {
        const res = await fetch("/api/setup/complete", { method: "POST" });
        const data = await res.json();
        if (data.gateway?.ok) {
          updateCheck("gateway", { status: "ok", detail: "Gateway running" });
        } else {
          updateCheck("gateway", { status: "ok", detail: data.gateway?.error || "Gateway installed — may need a moment" });
        }
      } catch {
        updateCheck("gateway", { status: "error", detail: "Could not start gateway" });
      }

      // 3. Mark complete
      updateCheck("complete", { status: "running" });
      await delay(300);
      updateCheck("complete", { status: "ok", detail: "Setup complete" });

      // 4. Run mc-smoke via SSE
      updateCheck("smoke", { status: "running" });
      try {
        const res = await fetch("/api/setup/smoke");
        if (!res.ok || !res.body) {
          updateCheck("smoke", { status: "error", detail: "Could not run health checks" });
          await delay(1500);
          onDone();
          return;
        }

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

              if (evt.type === "check") {
                setSmokeResults((prev) => [...prev, { status: evt.status, label: evt.label }]);
              }

              if (evt.type === "done") {
                setSmokeSummary({ passed: evt.passed, failed: evt.failed, warned: evt.warned });
                if (evt.failed === 0) {
                  updateCheck("smoke", { status: "ok", detail: `${evt.passed} passed, ${evt.warned} warned` });
                } else {
                  updateCheck("smoke", { status: "error", detail: `${evt.failed} failed, ${evt.passed} passed` });
                }
              }
            } catch { /* skip */ }
          }
        }
      } catch {
        updateCheck("smoke", { status: "error", detail: "Health check failed to run" });
      }

      const hasFailures = checksRef.current.some((c) => c.status === "error");
      if (!hasFailures) {
        await delay(2000);
        onDone();
      }
      // If there are failures, don't auto-advance — show a button instead
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allDone = checks.every((c) => c.status === "ok" || c.status === "error");
  const hasErrors = checks.some((c) => c.status === "error");

  return (
    <div className="flex flex-col gap-6 items-center text-center">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Finishing up...</h2>
        <p className="text-[#888]">Starting {state.assistantName} and verifying everything works</p>
      </div>

      {/* Setup checks */}
      <div className="w-full flex flex-col gap-3">
        {checks.map((check) => (
          <div
            key={check.id}
            className="flex items-center gap-4 px-5 py-4 rounded-xl transition-all"
            style={{
              background:
                check.status === "ok" ? `${accent}11` :
                check.status === "error" ? "#FF525211" :
                check.status === "running" ? "rgba(255,255,255,0.05)" :
                "rgba(255,255,255,0.02)",
              border:
                check.status === "ok" ? `1px solid ${accent}33` :
                check.status === "error" ? "1px solid #FF525233" :
                check.status === "running" ? "1px solid rgba(255,255,255,0.1)" :
                "1px solid transparent",
            }}
          >
            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
              {check.status === "ok" && <span style={{ color: accent }}>✓</span>}
              {check.status === "error" && <span className="text-[#FF5252]">✗</span>}
              {check.status === "running" && (
                <div
                  className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                  style={{ borderColor: `${accent}66`, borderTopColor: "transparent" }}
                />
              )}
              {check.status === "pending" && (
                <div className="w-4 h-4 rounded-full border border-[rgba(255,255,255,0.1)]" />
              )}
            </div>
            <div className="flex-1 text-left">
              <div
                className="text-sm font-medium"
                style={{
                  color: check.status === "ok" || check.status === "running" ? "#fff" : "#666",
                }}
              >
                {check.label}
              </div>
              {check.detail && (
                <div className="text-xs text-[#666] mt-0.5">{check.detail}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Smoke test results (collapsed list) */}
      {smokeResults.length > 0 && (
        <details className="w-full text-left" open={smokeSummary?.failed !== undefined && smokeSummary.failed > 0}>
          <summary className="text-xs text-[#555] cursor-pointer hover:text-[#888] transition-colors">
            {smokeSummary
              ? `${smokeSummary.passed} passed · ${smokeSummary.warned} warned · ${smokeSummary.failed} failed`
              : `${smokeResults.length} checks so far...`}
          </summary>
          <div className="mt-2 rounded-lg bg-[#0a0a0a] border border-[rgba(255,255,255,0.06)] p-3 max-h-48 overflow-y-auto">
            {smokeResults.map((r, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5 text-xs font-mono">
                <span style={{
                  color: r.status === "pass" ? "#4ade80" : r.status === "fail" ? "#FF5252" : "#fbbf24"
                }}>
                  {r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "⚠"}
                </span>
                <span className="text-[#888]">{r.label}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {allDone && !hasErrors && (
        <p className="text-sm text-[#666]">
          Taking you to {state.assistantName}...
        </p>
      )}

      {allDone && hasErrors && (
        <div className="w-full flex flex-col gap-3">
          <p className="text-sm text-[#888]">
            Some checks had issues. You can continue — these can be fixed later with <span className="font-mono text-[#aaa]">mc-doctor</span>.
          </p>
          <button
            onClick={onDone}
            className="w-full py-3 rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
            style={{ background: accent, color: "#0f0f0f" }}
          >
            Continue anyway →
          </button>
        </div>
      )}
    </div>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
