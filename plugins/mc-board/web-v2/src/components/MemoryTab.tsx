"use client";

import { useState, useEffect, useCallback } from "react";

interface KbEntry { id: string; key: string; value: string; updated_at?: string; created_at?: string; }
interface QmdEntry { filename: string; title: string; preview: string; modified: string; }
type AnyEntry = KbEntry | QmdEntry;
type SubTab = "qmd" | "kb";

function isKb(e: AnyEntry): e is KbEntry { return "key" in e; }

function fmtDate(iso: string): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return iso; }
}

export function MemoryTab() {
  const [subTab, setSubTab] = useState<SubTab>("qmd");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [kbEntries, setKbEntries] = useState<KbEntry[]>([]);
  const [qmdEntries, setQmdEntries] = useState<QmdEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<AnyEntry | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setLoading(true);
    const url = subTab === "kb"
      ? `/api/kb${debouncedQuery ? `?q=${encodeURIComponent(debouncedQuery)}` : ""}`
      : `/api/qmd${debouncedQuery ? `?q=${encodeURIComponent(debouncedQuery)}` : ""}`;
    fetch(url)
      .then(r => r.json())
      .then(d => {
        if (subTab === "kb") setKbEntries(d.entries ?? []);
        else setQmdEntries(d.entries ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [subTab, debouncedQuery]);

  const closeModal = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setModal(null);
  }, []);

  const items: AnyEntry[] = subTab === "kb" ? kbEntries : qmdEntries;
  const getTitle = (e: AnyEntry) => isKb(e) ? e.key : e.title;
  const getMeta  = (e: AnyEntry) => isKb(e) ? fmtDate(e.updated_at ?? e.created_at ?? "") : e.filename;
  const getBody  = (e: AnyEntry) => isKb(e) ? e.value : e.preview;
  const getKey   = (e: AnyEntry, i: number) => isKb(e) ? e.id : `${e.filename}-${i}`;

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Left panel */}
      <div className="w-64 flex-shrink-0 border-r border-zinc-800 flex flex-col overflow-hidden">
        {/* Subtabs */}
        <div className="mem-subtab">
          <button onClick={() => { setSubTab("qmd"); setQuery(""); }}
            className={`mem-subtab-btn${subTab === "qmd" ? " active" : ""}`}>
            Short Term ({qmdEntries.length})
          </button>
          <button onClick={() => { setSubTab("kb"); setQuery(""); }}
            className={`mem-subtab-btn${subTab === "kb" ? " active" : ""}`}>
            Long Term ({kbEntries.length})
          </button>
        </div>
        {/* Search */}
        <div className="p-3 border-b border-zinc-800 flex-shrink-0">
          <input
            className="w-full bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs px-3 py-1.5 rounded focus:outline-none focus:border-zinc-500 font-mono"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={subTab === "kb" ? "Search KB..." : "Search memory..."}
          />
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-700">
          {loading && <div className="text-zinc-600 text-xs italic text-center p-8">Loading...</div>}
          {!loading && items.length === 0 && <div className="text-zinc-700 text-xs italic text-center p-8">No entries</div>}
          {!loading && items.map((item, i) => (
            <div key={getKey(item, i)}
              className="px-4 py-2.5 border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-800/60 transition-colors"
              onClick={() => setModal(item)}>
              <div className="text-[13px] font-medium text-zinc-200 truncate">{getTitle(item)}</div>
              <div className="text-[10px] text-zinc-600 mt-0.5">{getMeta(item)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center text-zinc-700 text-xs italic">
        Click an entry to view
      </div>

      {/* Modal */}
      {modal && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 pt-16"
          onClick={closeModal}
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-zinc-800 flex-shrink-0">
              <div className="min-w-0">
                <div className="text-base font-semibold text-zinc-100 leading-snug break-words">{getTitle(modal)}</div>
                <div className="text-xs text-zinc-500 mt-1">{getMeta(modal)}</div>
              </div>
              <button onClick={() => setModal(null)}
                className="text-zinc-500 hover:text-zinc-300 text-xl leading-none mt-0.5 shrink-0">×</button>
            </div>
            <div className="px-5 py-4 overflow-y-auto flex-1 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words font-mono">
              {getBody(modal) || <span className="text-zinc-600 italic">No content</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
