"use client";

import { Card, Priority } from "@/lib/types";
import { memo } from "react";

const PRIO_COLOR: Record<Priority, string> = {
  high: "#ef4444",
  medium: "#f97316",
  low: "#71717a",
};

function criteriaProgress(criteria: string): { checked: number; total: number } {
  const lines = criteria.split("\n").filter(l => /^\s*-\s*\[/.test(l));
  const checked = lines.filter(l => /^\s*-\s*\[x\]/i.test(l)).length;
  return { checked, total: lines.length };
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const PROG_COLOR = (pct: number) =>
  pct >= 100 ? "#22c55e" : pct >= 50 ? "#3b82f6" : "#f97316";

interface Props {
  card: Card;
  projectName?: string;
  isActive: boolean;
  worker?: string;
  onClick: (id: string) => void;
}

export const CardItem = memo(function CardItem({ card, projectName, isActive, worker, onClick }: Props) {
  const { checked, total } = criteriaProgress(card.acceptance_criteria);
  const pct = total > 0 ? Math.round((checked / total) * 100) : -1;

  return (
    <div
      onClick={() => onClick(card.id)}
      className={`card${isActive ? " card--active" : ""}`}
    >
      {/* Worker strip (active only) */}
      <div className="card-worker">
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0, display: "inline-block" }} />
        {worker ?? "agent working"}
      </div>

      {/* Header: id + priority dot */}
      <div className="card-header">
        <span className="card-id">{card.id}</span>
        <span className="priority-dot" style={{ background: PRIO_COLOR[card.priority] }} title={card.priority} />
      </div>

      {/* Title + active dot */}
      <div className="card-title-row">
        <div className="card-title">{card.title}</div>
        <span className="card-active-dot" />
      </div>

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
        updated {fmtDate(card.updated_at)}
      </div>
    </div>
  );
});
