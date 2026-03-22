"use client";

import useSWR from "swr";
import { BoardData, BoardCard, Project } from "@/lib/types";
import { Column } from "./column";
import { CardModal } from "./card-modal";
import { WatchModal } from "./watch-modal";
import { SummaryModal } from "./summary-modal";
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
  initialCardId?: string;
  onToast?: (icon: string, title: string, sub?: string) => void;
  notifsEnabled?: boolean;
  onBoardData?: (projects: Project[], counts: Counts, allCards: BoardCard[]) => void;
  onInjectContext?: (ctx: string) => void;
  onCardOpen?: (cardId: string | null) => void;
}

function fuzzyMatch(query: string, card: Pick<BoardCard, "id" | "title" | "tags">): boolean {
  const q = query.toLowerCase();
  const haystack = `${card.id} ${card.title} ${card.tags.join(" ")}`.toLowerCase();
  return haystack.includes(q);
}

const COL_LABEL: Record<string, string> = {
  backlog: "Backlog",
  "in-progress": "In Progress",
  "in-review": "In Review",
  shipped: "Shipped",
};

export function Board({ selectedProject, initialCardId, onToast, notifsEnabled, onBoardData, onInjectContext, onCardOpen }: Props) {
  const [openCardId, setOpenCardId] = useState<string | null>(initialCardId ?? null);
  const [watchCardId, setWatchCardId] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [shippedOpen, setShippedOpen] = useState(false);
  const [showHeld, setShowHeld] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [showNewWork, setShowNewWork] = useState(false);
  const [newWorkDesc, setNewWorkDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
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
    onCardOpen?.(id);
    const card = data?.cards.find(c => c.id === id);
    const projId = card?.project_id;
    history.pushState(null, "", projId ? `/board/project/${projId}/c/${id}` : `/board/c/${id}`);
  }, [data, onCardOpen]);

  const closeCard = useCallback(() => {
    setOpenCardId(null);
    onCardOpen?.(null);
    history.pushState(null, "", selectedProject ? `/board/project/${selectedProject}` : "/board");
  }, [selectedProject, onCardOpen]);

  // Pass board data up to AppShell
  useEffect(() => {
    if (!data) return;
    onBoardData?.(data.projects, data.counts, data.cards);
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

  const searchResults = useMemo(() => {
    const q = searchQuery.trim();
    if (!q || q.length < 2) return [];
    const cards = data?.cards ?? [];
    const projects = data?.projects ?? [];
    return cards
      .filter(c => fuzzyMatch(q, c))
      .slice(0, 12)
      .map(c => ({
        ...c,
        projectName: projects.find(p => p.id === c.project_id)?.name ?? "",
      }));
  }, [searchQuery, data]);

  // Close search dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const handleFocusToggle = useCallback((cardId: string, setFocused: boolean) => {
    // Optimistic update — read from live cache to avoid stale-data races
    mutate(current => {
      if (!current) return current;
      return {
        ...current,
        cards: current.cards.map(c => {
          if (c.id !== cardId) return c;
          const newTags = setFocused
            ? [...c.tags.filter(t => t !== "focus"), "focus"]
            : c.tags.filter(t => t !== "focus");
          return { ...c, tags: newTags };
        }),
      };
    }, { revalidate: false });

    // Use add-tags/remove-tags for atomic CLI operation (avoids full tag replacement from stale cache)
    const updateBody = setFocused
      ? { action: "update", cardId, "add-tags": "focus" }
      : { action: "update", cardId, "remove-tags": "focus" };

    fetch("/api/board/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateBody),
    }).then(() => mutate()).catch(() => mutate());
  }, [mutate]);

  const handleHoldToggle = useCallback((cardId: string) => {
    // Read held state from latest cache inside mutate to avoid stale closure
    let wasHeld = false;
    mutate(current => {
      if (!current) return current;
      return {
        ...current,
        cards: current.cards.map(c => {
          if (c.id !== cardId) return c;
          const isHeld = c.tags.includes("hold");
          wasHeld = isHeld;
          const newTags = isHeld ? c.tags.filter(t => t !== "hold") : [...c.tags.filter(t => t !== "hold"), "hold"];
          return { ...c, tags: newTags };
        }),
      };
    }, { revalidate: false });
    // Use wasHeld captured from the latest cache state
    fetch("/api/board/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update", cardId, [wasHeld ? "remove-tags" : "add-tags"]: "hold" }),
    }).then(() => mutate()).catch(() => mutate());
  }, [mutate]);

  const handleSearchSelect = (cardId: string) => {
    setSearchQuery("");
    setSearchOpen(false);
    openCard(cardId);
    // Scroll to card after modal opens (small delay for render)
    setTimeout(() => {
      const el = document.querySelector(`[data-card-id="${cardId}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  async function handleSubmitWork(e: React.FormEvent) {
    e.preventDefault();
    if (!newWorkDesc.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: newWorkDesc.trim() }),
      });
      if (res.ok) {
        setNewWorkDesc("");
        setShowNewWork(false);
        mutate();
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading && !data) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: "#52525b", fontSize: 13 }}>Loading...</div>;
  }

  const cards = data?.cards ?? [];
  const projects = data?.projects ?? [];
  const globalShippedIds = new Set(data?.globalShippedIds ?? []);

  return (
    <div className="board-tab">
      {/* Search bar */}
      <div ref={searchRef} className="relative" data-tour="search" style={{ padding: "0 0 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <input
            type="text"
            placeholder="Search cards…"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => { setSearchOpen(true); setSearchFocused(true); }}
            onBlur={() => setSearchFocused(false)}
            style={{
              flex: "0 0 auto", width: 280,
              background: searchFocused ? "#18181b" : "transparent",
              border: searchFocused ? "1px solid #16a34a" : "1px solid rgba(63,63,70,0.4)",
              borderRadius: 4, padding: "5px 8px", color: "#e4e4e7",
              fontSize: 13, outline: "none", boxSizing: "border-box",
              transition: "background 0.15s ease, border-color 0.15s ease",
            }}
          />
          <button
            onClick={() => setShowNewWork(true)}
            style={{
              background: "#3b82f6", border: "none", color: "#fff", borderRadius: 4,
              padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            + New Request
          </button>
          <button
            onClick={() => setShowHeld(h => !h)}
            style={{
              fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
              background: showHeld ? "#451a03" : "transparent",
              border: showHeld ? "1px solid #d97706" : "1px solid #2a2a33",
              color: showHeld ? "#fbbf24" : "#6b6baf", cursor: "pointer", whiteSpace: "nowrap",
              transition: "background 0.1s, border-color 0.1s, color 0.1s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = showHeld ? "#451a03" : "#1a1a2e"; e.currentTarget.style.borderColor = showHeld ? "#fbbf24" : "#4a4a8f"; e.currentTarget.style.color = showHeld ? "#fbbf24" : "#a5a5ff"; }}
            onMouseLeave={e => { e.currentTarget.style.background = showHeld ? "#451a03" : "transparent"; e.currentTarget.style.borderColor = showHeld ? "#d97706" : "#2a2a33"; e.currentTarget.style.color = showHeld ? "#fbbf24" : "#6b6baf"; }}
          >
            {showHeld ? "Hide Held" : "Show Held"}
          </button>
          <button
            onClick={() => setShowSummary(true)}
            style={{
              fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
              background: showSummary ? "#1a1a2e" : "transparent",
              border: "1px solid #2a2a33",
              color: "#6b6baf", cursor: "pointer", whiteSpace: "nowrap",
              transition: "background 0.1s, border-color 0.1s, color 0.1s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#1a1a2e"; e.currentTarget.style.borderColor = "#4a4a8f"; e.currentTarget.style.color = "#a5a5ff"; }}
            onMouseLeave={e => { if (!showSummary) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "#2a2a33"; e.currentTarget.style.color = "#6b6baf"; } }}
          >
            Last Hour Summary
          </button>
        </div>
        {searchOpen && searchResults.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, zIndex: 100,
            width: "min(420px, calc(100vw - 32px))",
            background: "#1c1c1e", border: "1px solid #3f3f46",
            borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
            marginTop: 4, overflow: "hidden",
          }}>
            {searchResults.map(c => (
              <div
                key={c.id}
                onClick={() => handleSearchSelect(c.id)}
                style={{
                  padding: "8px 14px", cursor: "pointer",
                  borderBottom: "1px solid #27272a",
                  display: "flex", alignItems: "center", gap: 10,
                }}
                onMouseEnter={e => (e.currentTarget.style.background = "#27272a")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontSize: 11, color: "#71717a", flexShrink: 0, width: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.id}</span>
                <span style={{ fontSize: 13, color: "#e4e4e7", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                <span style={{ fontSize: 11, color: "#52525b", flexShrink: 0 }}>{COL_LABEL[c.column] ?? c.column}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="board">
        {COLS.map(col => (
          <Column
            key={col}
            column={col}
            cards={cards}
            globalShippedIds={globalShippedIds}
            projects={projects}
            activeIds={activeIds}
            activeWorkers={data?.activeWorkers}
            onCardClick={openCard}
            onWatchClick={setWatchCardId}
            showHeld={showHeld}
            onFocusToggle={handleFocusToggle}
            onHoldToggle={handleHoldToggle}
            onInjectContext={onInjectContext}
            collapsed={col === "shipped" ? !shippedOpen : undefined}
            onToggleCollapse={col === "shipped" ? () => setShippedOpen(o => !o) : undefined}
          />
        ))}
      </div>

      <CardModal
        cardId={openCardId}
        projects={projects}
        activeIds={activeIds}
        onClose={closeCard}
        onOpenLog={openCardId ? () => { setWatchCardId(openCardId); setLogOpen(true); } : undefined}
        onToast={onToast}
        onMutate={() => mutate()}
        onInjectContext={onInjectContext}
        onHold={handleHoldToggle}
      />
      {showSummary && (
        <SummaryModal
          workLog={data?.workLog ?? []}
          onClose={() => setShowSummary(false)}
        />
      )}

      {logOpen && watchCardId && (() => {
        const card = data?.cards.find(c => c.id === watchCardId);
        return (
          <WatchModal
            cardId={watchCardId}
            cardTitle={card?.title ?? watchCardId}
            worker={data?.activeWorkers?.[watchCardId]}
            onClose={() => setLogOpen(false)}
          />
        );
      })()}

      {/* New work request modal */}
      {showNewWork && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 100,
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={(e) => { if (e.target === e.currentTarget) setShowNewWork(false); }}>
          <form onSubmit={handleSubmitWork} style={{
            background: "#18181b", border: "1px solid #27272a", borderRadius: 8,
            padding: 24, width: 480, maxWidth: "90vw", display: "flex", flexDirection: "column", gap: 16,
          }}>
            <h3 style={{ color: "#e4e4e7", fontSize: 16, fontWeight: 600, margin: 0 }}>New Work Request</h3>
            <p style={{ color: "#71717a", fontSize: 13, margin: 0 }}>
              Describe what you need done. The board will handle triaging, planning, and execution.
            </p>
            <textarea
              autoFocus
              value={newWorkDesc}
              onChange={(e) => setNewWorkDesc(e.target.value)}
              placeholder="What do you need done?"
              rows={5}
              style={{
                background: "#09090b", border: "1px solid #27272a", borderRadius: 6, color: "#e4e4e7",
                padding: 12, fontSize: 14, resize: "vertical", fontFamily: "inherit",
              }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowNewWork(false)}
                style={{
                  background: "#27272a", border: "1px solid #3f3f46", color: "#a1a1aa",
                  borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13,
                }}>
                Cancel
              </button>
              <button type="submit" disabled={submitting || !newWorkDesc.trim()}
                style={{
                  background: submitting ? "#1e40af" : "#3b82f6", border: "none", color: "#fff",
                  borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 600,
                  opacity: !newWorkDesc.trim() ? 0.5 : 1,
                }}>
                {submitting ? "Creating..." : "Submit"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
