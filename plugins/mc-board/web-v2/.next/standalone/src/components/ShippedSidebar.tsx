"use client";
import { Card, Project } from "@/lib/types";
import { useMemo, useState } from "react";

interface Props {
  cards: Card[];
  projects: Project[];
  onCardClick: (id: string) => void;
}

export function ShippedSidebar({ cards, projects, onCardClick }: Props) {
  const [open, setOpen] = useState(false);
  const projectMap = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p.name])), [projects]);
  const shipped = useMemo(() => cards.filter(c => c.column === "shipped").sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [cards]);

  return (
    <div className={`shrink-0 border-l border-zinc-800 bg-zinc-950 flex flex-col transition-all duration-200 ${open ? "w-72" : "w-8"}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center justify-center h-10 text-zinc-500 hover:text-zinc-300 text-xs font-medium shrink-0 border-b border-zinc-800"
        title={open ? "Close shipped" : "Show shipped"}
      >
        {open ? "›" : "‹"}
      </button>
      {open && (
        <>
          <div className="px-3 py-2 flex items-center gap-2 border-b border-zinc-800">
            <span className="text-xs font-semibold text-emerald-400">Shipped</span>
            <span className="text-xs text-zinc-500 ml-auto">{shipped.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {shipped.map(card => (
              <div
                key={card.id}
                onClick={() => onCardClick(card.id)}
                className="px-2 py-1.5 rounded cursor-pointer hover:bg-zinc-800 group"
              >
                <div className="text-xs text-zinc-400 group-hover:text-zinc-200 leading-snug line-clamp-2">{card.title}</div>
                {card.project_id && (
                  <div className="text-[10px] text-zinc-600 mt-0.5">{projectMap[card.project_id] ?? ""}</div>
                )}
              </div>
            ))}
            {shipped.length === 0 && <div className="text-xs text-zinc-600 text-center py-4">empty</div>}
          </div>
        </>
      )}
    </div>
  );
}
