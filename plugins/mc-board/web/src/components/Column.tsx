"use client";

import { Card, Column as ColumnType, Priority, Project } from "@/lib/types";
import { CardItem } from "./CardItem";
import { useMemo, useState } from "react";
import { BacklogSchedulerModal } from "./BacklogSchedulerModal";

const PRIORITY_RANK: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

type ColStyle = { badge: string; label: string };
const COL_STYLES: Record<ColumnType, ColStyle> = {
  backlog:      { badge: "bg-zinc-600 text-zinc-100",     label: "BACKLOG" },
  "in-progress":{ badge: "bg-blue-600 text-blue-50",      label: "IN PROGRESS" },
  "in-review":  { badge: "bg-amber-500 text-amber-950",   label: "IN REVIEW" },
  shipped:      { badge: "bg-green-600 text-green-50",    label: "SHIPPED" },
};

function sortCards(cards: Card[], activeIds: Set<string>): Card[] {
  return [...cards].sort((a, b) => {
    const aA = activeIds.has(a.id) ? 0 : 1;
    const bA = activeIds.has(b.id) ? 0 : 1;
    if (aA !== bA) return aA - bA;
    const pd = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (pd !== 0) return pd;
    return a.created_at < b.created_at ? -1 : 1;
  });
}

interface Props {
  column: ColumnType;
  cards: Card[];
  projects: Project[];
  activeIds: Set<string>;
  activeWorkers?: Record<string, string>;
  onCardClick: (id: string) => void;
  /** shipped-only: collapsed state */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Column({ column, cards, projects, activeIds, activeWorkers, onCardClick, collapsed, onToggleCollapse }: Props) {
  const [showScheduler, setShowScheduler] = useState(false);

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map(p => [p.id, p.name])),
    [projects]
  );

  const colCards = useMemo(
    () => sortCards(cards.filter(c => c.column === column), activeIds),
    [cards, column, activeIds]
  );

  const s = COL_STYLES[column];
  const isShipped = column === "shipped";

  if (isShipped && collapsed) {
    return (
      <div
        className="shipped-col"
        onClick={onToggleCollapse}
        title={`Show shipped (${colCards.length})`}
      >
        <span className="shipped-label">Shipped&nbsp;({colCards.length})</span>
      </div>
    );
  }

  return (
    <div className={`column${isShipped ? " shipped-col open" : ""}`}>
      <div
        className="column-header"
        onClick={isShipped ? onToggleCollapse : undefined}
        style={{ cursor: isShipped ? "pointer" : undefined, justifyContent: "flex-start", gap: 8 }}
      >
        <span className={`column-badge ${s.badge}`}>{s.label}</span>
        <span className="column-count">{colCards.length}</span>
        {column === "backlog" && (
          <button
            onClick={e => { e.stopPropagation(); setShowScheduler(true); }}
            style={{
              marginLeft: "auto", fontSize: 10, padding: "3px 9px", borderRadius: 5,
              background: "#27272a", border: "1px solid #52525b",
              color: "#a1a1aa", cursor: "pointer", lineHeight: 1.6, flexShrink: 0,
            }}
          >
            ⚙ Scheduler
          </button>
        )}
      </div>
      <div className="column-cards">
        {colCards.length === 0
          ? <div className="column-empty">empty</div>
          : colCards.map(card => (
              <CardItem
                key={card.id}
                card={card}
                projectName={card.project_id ? projectMap[card.project_id] : undefined}
                isActive={activeIds.has(card.id)}
                worker={activeWorkers?.[card.id]}
                onClick={onCardClick}
              />
            ))
        }
      </div>
      {showScheduler && <BacklogSchedulerModal onClose={() => setShowScheduler(false)} />}
    </div>
  );
}
