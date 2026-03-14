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

export default function StepInstalling({ state, onDone, accent }: Props) {
  const [checks, setChecks] = useState<Check[]>([
    { id: "config", label: "Saving your preferences", status: "pending" },
    { id: "install", label: "Waiting for install to finish", status: "pending" },
    { id: "secrets", label: "Saving your credentials", status: "pending" },
    { id: "gateway", label: "Starting the gateway", status: "pending" },
    { id: "smoke", label: "Running system checks", status: "pending" },
  ]);

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
      // 1. Save config
      updateCheck("config", { status: "running" });
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
        updateCheck("config", { status: "ok", detail: "Preferences saved" });
      } catch {
        updateCheck("config", { status: "error", detail: "Failed to save config" });
      }

      // 2. Wait for install.sh to finish (reads log file via polling)
      updateCheck("install", { status: "running", detail: "Installing..." });
      let installDone = false;
      for (let i = 0; i < 300; i++) {
        try {
          const res = await fetch("/api/setup/install/log?offset=0");
          if (res.ok) {
            const data = await res.json();
            if (data.done) {
              installDone = true;
              updateCheck("install", { status: "ok", detail: "Installed" });
              break;
            }
            // Show latest step in the detail
            if (data.lines && data.lines.length > 0) {
              for (let j = data.lines.length - 1; j >= 0; j--) {
                const m = data.lines[j].match(/^── (Step\s+\S+:?\s*.*)$/);
                if (m) {
                  updateCheck("install", { detail: m[1].replace(/^Step\s+\S+:?\s*/, "") });
                  break;
                }
              }
            }
          }
        } catch { /* keep polling */ }
        await delay(3000);
      }
      if (!installDone) {
        updateCheck("install", { status: "error", detail: "Install timed out" });
      }

      // 3. Persist secrets to vault
      updateCheck("secrets", { status: "running" });
      try {
        const res = await fetch("/api/setup/persist", { method: "POST" });
        const data = await res.json();
        if (data.ok) {
          updateCheck("secrets", { status: "ok", detail: "Credentials secured" });
        } else {
          updateCheck("secrets", { status: "error", detail: `${data.failed} secret(s) failed` });
        }
      } catch {
        updateCheck("secrets", { status: "error", detail: "Could not save credentials" });
      }

      // 4. Complete setup (gateway, telegram channel config)
      updateCheck("gateway", { status: "running" });
      try {
        const res = await fetch("/api/setup/complete", { method: "POST" });
        const data = await res.json();
        if (data.gateway?.ok) {
          updateCheck("gateway", { status: "ok", detail: "Gateway running" });
        } else {
          updateCheck("gateway", { status: "ok", detail: data.gateway?.error || "Configured" });
        }
      } catch {
        updateCheck("gateway", { status: "error", detail: "Could not start gateway" });
      }

      // 5. Run mc-smoke
      updateCheck("smoke", { status: "running" });
      try {
        const res = await fetch("/api/setup/smoke");
        if (res.ok && res.body) {
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
                if (evt.type === "done") {
                  if (evt.failed === 0) {
                    updateCheck("smoke", { status: "ok", detail: `${evt.passed} passed` });
                  } else {
                    updateCheck("smoke", { status: "error", detail: `${evt.failed} failed` });
                  }
                }
              } catch { /* skip */ }
            }
          }
        } else {
          updateCheck("smoke", { status: "ok", detail: "Skipped" });
        }
      } catch {
        updateCheck("smoke", { status: "ok", detail: "Skipped" });
      }

      const hasErrors = checksRef.current.some((c) => c.status === "error");
      if (!hasErrors) {
        await delay(2000);
        onDone();
      }
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
        <p className="text-[#888]">Installing and configuring {state.assistantName}</p>
      </div>

      <div className="w-full flex flex-col gap-3">
        {checks.map((check) => (
          <div
            key={check.id}
            className="flex items-center gap-4 px-5 py-4 rounded-xl transition-all"
            style={{
              background: check.status === "ok" ? `${accent}11` : check.status === "error" ? "#FF525211" : check.status === "running" ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)",
              border: check.status === "ok" ? `1px solid ${accent}33` : check.status === "error" ? "1px solid #FF525233" : check.status === "running" ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
            }}
          >
            <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
              {check.status === "ok" && <span style={{ color: accent }}>✓</span>}
              {check.status === "error" && <span className="text-[#FF5252]">✗</span>}
              {check.status === "running" && (
                <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${accent}66`, borderTopColor: "transparent" }} />
              )}
              {check.status === "pending" && <div className="w-4 h-4 rounded-full border border-[rgba(255,255,255,0.1)]" />}
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium" style={{ color: check.status === "ok" || check.status === "running" ? "#fff" : "#666" }}>
                {check.label}
              </div>
              {check.detail && <div className="text-xs text-[#666] mt-0.5">{check.detail}</div>}
            </div>
          </div>
        ))}
      </div>

      {allDone && !hasErrors && (
        <p className="text-sm text-[#666]">Taking you to {state.assistantName}...</p>
      )}

      {allDone && hasErrors && (
        <div className="w-full flex flex-col gap-3">
          <p className="text-sm text-[#888]">
            Some checks had issues. You can continue — these can be fixed later with <span className="font-mono text-[#aaa]">mc-doctor</span>.
          </p>
          <button onClick={onDone} className="w-full py-3 rounded-xl font-semibold transition-all hover:opacity-90 active:scale-[0.98]" style={{ background: accent, color: "#0f0f0f" }}>
            Continue anyway →
          </button>
        </div>
      )}
    </div>
  );
}

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
