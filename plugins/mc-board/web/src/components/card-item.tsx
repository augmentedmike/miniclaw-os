"use client";

import { BoardCard, Priority } from "@/lib/types";
import { memo, useState } from "react";

function HoldBadge({ held, onToggle }: { held: boolean; onToggle?: (e: React.MouseEvent) => void }) {
  const [hovered, setHovered] = useState(false);
  const style: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
    padding: "2px 6px", borderRadius: 3, cursor: onToggle ? "pointer" : "default",
    transition: "background 0.1s, color 0.1s",
    background: held ? "#fbbf24" : hovered ? "#1c1917" : "#27272a",
    color: held ? "#1c1917" : hovered ? "#a8a29e" : "#52525b",
    border: held ? "1px solid #f59e0b" : hovered ? "1px solid #78716c" : "1px solid transparent",
  };
  return (
    <span style={style} onClick={onToggle}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      title={held ? "Unhold" : "Hold"}
    >{held ? "↩" : "⏸"}</span>
  );
}

function FocusBadge({ focused, onToggle }: { focused: boolean; onToggle?: (e: React.MouseEvent) => void }) {
  const [hovered, setHovered] = useState(false);
  const style: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em",
    padding: "2px 6px", borderRadius: 3, cursor: onToggle ? "pointer" : "default",
    transition: "background 0.1s, color 0.1s",
    background: focused ? "#f59e0b" : hovered ? "#713f12" : "#27272a",
    color: focused ? "#451a03" : hovered ? "#fbbf24" : "#52525b",
  };
  return (
    <span
      style={style}
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={focused ? "Remove focus" : "Set focus"}
    >focus</span>
  );
}

const PRIO_STYLE: Record<Priority, { bg: string; color: string }> = {
  critical: { bg: "#450a0a", color: "#f87171" },
  high:     { bg: "#3b0a0a", color: "#fca5a5" },
  medium:   { bg: "#431407", color: "#fdba74" },
  low:      { bg: "#27272a", color: "#a1a1aa" },
};

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PROG_COLOR = (pct: number) =>
  pct >= 100 ? "#22c55e" : pct >= 50 ? "#3b82f6" : "#f97316";

interface Props {
  card: BoardCard;
  projectName?: string;
  isActive: boolean;
  worker?: string;
  blockedBy?: string[];
  onClick: (id: string) => void;
  onWatchClick?: (id: string) => void;
  onFocusToggle?: (id: string, focused: boolean) => void;
  onHoldToggle?: (id: string) => void;
  onInjectContext?: (ctx: string) => void;
}

export const CardItem = memo(function CardItem({ card, projectName, isActive, worker, blockedBy, onClick, onWatchClick, onFocusToggle, onHoldToggle, onInjectContext }: Props) {
  const { checked, total } = { checked: card.criteria_checked, total: card.criteria_total };
  const pct = total > 0 ? Math.round((checked / total) * 100) : -1;
  const focused = card.tags.includes("focus");
  const held = card.tags.includes("hold");
  const [idCopied, setIdCopied] = useState(false);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!onInjectContext) return;
    e.preventDefault();
    const lines = [
      `[Card: ${card.id}] ${card.title}`,
      `Column: ${card.column}`,
      `Priority: ${card.priority}`,
    ];
    if (card.tags.length > 0) lines.push(`Tags: ${card.tags.join(", ")}`);
    if (total > 0) {
      lines.push(`Criteria: ${checked}/${total} done`);
    }
    onInjectContext(lines.join("\n"));
  };

  return (
    <div
      data-card-id={card.id}
      onClick={() => onClick(card.id)}
      onContextMenu={handleContextMenu}
      className={`card${isActive ? " card--active" : ""}${held ? " card--held" : ""}`}
    >
      {/* Worker strip — click opens live log */}
      <div
        className="card-worker"
        onClick={isActive && onWatchClick ? (e) => { e.stopPropagation(); onWatchClick(card.id); } : undefined}
        style={isActive && onWatchClick ? { cursor: "pointer" } : undefined}
        title={isActive ? "View live log" : undefined}
      >
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0, display: "inline-block" }} />
        {worker ?? "agent working"}
      </div>

      {/* Header: id + focus badge + priority badge */}
      <div className="card-header">
        <span
          className={`card-id card-id--clickable${idCopied ? " card-id--copied" : ""}`}
          title="Right click the card number to reference it in web chat"
          onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(card.id).then(() => {
              setIdCopied(true);
              setTimeout(() => setIdCopied(false), 1600);
            });
          }}
        >{idCopied ? "copied!" : card.id}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <HoldBadge held={held} onToggle={onHoldToggle ? (e) => { e.stopPropagation(); onHoldToggle(card.id); } : undefined} />
          <FocusBadge focused={focused} onToggle={onFocusToggle ? (e) => { e.stopPropagation(); onFocusToggle(card.id, !focused); } : undefined} />
          <span style={{
            fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
            padding: "2px 6px", borderRadius: 3,
            background: PRIO_STYLE[card.priority].bg,
            color: PRIO_STYLE[card.priority].color,
          }}>{card.priority}</span>
        </div>
      </div>

      {/* Title + active dot (clickable to open watch modal) */}
      <div className="card-title-row">
        <div className="card-title">{card.title}</div>
        <span
          className="card-active-dot"
          onClick={isActive && onWatchClick ? (e) => { e.stopPropagation(); onWatchClick(card.id); } : undefined}
          style={isActive && onWatchClick ? { cursor: "pointer" } : undefined}
          title={isActive ? "View live log" : undefined}
        />
      </div>

      {/* Blocker banner */}
      {blockedBy && blockedBy.length > 0 && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 4, flexWrap: "wrap",
          marginBottom: 4, padding: "3px 6px", borderRadius: 3,
          background: "#431407", border: "1px solid #7c2d12",
        }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>blocked</span>
          <span style={{ fontSize: 10, color: "#fb923c", fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
            {blockedBy.join(", ")}
          </span>
        </div>
      )}

      {/* Type badge */}
      {card.work_type && (
        <div style={{ marginBottom: 4 }}>
          <span style={{
            display: "inline-block",
            padding: "2px 6px",
            borderRadius: "3px",
            fontSize: "11px",
            fontWeight: "600",
            textTransform: "uppercase",
            background: card.work_type === "work" ? "#dbeafe" : "#fce7f3",
            color: card.work_type === "work" ? "#0c4a6e" : "#831843",
          }}>
            {card.work_type}
          </span>
          {card.linked_card_id && (
            <span style={{ marginLeft: 6, fontSize: "12px", color: "#71717a" }}>
              → {card.linked_card_id}
            </span>
          )}
        </div>
      )}

      {/* Tags */}
      {card.tags.length > 0 && (
        <div className="card-tags">
          {card.tags.slice(0, 5).map(tag => (
            <span key={tag} className="tag">{tag}</span>
          ))}
        </div>
      )}

      {/* Criteria bar */}
      {pct >= 0 && (
        <div style={{ marginBottom: 4 }}>
          <div className="criteria-bar">
            <div className="criteria-fill" style={{ width: `${pct}%`, background: PROG_COLOR(pct) }} />
          </div>
          <span className="criteria-label">{checked}/{total} criteria</span>
        </div>
      )}

      {/* Meta */}
      <div className="card-meta">
        {projectName && <span style={{ color: "#71717a", marginRight: 6 }}>{projectName} ·</span>}
        {card.shipped_at
          ? <>shipped {fmtDate(card.shipped_at)}</>
          : <>updated {fmtDate(card.updated_at)}</>
        }
      </div>
    </div>
  );
});
