"use client";

import type { WorkLogEntry2 } from "@/lib/types";

interface Props {
  workLog: WorkLogEntry2[];
  onClose: () => void;
}

const COL_COLOR: Record<string, { bg: string; text: string }> = {
  backlog:       { bg: "#3b0764", text: "#c084fc" },
  "in-progress": { bg: "#1e3a5f", text: "#60a5fa" },
  "in-review":   { bg: "#451a03", text: "#fb923c" },
  shipped:       { bg: "#052e16", text: "var(--accent)" },
};

function ColBadge({ col }: { col: string }) {
  const c = COL_COLOR[col] ?? { bg: "#27272a", text: "#a1a1aa" };
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
      padding: "1px 6px", borderRadius: 3,
      background: c.bg, color: c.text, flexShrink: 0,
    }}>
      {col.replace("-", " ")}
    </span>
  );
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function SummaryModal({ workLog, onClose }: Props) {
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  const windowEnd = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  // Group by cardId, preserving order of most recent entry per card
  const grouped: Array<{ cardId: string; title: string; column: string; entries: WorkLogEntry2[] }> = [];
  const seen = new Map<string, typeof grouped[number]>();
  for (const e of workLog) {
    if (!seen.has(e.cardId)) {
      const g = { cardId: e.cardId, title: e.title, column: e.column, entries: [] };
      grouped.push(g);
      seen.set(e.cardId, g);
    }
    seen.get(e.cardId)!.entries.push(e);
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 800,
        background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "min(720px, 100%)", maxHeight: "calc(100vh - 48px)",
        background: "#0f0f12", border: "1px solid #2a2a33",
        borderRadius: 12, boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 24px 16px",
          borderBottom: "1px solid #1e1e26",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#f4f4f5" }}>
              Last Hour — Work Done
            </div>
            <div style={{ fontSize: 11, color: "#52525b", marginTop: 3, fontFamily: "monospace" }}>
              {windowStart} → {windowEnd} · {workLog.length} log entr{workLog.length === 1 ? "y" : "ies"} across {grouped.length} card{grouped.length === 1 ? "" : "s"}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ color: "#52525b", background: "none", border: "none", cursor: "pointer", fontSize: 22, lineHeight: 1 }}
            onMouseEnter={e => (e.currentTarget.style.color = "#a1a1aa")}
            onMouseLeave={e => (e.currentTarget.style.color = "#52525b")}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 24px" }}>
          {grouped.length === 0 ? (
            <div style={{ color: "#52525b", fontSize: 13, textAlign: "center", padding: "40px 0", fontStyle: "italic" }}>
              No agent work logged in the last hour.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {grouped.map(group => (
                <div key={group.cardId} style={{
                  background: "#141418", border: "1px solid #1e1e26", borderRadius: 8, overflow: "hidden",
                }}>
                  {/* Card header */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 14px", borderBottom: "1px solid #1e1e26",
                    background: "#18181c",
                  }}>
                    <ColBadge col={group.column} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#e4e4e7", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {group.title}
                    </span>
                    <span style={{ fontSize: 10, color: "#3f3f46", fontFamily: "monospace", flexShrink: 0 }}>
                      {group.cardId}
                    </span>
                  </div>

                  {/* Work log entries */}
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {group.entries.map((e, i) => (
                      <div key={i} style={{
                        padding: "10px 14px",
                        borderBottom: i < group.entries.length - 1 ? "1px solid #1a1a20" : undefined,
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                          <span style={{ fontSize: 10, color: "#52525b", fontFamily: "monospace" }}>
                            {e.worker.replace("board-worker-", "").replace("am-process", "agent")}
                          </span>
                          <span style={{ fontSize: 10, color: "#3f3f46", fontFamily: "monospace", marginLeft: "auto" }}>
                            {fmtTime(e.at)}
                          </span>
                        </div>
                        <div style={{
                          fontSize: 12, color: "#a1a1aa", lineHeight: 1.6,
                          whiteSpace: "pre-wrap", wordBreak: "break-word",
                        }}>
                          {e.note}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
