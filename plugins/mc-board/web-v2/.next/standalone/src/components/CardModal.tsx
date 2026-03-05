"use client";

import { Card, Project } from "@/lib/types";
import { useEffect, useCallback, useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json());

const COLUMN_ORDER = ["backlog", "in-progress", "in-review", "shipped"] as const;
type ColName = typeof COLUMN_ORDER[number];

function fmtDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function renderMarkdown(text: string): string {
  if (!text) return "";
  // Normalize literal \n escape sequences written by agents
  let t = text.replace(/\\n/g, "\n");
  // Escape HTML
  t = t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // Process line by line for block elements, then inline
  const lines = t.split("\n");
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw;
    // Headings
    if (/^### /.test(line)) { out.push(`<h3 class="text-xs font-bold text-zinc-400 uppercase tracking-wide mt-3 mb-1">${line.slice(4)}</h3>`); continue; }
    if (/^## /.test(line))  { out.push(`<h2 class="text-sm font-bold text-zinc-300 mt-3 mb-1">${line.slice(3)}</h2>`); continue; }
    if (/^# /.test(line))   { out.push(`<h1 class="text-base font-bold text-zinc-200 mt-3 mb-1">${line.slice(2)}</h1>`); continue; }
    // HR
    if (/^---+$/.test(line.trim())) { out.push(`<hr class="border-zinc-700 my-2" />`); continue; }
    // Blockquote
    if (/^> /.test(line)) { out.push(`<blockquote class="border-l-2 border-zinc-600 pl-3 text-zinc-400 italic">${inline(line.slice(2))}</blockquote>`); continue; }
    // Checked task list
    if (/^\s*-\s*\[x\]\s*/i.test(line)) {
      const content = line.replace(/^\s*-\s*\[x\]\s*/i, "");
      out.push(`<div class="flex gap-2 items-start"><span class="text-emerald-400 shrink-0 mt-0.5">✓</span><span class="line-through text-zinc-500">${inline(content)}</span></div>`);
      continue;
    }
    // Unchecked task list
    if (/^\s*-\s*\[ \]\s*/.test(line)) {
      const content = line.replace(/^\s*-\s*\[ \]\s*/, "");
      out.push(`<div class="flex gap-2 items-start"><span class="text-zinc-600 shrink-0 mt-0.5">☐</span><span>${inline(content)}</span></div>`);
      continue;
    }
    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const content = line.replace(/^\s*[-*]\s+/, "");
      out.push(`<div class="flex gap-2 items-start ml-2"><span class="text-zinc-500 shrink-0">·</span><span>${inline(content)}</span></div>`);
      continue;
    }
    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const num = (line.match(/^\s*(\d+)\./) ?? ["", ""])[1];
      const content = line.replace(/^\s*\d+\.\s+/, "");
      out.push(`<div class="flex gap-2 items-start ml-2"><span class="text-zinc-500 shrink-0 font-mono text-xs">${num}.</span><span>${inline(content)}</span></div>`);
      continue;
    }
    // Empty line → spacer
    if (line.trim() === "") { out.push(`<div class="h-1"></div>`); continue; }
    // Normal paragraph line
    out.push(`<div>${inline(line)}</div>`);
  }
  return out.join("\n");
}

function inline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, `<code class="bg-zinc-800 px-1 rounded text-xs font-mono text-emerald-300">$1</code>`)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" class="text-blue-400 underline">$1</a>`);
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
  onClose: () => void;
  onToast?: (icon: string, title: string, sub?: string) => void;
  onMutate?: () => void;
}

export function CardModal({ cardId, projects, onClose, onToast, onMutate }: Props) {
  const { data: card, mutate: mutateCard } = useSWR<Card>(
    cardId ? `/api/card/${cardId}` : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  const [moving, setMoving] = useState(false);

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));

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

            <div className="px-5 py-4 space-y-5">
              {SECTIONS.map(({ label, field }) => {
                const val = card[field] as string;
                if (!val?.trim()) return null;
                return (
                  <div key={field}>
                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">{label}</h3>
                    <div
                      className="text-sm text-zinc-300 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(val) }}
                    />
                  </div>
                );
              })}
            </div>

            <div className="border-t border-zinc-800 px-5 py-3 flex items-center gap-3">
              <div className="text-xs text-zinc-600 font-mono flex-1">{card.id}</div>
              {/* Move buttons */}
              <div className="flex items-center gap-2">
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
