"use client";

import { useMemo, useState, useCallback } from "react";
import type { Card, Column as ColumnType, Project } from "@/lib/types";
import { ColumnShell } from "./ColumnShell";
import { TriageControls } from "./TriageControls";
import { CardItem } from "./CardItem";
import { TriageModal } from "./TriageModal";
import { WorkModal } from "./WorkModal";
import { useTriageColumn } from "@/hooks/useTriageColumn";

const TRIAGE_COLUMNS = new Set<ColumnType>(["backlog", "in-progress", "in-review"]);

function lsMaxKey(column: ColumnType) { return `mc-board:${column}-triage:maxConcurrent`; }

interface Props {
  column: ColumnType;
  cards: Card[];
  projects: Project[];
  activeIds: Set<string>;
  activeWorkers?: Record<string, string>;
  onCardClick: (id: string) => void;
  onWatchClick?: (id: string) => void;
  onFocusToggle?: (cardId: string, focused: boolean) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

interface TriageHeaderProps {
  column: ColumnType;
  topCards: Card[];
  onOpenTriage: () => void;
}

function TriageColumnHeader({ column, topCards, onOpenTriage }: TriageHeaderProps) {
  const triage = useTriageColumn(column);
  const [launching, setLaunching] = useState(false);

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

  const handleWork = useCallback(async () => {
    if (workCards.length === 0) return;
    // All triage columns: fire-and-forget, no modal
    setLaunching(true);
    try {
      const promptRes = await fetch(`/api/process/${column}`);
      const { prompt } = await promptRes.json() as { prompt: string };
      await Promise.all(workCards.map(card =>
        fetch(`/api/process/${column}/${card.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        }).catch(() => {})
      ));
    } finally {
      setLaunching(false);
    }
  }, [column, workCards]);

  return (
    <TriageControls
      {...triage}
      maxConcurrent={maxConcurrent}
      onMaxConcurrentChange={handleMaxChange}
      onOpenTriage={onOpenTriage}
      onOpenWork={workCards.length > 0 ? handleWork : undefined}
      launching={launching}
    />
  );
}

export function Column({ column, cards, projects, activeIds, activeWorkers, onCardClick, onWatchClick, onFocusToggle, collapsed, onToggleCollapse }: Props) {
  const [showTriage, setShowTriage] = useState(false);
  const hasTriage = TRIAGE_COLUMNS.has(column);

  const projectMap = useMemo(
    () => Object.fromEntries(projects.map(p => [p.id, p.name])),
    [projects],
  );

  const colCards = useMemo(
    () => cards.filter(c => c.column === column),
    [cards, column],
  );

  return (
    <>
      <ColumnShell
        column={column}
        count={colCards.length}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        headerActions={hasTriage ? (
          <TriageColumnHeader
            column={column}
            topCards={colCards}
            onOpenTriage={() => setShowTriage(true)}
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
                onClick={onCardClick}
                onWatchClick={onWatchClick}
                onFocusToggle={onFocusToggle}
              />
            ))
        }
      </ColumnShell>

      {showTriage && (
        <TriageModal column={column} onClose={() => setShowTriage(false)} />
      )}
    </>
  );
}
