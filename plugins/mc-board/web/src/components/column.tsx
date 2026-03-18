"use client";

import { useMemo, useState, useCallback } from "react";
import type { BoardCard, Column as ColumnType, Project } from "@/lib/types";
import { ColumnShell } from "./column-shell";
import { TriageControls } from "./triage-controls";
import { CardItem } from "./card-item";
import { TriageModal } from "./triage-modal";
import { WorkModal } from "./work-modal";
import { useTriageColumn } from "@/hooks/useTriageColumn";

const TRIAGE_COLUMNS = new Set<ColumnType>(["backlog", "in-progress", "in-review"]);

function lsMaxKey(column: ColumnType) { return `mc-board:${column}-triage:maxConcurrent`; }

interface Props {
  column: ColumnType;
  cards: BoardCard[];
  globalShippedIds?: Set<string>;
  projects: Project[];
  activeIds: Set<string>;
  activeWorkers?: Record<string, string>;
  onCardClick: (id: string) => void;
  onWatchClick?: (id: string) => void;
  showHeld?: boolean;
  onFocusToggle?: (cardId: string, focused: boolean) => void;
  onHoldToggle?: (cardId: string) => void;
  onInjectContext?: (ctx: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface TriageHeaderProps {
  column: ColumnType;
  topCards: BoardCard[];
  onOpenTriage: () => void;
  onOpenWork?: (cards: BoardCard[]) => void;
}

function TriageColumnHeader({ column, topCards, onOpenTriage, onOpenWork }: TriageHeaderProps) {
  const triage = useTriageColumn(column);

  const [maxConcurrent, setMaxConcurrent] = useState<number>(() => {
    if (typeof window === "undefined") return 3;
    return parseInt(localStorage.getItem(lsMaxKey(column)) ?? "3", 10);
  });

  const handleMaxChange = useCallback((n: number) => {
    setMaxConcurrent(n);
    localStorage.setItem(lsMaxKey(column), String(n));
    fetch("/api/cron", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: `board-${column}-triage`, maxConcurrent: n }),
    }).catch(() => {});
  }, [column]);

  const workCards = topCards.slice(0, maxConcurrent);

  const handleOpenWork = useCallback(() => {
    if (workCards.length > 0) onOpenWork?.(workCards);
  }, [workCards, onOpenWork]);

  return (
    <TriageControls
      column={column}
      {...triage}
      maxConcurrent={maxConcurrent}
      onMaxConcurrentChange={handleMaxChange}
      onOpenTriage={onOpenTriage}
      onOpenWork={column === "backlog" ? undefined : handleOpenWork}
      hasWorkCards={workCards.length > 0}
      hasTriageCards={topCards.length > 0}
      showTriageButton={column === "backlog"}
    />
  );
}

export function Column({ column, cards, globalShippedIds, projects, activeIds, activeWorkers, showHeld, onCardClick, onWatchClick, onFocusToggle, onHoldToggle, onInjectContext, collapsed, onToggleCollapse }: Props) {
  const [showTriage, setShowTriage] = useState(false);
  const [showWork, setShowWork] = useState(false);
  const [workModalCards, setWorkModalCards] = useState<BoardCard[]>([]);
  const hasTriage = TRIAGE_COLUMNS.has(column);

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map(p => [p.id, p.name])),
    [projects],
  );

  // Use globalShippedIds from API (covers cross-project deps); fall back to local computation
  const shippedIds = useMemo(
    () => globalShippedIds ?? new Set(cards.filter(c => c.column === "shipped").map(c => c.id)),
    [globalShippedIds, cards],
  );

  const colCards = useMemo(
    () => cards
      .filter(c => c.column === column)
      .filter(c => showHeld || !c.tags?.some(t => t === "hold" || t === "on-hold" || t === "blocked"))
      .sort((a, b) => {
        const aFocused = a.tags?.includes("focus") ? 0 : 1;
        const bFocused = b.tags?.includes("focus") ? 0 : 1;
        return aFocused - bFocused;
      }),
    [cards, column, showHeld],
  );

  return (
    <>
      <ColumnShell
        column={column}
        count={colCards.length}
        activeCount={colCards.filter(c => activeIds.has(c.id)).length}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        headerActions={hasTriage ? (
          <TriageColumnHeader
            column={column}
            topCards={colCards}
            onOpenTriage={() => setShowTriage(true)}
            onOpenWork={(cards) => { setWorkModalCards(cards); setShowWork(true); }}
          />
        ) : undefined}
      >
        {colCards.length === 0
          ? <div className="column-empty">empty</div>
          : colCards.map(card => (
              <CardItem
                key={card.id}
                card={card}
                projectName={card.project_id ? projectMap[card.project_id] : undefined}
                isActive={activeIds.has(card.id)}
                worker={activeWorkers?.[card.id]}
                blockedBy={column === "backlog" ? card.depends_on.filter(dep => !shippedIds.has(dep)) : []}
                onClick={onCardClick}
                onWatchClick={onWatchClick}
                onFocusToggle={onFocusToggle}
                onHoldToggle={onHoldToggle}
                onInjectContext={onInjectContext}
              />
            ))
        }
      </ColumnShell>

      {showTriage && (
        <TriageModal column={column} onClose={() => setShowTriage(false)} />
      )}

      {showWork && (
        <WorkModal column={column} cards={workModalCards} onClose={() => setShowWork(false)} />
      )}
    </>
  );
}
