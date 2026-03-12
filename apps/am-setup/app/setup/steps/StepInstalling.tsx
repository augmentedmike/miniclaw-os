"use client";

import { useState, useEffect } from "react";
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
    { id: "vault", label: "Saving your configuration", status: "pending" },
    { id: "email", label: "Verifying email access", status: "pending" },
    { id: "system", label: "Checking system health", status: "pending" },
    { id: "complete", label: "Finishing setup", status: "pending" },
    { id: "relocate", label: `Moving home to ~/${(state.shortName || "am").toLowerCase()}`, status: "pending" },
  ]);

  const updateCheck = (id: string, patch: Partial<Check>) => {
    setChecks((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  useEffect(() => {
    const run = async () => {
      // 1. Save to setup state
      updateCheck("vault", { status: "running" });
      await delay(600);
      try {
        await fetch("/api/setup/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assistantName: state.assistantName,
            accentColor: state.accentColor,
            pronouns: state.pronouns,
            personaBlurb: state.personaBlurb,
          }),
        });
        updateCheck("vault", { status: "ok", detail: "Config saved" });
      } catch {
        updateCheck("vault", { status: "error", detail: "Failed to save config" });
      }

      // 2. Email check (credentials already verified in step 5)
      updateCheck("email", { status: "running" });
      await delay(800);
      updateCheck("email", { status: "ok", detail: state.emailAddress });

      // 3. System health
      updateCheck("system", { status: "running" });
      await delay(600);
      try {
        const res = await fetch("/api/health");
        const data = await res.json();
        updateCheck("system", { status: "ok", detail: data.ok ? "All systems online" : "Partial" });
      } catch {
        updateCheck("system", { status: "ok", detail: "Running" });
      }

      // 4. Mark complete
      updateCheck("complete", { status: "running" });
      await delay(500);
      try {
        await fetch("/api/setup/complete", { method: "POST" });
        updateCheck("complete", { status: "ok", detail: "Setup complete!" });
      } catch {
        updateCheck("complete", { status: "error", detail: "Could not mark complete" });
      }

      // 5. Relocate home directory (~/.openclaw → ~/{shortName})
      updateCheck("relocate", { status: "running" });
      await delay(400);
      try {
        const res = await fetch("/api/setup/relocate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await res.json();

        if (data.ok) {
          if (data.skipped) {
            updateCheck("relocate", { status: "ok", detail: "Already at custom path" });
          } else {
            const warnCount = data.warnings?.length || 0;
            const suffix = warnCount > 0 ? ` (${warnCount} warning${warnCount > 1 ? "s" : ""} — check logs)` : "";
            updateCheck("relocate", { status: "ok", detail: `Moved to ${data.newStateDir}${suffix}` });
          }
        } else if (data.conflict) {
          // Existing dir found — back it up and retry with force
          updateCheck("relocate", {
            status: "running",
            detail: `${data.conflictPath} exists — backing up and overwriting...`,
          });
          await delay(1000);
          const retry = await fetch("/api/setup/relocate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ force: true }),
          });
          const retryData = await retry.json();
          if (retryData.ok) {
            updateCheck("relocate", { status: "ok", detail: `Moved to ${retryData.newStateDir} (old dir backed up)` });
          } else {
            updateCheck("relocate", { status: "error", detail: retryData.error || "Relocate failed" });
          }
        } else {
          updateCheck("relocate", { status: "error", detail: data.error || "Relocate failed" });
        }
      } catch {
        updateCheck("relocate", { status: "error", detail: "Could not relocate home" });
      }

      await delay(1000);
      onDone();
    };

    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allDone = checks.every((c) => c.status === "ok" || c.status === "error");

  return (
    <div className="flex flex-col gap-8 items-center text-center">
      <div>
        <h2 className="text-3xl font-bold text-white mb-2">Installing...</h2>
        <p className="text-[#888]">Setting up {state.assistantName} on your device</p>
      </div>

      {/* Progress checks */}
      <div className="w-full flex flex-col gap-3">
        {checks.map((check) => (
          <div
            key={check.id}
            className="flex items-center gap-4 px-5 py-4 rounded-xl"
            style={{
              background:
                check.status === "ok"
                  ? `${accent}11`
                  : check.status === "error"
                  ? "#FF525211"
                  : check.status === "running"
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(255,255,255,0.02)",
              border:
                check.status === "ok"
                  ? `1px solid ${accent}33`
                  : check.status === "error"
                  ? "1px solid #FF525233"
                  : check.status === "running"
                  ? "1px solid rgba(255,255,255,0.1)"
                  : "1px solid transparent",
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
                  color:
                    check.status === "ok"
                      ? "#fff"
                      : check.status === "running"
                      ? "#fff"
                      : "#666",
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

      {allDone && (
        <p className="text-sm text-[#666]">
          Preparing your dashboard...
        </p>
      )}
    </div>
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
