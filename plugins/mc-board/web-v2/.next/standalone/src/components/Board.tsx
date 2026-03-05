"use client";

import useSWR from "swr";
import { BoardData, Project } from "@/lib/types";
import { Column } from "./Column";
import { CardModal } from "./CardModal";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";

const fetcher = (url: string) => fetch(url).then(r => r.json());
const COLS = ["backlog", "in-progress", "in-review", "shipped"] as const;

const TOAST_ICONS: Record<string, string> = {
  pickup: "🔵",
  release: "✅",
  move: "📋",
  ship: "🚀",
  create: "📌",
  edit: "✏️",
};

interface Counts { backlog: number; inProgress: number; inReview: number; shipped: number; }

interface Props {
  selectedProject: string;
  onToast?: (icon: string, title: string, sub?: string) => void;
  notifsEnabled?: boolean;
  onBoardData?: (projects: Project[], counts: Counts) => void;
}

export function Board({ selectedProject, onToast, notifsEnabled, onBoardData }: Props) {
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [shippedOpen, setShippedOpen] = useState(false);
  // Track which log keys we've already toasted (cardId:action:at)
  const seenLogKeys = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  const qs = selectedProject ? `?project=${encodeURIComponent(selectedProject)}` : "";
  const { data, isLoading, mutate } = useSWR<BoardData>(
    `/api/board${qs}`,
    fetcher,
    { refreshInterval: 8000, revalidateOnFocus: false, keepPreviousData: true }
  );

  // Card open/close with URL
  const openCard = useCallback((id: string) => {
    setOpenCardId(id);
    const card = data?.cards.find(c => c.id === id);
    const projId = card?.project_id;
    history.pushState(null, "", projId ? `/board/${projId}/${id}` : `/board/${id}`);
  }, [data]);

  const closeCard = useCallback(() => {
    setOpenCardId(null);
    history.pushState(null, "", selectedProject
      ? `/board?project=${encodeURIComponent(selectedProject)}`
      : "/board");
  }, [selectedProject]);

  // Pass board data up to AppShell
  useEffect(() => {
    if (!data) return;
    onBoardData?.(data.projects, data.counts);
  }, [data, onBoardData]);

  // Log-based toast firing — same logic as original standalone.mjs
  useEffect(() => {
    if (!data) return;
    const log = data.log ?? [];
    const now = Date.now();

    if (!initialized.current) {
      // First load: seed seen keys without toasting
      for (const ev of log) {
        seenLogKeys.current.add(`${ev.cardId}:${ev.action}:${ev.at}`);
      }
      initialized.current = true;
      return;
    }

    if (!notifsEnabled) return;

    for (const ev of log) {
      const key = `${ev.cardId}:${ev.action}:${ev.at}`;
      if (seenLogKeys.current.has(key)) continue;
      seenLogKeys.current.add(key);

      // Only toast recent events (last 15s to avoid stale replays)
      if (now - new Date(ev.at).getTime() > 15000) continue;

      const icon = TOAST_ICONS[ev.action] ?? "📋";
      const worker = ev.worker ? ev.worker.replace("board-worker-", "") : "";
      let title: string;
      switch (ev.action) {
        case "pickup":  title = `Picked up: ${ev.title || ev.cardId}`; break;
        case "release": title = `Released: ${ev.title || ev.cardId}`; break;
        case "move":    title = `Moved → ${ev.column}: ${ev.title || ev.cardId}`; break;
        case "ship":    title = `Shipped: ${ev.title || ev.cardId}`; break;
        case "create":  title = `New card: ${ev.title || ev.cardId}`; break;
        case "edit":    title = `Edited: ${ev.title || ev.cardId}`; break;
        default:        title = ev.cardId;
      }
      onToast?.(icon, title, worker);
    }

    // Cap seen keys to avoid unbounded growth
    if (seenLogKeys.current.size > 500) {
      const arr = [...seenLogKeys.current];
      seenLogKeys.current = new Set(arr.slice(arr.length - 300));
    }
  }, [data, notifsEnabled, onToast]);

  const activeIds = useMemo(() => new Set(data?.activeIds ?? []), [data?.activeIds]);

  if (isLoading && !data) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "#52525b", fontSize: 13 }}>Loading...</div>;
  }

  const cards = data?.cards ?? [];
  const projects = data?.projects ?? [];

  return (
    <div className="board-tab">
      <div className="board">
        {COLS.map(col => (
          <Column
            key={col}
            column={col}
            cards={cards}
            projects={projects}
            activeIds={activeIds}
            activeWorkers={data?.activeWorkers}
            onCardClick={openCard}
            collapsed={col === "shipped" ? !shippedOpen : undefined}
            onToggleCollapse={col === "shipped" ? () => setShippedOpen(o => !o) : undefined}
          />
        ))}
      </div>

      <CardModal
        cardId={openCardId}
        projects={projects}
        onClose={closeCard}
        onToast={onToast}
        onMutate={() => mutate()}
      />
    </div>
  );
}
