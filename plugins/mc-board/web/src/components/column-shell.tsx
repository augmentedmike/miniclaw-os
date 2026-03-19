"use client";

import type { ReactNode } from "react";
import type { Column as ColumnType } from "@/lib/types";

export type ColStyle = { badge: string; label: string };

export const COL_STYLES: Record<ColumnType, ColStyle> = {
  backlog:       { badge: "bg-violet-600 text-violet-50",  label: "BACKLOG" },
  "in-progress": { badge: "bg-blue-600 text-blue-50",      label: "IN PROGRESS" },
  "in-review":   { badge: "bg-amber-500 text-amber-950",   label: "IN REVIEW" },
  "on-hold":     { badge: "bg-stone-600 text-stone-100",   label: "ON HOLD" },
  shipped:       { badge: "bg-green-600 text-green-50",    label: "SHIPPED" },
};

interface Props {
  column: ColumnType;
  count: number;
  activeCount?: number;
  headerActions?: ReactNode;
  children: ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ColumnShell({ column, count, activeCount, headerActions, children, collapsed, onToggleCollapse }: Props) {
  const { badge, label } = COL_STYLES[column];
  const isShipped = column === "shipped";

  if (isShipped && collapsed) {
    return (
      <div className="shipped-col" data-tour="shipped" onClick={onToggleCollapse} title={`Show shipped (${count})`}>
        <span className="shipped-label">Shipped</span>
        <span className="shipped-count">{count}</span>
      </div>
    );
  }

  return (
    <div className={`column${isShipped ? " shipped-col open" : ""}`} data-tour={column}>
      <div
        className="column-header"
        onClick={isShipped ? onToggleCollapse : undefined}
        style={{ cursor: isShipped ? "pointer" : undefined, justifyContent: "flex-start", gap: 8 }}
      >
        <span className={`column-badge ${badge}`} data-col={column}>{label}</span>
        <span className="column-count">
          {count}
          {activeCount != null && activeCount > 0 && (
            <span style={{ marginLeft: 5, fontSize: "0.82em", color: "#22c55e", fontWeight: 500 }}>
              ({activeCount})
            </span>
          )}
        </span>
        {headerActions && (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {headerActions}
          </div>
        )}
      </div>
      <div className="column-cards">
        {children}
      </div>
    </div>
  );
}
