"use client";

import { Card, Project } from "@/lib/types";
import { useEffect, useState, useRef } from "react";
import useSWR from "swr";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import { Modal } from "./Modal";

const fetcher = (url: string) => fetch(url).then(r => r.json());

marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      try { return hljs.highlight(code, { language }).value; } catch { return code; }
    },
  }),
  { breaks: true, gfm: true }
);

if (marked.defaults.renderer) {
  marked.defaults.renderer.listitem = function(token) {
    if (token.task) {
      const checkbox = token.checked
        ? '<span class="text-emerald-400">✓</span>'
        : '<span class="text-zinc-600">☐</span>';
      const textClass = token.checked ? "line-through text-zinc-500" : "";
      return `<li class="flex gap-2">${checkbox}<span class="${textClass}">${token.text}</span></li>`;
    }
    return `<li>${token.text}</li>`;
  };
}

function unescapeNewlines(s: string): string { return s.replace(/\\n/g, "\n"); }

function renderMarkdown(text: string): string {
  if (!text) return "";
  try { return marked(unescapeNewlines(text), { async: false }) as string; } catch { return text; }
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const SECTIONS = [
  { label: "Work Description", field: "problem_description" },
  { label: "Plan",     field: "implementation_plan"  },
  { label: "Criteria", field: "acceptance_criteria"  },
  { label: "Notes",    field: "notes"                },
  { label: "Research", field: "research"              },
  { label: "Review",   field: "review_notes"         },
] as const;

interface Props {
  cardId: string | null;
  projects: Project[];
  activeIds?: Set<string>;
  onClose: () => void;
  onOpenLog?: () => void;
  onToast?: (icon: string, title: string, sub?: string) => void;
  onMutate?: () => void;
}

function WatchLive({ cardId }: { cardId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const es = new EventSource(`/api/watch/${cardId}`);
    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "connected") setConnected(true);
        else if (msg.type === "log" && !msg.line.startsWith("  [dbg]")) setLines(prev => [...prev.slice(-200), msg.line]);
      } catch {}
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [cardId]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  return (
    <div style={{ borderTop: "1px solid #27272a", padding: "12px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#22c55e" : "#71717a", display: "inline-block" }} />
        <span style={{ fontSize: 11, color: "#71717a", fontFamily: "monospace" }}>
          {connected ? "live" : "connecting..."} — ~/am/logs/cards/{cardId}.log
        </span>
      </div>
      <div ref={logRef} style={{
        background: "#09090b", border: "1px solid #27272a", borderRadius: 6,
        padding: "10px 12px", fontFamily: "monospace", fontSize: 11, color: "#a1a1aa",
        maxHeight: 240, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all",
      }}>
        {lines.length === 0
          ? <span style={{ color: "#52525b" }}>Waiting for agent activity...</span>
          : lines.map((line, i) => <div key={i}>{line}</div>)
        }
      </div>
    </div>
  );
}

export function CardModal({ cardId, projects, activeIds, onClose, onOpenLog, onToast, onMutate }: Props) {
  const { data: card } = useSWR<Card>(
    cardId ? `/api/card/${cardId}` : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
  const isActive = cardId ? (activeIds?.has(cardId) ?? false) : false;


  if (!cardId) return null;

  return (
    <Modal onClose={onClose}>
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-start gap-3 flex-shrink-0">
        {!card ? (
          <div className="flex-1 text-zinc-500 text-sm">Loading...</div>
        ) : (
          <>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  card.priority === "critical" ? "bg-red-950 text-red-400" :
                  card.priority === "high"     ? "bg-red-900 text-red-300" :
                  card.priority === "medium"   ? "bg-yellow-900 text-yellow-300" :
                  "bg-zinc-700 text-zinc-400"
                }`}>{card.priority}</span>
                <span className="text-xs text-zinc-500 uppercase tracking-wide">{card.column.replace("-", " ")}</span>
                {isActive && (
                  <span className="flex items-center gap-1">
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
                    <span className="text-xs text-emerald-400">active</span>
                  </span>
                )}
                {card.project_id && (
                  <span className="text-xs text-zinc-400 ml-auto">{projectMap[card.project_id] ?? card.project_id}</span>
                )}
              </div>
              <h2 className="text-lg font-semibold text-zinc-100 leading-snug">{card.title}</h2>
              <div className="flex gap-3 mt-1 text-xs text-zinc-600">
                <span>Created {fmtDate(card.created_at)}</span>
                <span>·</span>
                <span>Updated {fmtDate(card.updated_at)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onOpenLog && (
                <button
                  onClick={onOpenLog}
                  style={{
                    fontSize: 11, padding: "3px 10px", borderRadius: 6,
                    background: "#18181b", border: "1px solid #3f3f46",
                    color: "#71717a", cursor: "pointer",
                  }}
                >
                  {isActive ? "▶ Watch Live" : "▶ View Log"}
                </button>
              )}
              <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-2xl leading-none">×</button>
            </div>
          </>
        )}
      </div>

      {/* Body — scrollable */}
      {card && (
        <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-5">
          {card.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {card.tags.map(tag => (
                <span key={tag} className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">{tag}</span>
              ))}
            </div>
          )}

          {card.work_type && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Relationship</h3>
              <div className="flex items-center gap-2 text-sm">
                <span style={{
                  padding: "2px 8px", borderRadius: 3, fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                  background: card.work_type === "work" ? "#dbeafe" : "#fce7f3",
                  color: card.work_type === "work" ? "#0c4a6e" : "#831843",
                }}>{card.work_type}</span>
                {card.linked_card_id && (
                  <>
                    <span className="text-zinc-600">→</span>
                    <button onClick={() => onToast?.("ℹ", "Linked to", card.linked_card_id)}
                      className="text-blue-400 hover:text-blue-300 font-mono underline text-xs">
                      {card.linked_card_id}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

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

          {/* Verify URL */}
          {card.verify_url && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Verify URL</h3>
              <a href={card.verify_url} target="_blank" rel="noreferrer"
                className="text-sm text-blue-400 hover:text-blue-300 underline font-mono break-all">
                {card.verify_url}
              </a>
            </div>
          )}

          {/* Work Log */}
          {card.work_log && card.work_log.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Work Log</h3>
              <div className="space-y-2">
                {card.work_log.map((entry, i) => (
                  <div key={i} className="bg-zinc-800 rounded px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 text-zinc-500 mb-1">
                      <span className="font-mono">{entry.at.slice(0, 16).replace("T", " ")}</span>
                      <span>·</span>
                      <span>{entry.worker}</span>
                    </div>
                    <div className="text-zinc-300 leading-relaxed">{entry.note}</div>
                    {entry.links?.map(l => (
                      <a key={l} href={l} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline block mt-1 truncate">{l}</a>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {card && (
        <div className="border-t border-zinc-800 px-6 py-3 flex-shrink-0">
          <div className="text-xs text-zinc-600 font-mono">{card.id}</div>
        </div>
      )}
    </Modal>
  );
}
