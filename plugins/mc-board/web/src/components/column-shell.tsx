"use client";

import type { ReactNode } from "react";
import type { Column as ColumnType } from "@/lib/types";
import { useAccent } from "@/lib/accent-context";

export type ColStyle = { badge: string; label: string };

export const COL_STYLES: Record<ColumnType, ColStyle> = {
  backlog:       { badge: "bg-violet-600 text-violet-50",  label: "BACKLOG" },
  "in-progress": { badge: "bg-blue-600 text-blue-50",      label: "IN PROGRESS" },
  "in-review":   { badge: "bg-amber-500 text-amber-950",   label: "IN REVIEW" },
  "on-hold":     { badge: "bg-stone-600 text-stone-100",   label: "ON HOLD" },
  shipped:       { badge: "bg-green-600 text-green-50",    label: "SHIPPED" },
};

function ChevronIcon({ direction, className }: { direction: "left" | "right"; className?: string }) {
  return (
    <svg
      className={`shipped-chevron ${className ?? ""}`}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        transform: direction === "left" ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 0.25s ease",
        flexShrink: 0,
      }}
    >
      <path d="M6 3L11 8L6 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
  const accent = useAccent();
  const { badge, label } = COL_STYLES[column];
  const isShipped = column === "shipped";

  if (isShipped && collapsed) {
    return (
      <div
        className="shipped-col"
        data-tour="shipped"
        onClick={onToggleCollapse}
        role="button"
        aria-label={`Expand shipped column (${count} cards)`}
        tabIndex={0}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleCollapse?.(); } }}
        title={`Show shipped (${count})`}
      >
        <ChevronIcon direction="right" className="shipped-chevron-collapsed" />
        <span className="shipped-label">Shipped</span>
        <span className="shipped-count">{count}</span>
      </div>
    );
  }

  return (
    <div className={`column${isShipped ? " shipped-col open" : ""}`} data-tour={column}>
      <div
        className={`column-header${isShipped ? " shipped-header-toggle" : ""}`}
        onClick={isShipped ? onToggleCollapse : undefined}
        role={isShipped ? "button" : undefined}
        aria-label={isShipped ? "Collapse shipped column" : undefined}
        tabIndex={isShipped ? 0 : undefined}
        onKeyDown={isShipped ? (e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleCollapse?.(); } }) : undefined}
        style={{ cursor: isShipped ? "pointer" : undefined }}
      >
        <span className={`column-badge ${badge}`} data-col={column}>{label}</span>
        <span className="column-count">
          {count}
          {activeCount != null && activeCount > 0 && (
            <span style={{ marginLeft: 5, fontSize: "0.82em", color: accent, fontWeight: 500 }}>
              ({activeCount})
            </span>
          )}
        </span>
        {isShipped && <ChevronIcon direction="left" className="shipped-chevron-expanded" />}
        {headerActions && (
          <div className="column-header-actions">
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
