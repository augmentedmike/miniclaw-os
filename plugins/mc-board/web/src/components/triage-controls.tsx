"use client";

import type { TriageColumnState } from "@/hooks/useTriageColumn";

interface Props extends TriageColumnState {
  column?: string;
  onOpenTriage: () => void;
  onOpenWork?: () => void;
  hasWorkCards?: boolean;
  hasTriageCards?: boolean;
  launching?: boolean;
  maxConcurrent: number;
  onMaxConcurrentChange: (n: number) => void;
  showTriageButton?: boolean;
}

export function TriageControls({
  column,
  cronEnabled, cronMinutes, cronLoaded,
  handleToggleCron, handleMinutesChange,
  onOpenTriage, onOpenWork, hasWorkCards, hasTriageCards, launching,
  maxConcurrent, onMaxConcurrentChange,
  showTriageButton = true,
}: Props) {
  const t = (id: string) => column ? `${column}-${id}` : undefined;
  if (!cronLoaded) return null;

  return (
    <div className="triage-controls">
      <button
        data-tour={t("toggle")}
        onClick={handleToggleCron}
        title={cronEnabled ? "Disable scheduler" : "Enable scheduler"}
        className={`triage-btn triage-btn--toggle${cronEnabled ? " on" : ""}`}
      >
        <span style={{
          width: 5, height: 5, borderRadius: "50%",
          background: cronEnabled ? "#22c55e" : "#52525b",
          display: "inline-block", flexShrink: 0,
        }} />
        <span className="triage-label">{cronEnabled ? "on" : "off"}</span>
      </button>

      <select
        data-tour={t("interval")}
        onClick={e => e.stopPropagation()}
        value={cronMinutes}
        onChange={handleMinutesChange}
        className="triage-select"
      >
        {[1, 5, 10, 15, 30, 60].map(m => (
          <option key={m} value={m}>{m}m</option>
        ))}
      </select>

      <select
        data-tour={t("max")}
        onClick={e => e.stopPropagation()}
        value={maxConcurrent}
        onChange={e => onMaxConcurrentChange(parseInt(e.target.value, 10))}
        title="Max cards worked concurrently"
        className="triage-select"
      >
        {[1, 3, 5, 10].map(n => (
          <option key={n} value={n}>{n}×</option>
        ))}
      </select>

      {showTriageButton && (
        <button
          data-tour={t("triage")}
          onClick={e => { e.stopPropagation(); if (hasTriageCards) onOpenTriage(); }}
          disabled={!hasTriageCards}
          title={hasTriageCards ? "Triage backlog cards" : "No cards to triage"}
          className="btn-action triage-btn"
        >
          <span>⚙</span><span className="triage-label">Triage</span>
        </button>
      )}

      {onOpenWork && (
        <button
          data-tour={t("work")}
          onClick={e => { e.stopPropagation(); if (hasWorkCards) onOpenWork(); }}
          disabled={launching || !hasWorkCards}
          title={hasWorkCards ? `Work top ${maxConcurrent} card${maxConcurrent === 1 ? "" : "s"}` : "No cards to work"}
          className={`btn-action triage-btn${launching ? " launching" : ""}`}
          style={launching ? {
            background: "#292524",
            border: "1px solid #92400e",
            color: "#92400e",
          } : undefined}
        >
          <span>{launching ? "…" : "▶"}</span><span className="triage-label">{launching ? "" : "Work"}</span>
        </button>
      )}
    </div>
  );
}
