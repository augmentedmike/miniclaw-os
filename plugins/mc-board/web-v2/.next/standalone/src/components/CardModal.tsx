"use client";

import { Card, Project } from "@/lib/types";
import { useEffect, useCallback, useState, useRef } from "react";
import useSWR from "swr";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";

const fetcher = (url: string) => fetch(url).then(r => r.json());

const COLUMN_ORDER = ["backlog", "in-progress", "in-review", "shipped"] as const;
type ColName = typeof COLUMN_ORDER[number];

// Configure marked with extensions and syntax highlighting
marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      try {
        return hljs.highlight(code, { language }).value;
      } catch {
        return code;
      }
    },
  }),
  {
    breaks: true,
    gfm: true,
  }
);

// Add custom token for task lists and styling
const originalListitemRenderer = marked.defaults.renderer?.listitem;
if (marked.defaults.renderer) {
  marked.defaults.renderer.listitem = function(token) {
    const isTaskList = token.task;
    if (isTaskList) {
      const checkbox = token.checked 
        ? '<span class="text-emerald-400">✓</span>'
        : '<span class="text-zinc-600">☐</span>';
      const textClass = token.checked ? 'line-through text-zinc-500' : '';
      return `<li class="flex gap-2">${checkbox}<span class="${textClass}">${token.text}</span></li>`;
    }
    return `<li>${token.text}</li>`;
  };
}

function renderMarkdown(text: string): string {
  if (!text) return "";
  try {
    const html = marked(text, { async: false });
    return html as string;
  } catch (err) {
    console.error("Markdown rendering error:", err);
    return text;
  }
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

interface Section {
  label: string;
  field: keyof Card;
}

const SECTIONS: Section[] = [
  { label: "Problem", field: "problem_description" },
  { label: "Plan", field: "implementation_plan" },
  { label: "Criteria", field: "acceptance_criteria" },
  { label: "Notes", field: "notes" },
  { label: "Review", field: "review_notes" },
];

interface Props {
  cardId: string | null;
  projects: Project[];
  activeIds?: Set<string>;
  onClose: () => void;
  onToast?: (icon: string, title: string, sub?: string) => void;
  onMutate?: () => void;
}

function WatchLive({ cardId }: { cardId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/watch/${cardId}`);
    esRef.current = es;

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "connected") {
          setConnected(true);
        } else if (msg.type === "log") {
          setLines(prev => [...prev.slice(-200), msg.line]);
        }
      } catch {}
    };

    es.onerror = () => setConnected(false);

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [cardId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div style={{ borderTop: "1px solid #27272a", padding: "12px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#22c55e" : "#71717a", display: "inline-block" }} />
        <span style={{ fontSize: 11, color: "#71717a", fontFamily: "monospace" }}>
          {connected ? "live" : "connecting..."} — ~/am/logs/cards/{cardId}.log
        </span>
      </div>
      <div
        ref={logRef}
        style={{
          background: "#09090b",
          border: "1px solid #27272a",
          borderRadius: 6,
          padding: "10px 12px",
          fontFamily: "monospace",
          fontSize: 11,
          color: "#a1a1aa",
          maxHeight: 240,
          overflowY: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {lines.length === 0 ? (
          <span style={{ color: "#52525b" }}>Waiting for agent activity...</span>
        ) : (
          lines.map((line, i) => <div key={i}>{line}</div>)
        )}
      </div>
    </div>
  );
}

export function CardModal({ cardId, projects, activeIds, onClose, onToast, onMutate }: Props) {
  const { data: card, mutate: mutateCard } = useSWR<Card>(
    cardId ? `/api/card/${cardId}` : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  const [moving, setMoving] = useState(false);
  const [watching, setWatching] = useState(false);

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
  const isActive = cardId ? (activeIds?.has(cardId) ?? false) : false;

  // Stop watching if card goes inactive
  useEffect(() => {
    if (!isActive) setWatching(false);
  }, [isActive]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  const handleMove = useCallback(async (direction: "prev" | "next") => {
    if (!card || moving) return;
    const idx = COLUMN_ORDER.indexOf(card.column as ColName);
    const targetIdx = direction === "next" ? idx + 1 : idx - 1;
    if (targetIdx < 0 || targetIdx >= COLUMN_ORDER.length) return;
    const target = COLUMN_ORDER[targetIdx];
    setMoving(true);
    try {
      const res = await fetch("/api/board/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", cardId: card.id, target }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        onToast?.("❌", "Move failed", data.error ?? "Unknown error");
      } else {
        onToast?.("✓", `Moved to ${target}`, card.title);
        await mutateCard();
        onMutate?.();
      }
    } catch (err) {
      onToast?.("❌", "Move failed", String(err));
    } finally {
      setMoving(false);
    }
  }, [card, moving, mutateCard, onMutate, onToast]);

  if (!cardId) return null;

  const colIdx = card ? COLUMN_ORDER.indexOf(card.column as ColName) : -1;
  const canGoBack = colIdx > 0;
  const canGoForward = colIdx < COLUMN_ORDER.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 pt-16"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl">
        {!card ? (
          <div className="p-8 text-center text-zinc-500">Loading...</div>
        ) : (
          <>
            <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 px-5 py-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    card.priority === "high" ? "bg-red-900 text-red-300" :
                    card.priority === "medium" ? "bg-yellow-900 text-yellow-300" :
                    "bg-zinc-700 text-zinc-400"
                  }`}>{card.priority}</span>
                  <span className="text-xs text-zinc-500 uppercase tracking-wide">{card.column.replace("-", " ")}</span>
                  {isActive && (
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                      <span className="text-xs text-emerald-400">active</span>
                    </span>
                  )}
                  {card.project_id && (
                    <span className="text-xs text-zinc-400 ml-auto">{projectMap[card.project_id] ?? card.project_id}</span>
                  )}
                </div>
                <h2 className="text-base font-semibold text-zinc-100 leading-snug">{card.title}</h2>
                <div className="flex gap-3 mt-1 text-xs text-zinc-600">
                  <span>Created {fmtDate(card.created_at)}</span>
                  <span>·</span>
                  <span>Updated {fmtDate(card.updated_at)}</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="shrink-0 text-zinc-500 hover:text-zinc-300 text-xl leading-none mt-0.5"
              >×</button>
            </div>

            {card.tags.length > 0 && (
              <div className="px-5 pt-3 flex flex-wrap gap-1">
                {card.tags.map(tag => (
                  <span key={tag} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">{tag}</span>
                ))}
              </div>
            )}

            {card.work_type && (
              <div className="px-5 pt-3 border-t border-zinc-800 pt-4">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Relationship</h3>
                <div className="flex items-center gap-2 text-sm">
                  <span style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: "3px",
                    fontSize: "11px",
                    fontWeight: "600",
                    textTransform: "uppercase",
                    background: card.work_type === "work" ? "#dbeafe" : "#fce7f3",
                    color: card.work_type === "work" ? "#0c4a6e" : "#831843",
                  }}>
                    {card.work_type}
                  </span>
                  {card.linked_card_id && (
                    <>
                      <span className="text-zinc-600">→</span>
                      <button
                        onClick={() => {
                          // This would navigate to the linked card in a real implementation
                          onToast?.("ℹ", "Linked to", card.linked_card_id);
                        }}
                        className="text-blue-400 hover:text-blue-300 font-mono underline"
                      >
                        {card.linked_card_id}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="px-5 py-4 space-y-5">
              {SECTIONS.map(({ label, field }) => {
                const val = card[field] as string;
                if (!val?.trim()) return null;
                return (
                  <div key={field}>
                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">{label}</h3>
                    <div
                      className="text-sm text-zinc-300 leading-relaxed space-y-1 font-mono"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(val) }}
                    />
                  </div>
                );
              })}
            </div>

            {watching && cardId && <WatchLive cardId={cardId} />}

            <div className="border-t border-zinc-800 px-5 py-3 flex items-center gap-3">
              <div className="text-xs text-zinc-600 font-mono flex-1">{card.id}</div>
              <div className="flex items-center gap-2">
                {isActive && (
                  <button
                    onClick={() => setWatching(w => !w)}
                    style={{
                      fontSize: 11, padding: "3px 10px", borderRadius: 6,
                      background: watching ? "#16a34a" : "#18181b",
                      border: `1px solid ${watching ? "#16a34a" : "#3f3f46"}`,
                      color: watching ? "#dcfce7" : "#71717a",
                      cursor: "pointer",
                    }}
                  >
                    {watching ? "◼ Stop" : "▶ Watch Live"}
                  </button>
                )}
                {canGoBack && (
                  <button
                    onClick={() => handleMove("prev")}
                    disabled={moving}
                    className="text-xs px-3 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Move Back
                  </button>
                )}
                {canGoForward && (
                  <button
                    onClick={() => handleMove("next")}
                    disabled={moving}
                    className="text-xs px-3 py-1 rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Move Forward →
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
