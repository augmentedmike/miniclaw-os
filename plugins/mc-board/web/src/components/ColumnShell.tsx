"use client";

import type { ReactNode } from "react";
import type { Column as ColumnType } from "@/lib/types";

export type ColStyle = { badge: string; label: string };

export const COL_STYLES: Record<ColumnType, ColStyle> = {
  backlog:       { badge: "bg-zinc-600 text-zinc-100",  label: "BACKLOG" },
  "in-progress": { badge: "bg-blue-600 text-blue-50",   label: "IN PROGRESS" },
  "in-review":   { badge: "bg-green-600 text-green-50", label: "IN REVIEW" },
  shipped:       { badge: "bg-green-600 text-green-50", label: "SHIPPED" },
};

interface Props {
  column: ColumnType;
  count: number;
  headerActions?: ReactNode;
  children: ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ColumnShell({ column, count, headerActions, children, collapsed, onToggleCollapse }: Props) {
  const { badge, label } = COL_STYLES[column];
  const isShipped = column === "shipped";

  if (isShipped && collapsed) {
    return (
      <div className="shipped-col" onClick={onToggleCollapse} title={`Show shipped (${count})`}>
        <span className="shipped-label">Shipped&nbsp;({count})</span>
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
        <span className={`column-badge ${badge}`}>{label}</span>
        <span className="column-count">{count}</span>
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
