"use client";

import type { TriageColumnState } from "@/hooks/useTriageColumn";

interface Props extends TriageColumnState {
  onOpenTriage: () => void;
  onOpenWork?: () => void;
  launching?: boolean;
  maxConcurrent: number;
  onMaxConcurrentChange: (n: number) => void;
}

export function TriageControls({
  cronEnabled, cronMinutes, cronLoaded,
  handleToggleCron, handleMinutesChange,
  onOpenTriage, onOpenWork, launching,
  maxConcurrent, onMaxConcurrentChange,
}: Props) {
  if (!cronLoaded) return null;

  return (
    <>
      <button
        onClick={handleToggleCron}
        title={cronEnabled ? "Disable scheduler" : "Enable scheduler"}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          fontSize: 10, padding: "3px 8px", borderRadius: 4,
          background: cronEnabled ? "#14532d" : "#27272a",
          border: `1px solid ${cronEnabled ? "#16a34a" : "#52525b"}`,
          color: cronEnabled ? "#86efac" : "#71717a",
          cursor: "pointer", lineHeight: 1.6,
        }}
      >
        <span style={{
          width: 5, height: 5, borderRadius: "50%",
          background: cronEnabled ? "#22c55e" : "#52525b",
          display: "inline-block",
        }} />
        {cronEnabled ? "on" : "off"}
      </button>

      <select
        onClick={e => e.stopPropagation()}
        value={cronMinutes}
        onChange={handleMinutesChange}
        style={{
          fontSize: 10, padding: "3px 6px", borderRadius: 4,
          background: "#27272a", border: "1px solid #52525b",
          color: "#a1a1aa", cursor: "pointer", lineHeight: 1.6,
          appearance: "none", WebkitAppearance: "none",
        }}
      >
        {[1, 5, 10, 15, 30, 60].map(m => (
          <option key={m} value={m}>{m}m</option>
        ))}
      </select>

      <select
        onClick={e => e.stopPropagation()}
        value={maxConcurrent}
        onChange={e => onMaxConcurrentChange(parseInt(e.target.value, 10))}
        title="Max cards worked concurrently"
        style={{
          fontSize: 10, padding: "3px 6px", borderRadius: 4,
          background: "#27272a", border: "1px solid #52525b",
          color: "#a1a1aa", cursor: "pointer", lineHeight: 1.6,
          appearance: "none", WebkitAppearance: "none",
        }}
      >
        {[1, 2, 3, 4, 5].map(n => (
          <option key={n} value={n}>{n}×</option>
        ))}
      </select>

      <button
        onClick={e => { e.stopPropagation(); onOpenTriage(); }}
        style={{
          fontSize: 10, padding: "3px 9px", borderRadius: 4,
          background: "#27272a", border: "1px solid #52525b",
          color: "#a1a1aa", cursor: "pointer", lineHeight: 1.6,
        }}
      >
        ⚙ Triage
      </button>

      {onOpenWork && (
        <button
          onClick={e => { e.stopPropagation(); onOpenWork(); }}
          disabled={launching}
          title={`Work top ${maxConcurrent} card${maxConcurrent === 1 ? "" : "s"}`}
          style={{
            fontSize: 10, padding: "3px 9px", borderRadius: 4,
            background: launching ? "#292524" : "#27272a",
            border: `1px solid ${launching ? "#92400e" : "#78350f"}`,
            color: launching ? "#92400e" : "#f59e0b",
            cursor: launching ? "not-allowed" : "pointer", lineHeight: 1.6,
          }}
        >
          {launching ? "…" : "▶ Work"}
        </button>
      )}
    </>
  );
}
