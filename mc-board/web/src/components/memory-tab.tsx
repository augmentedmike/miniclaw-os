"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Modal } from "./modal";

interface KbEntry { id: string; key: string; value: string; updated_at?: string; created_at?: string; }
interface QmdEntry { filename: string; title: string; preview: string; modified: string; }
type AnyEntry = KbEntry | QmdEntry;
interface DeadEntry { id: string; title: string; content: string; }

function isKb(e: AnyEntry): e is KbEntry { return "key" in e; }

function fmtDate(iso: string): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return iso; }
}

function getTitle(e: AnyEntry) { return isKb(e) ? e.key : e.title; }
function getMeta(e: AnyEntry)  { return isKb(e) ? fmtDate(e.updated_at ?? e.created_at ?? "") : e.filename; }
function getBody(e: AnyEntry)  { return isKb(e) ? e.value : e.preview; }

function MemoryList({
  label, entries, loading, query, onQueryChange, onSelect, placeholder, scrollRef,
}: {
  label: string;
  entries: AnyEntry[];
  loading: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onSelect: (e: AnyEntry) => void;
  placeholder: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="flex-1 flex flex-col min-w-0 border-r border-zinc-800/70 last:border-r-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800/70 flex-shrink-0">
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">{label} ({entries.length})</div>
        <input
          className="w-full bg-zinc-950 border border-zinc-700 text-zinc-300 text-xs px-3 py-1.5 rounded focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-700 font-mono"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder={placeholder}
        />
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-700">
        {loading && <div className="text-zinc-600 text-xs italic text-center p-8">Loading...</div>}
        {!loading && entries.length === 0 && <div className="text-zinc-700 text-xs italic text-center p-8">No entries</div>}
        {!loading && entries.map((item, i) => (
          <div
            key={isKb(item) ? item.id : `${item.filename}-${i}`}
            className="px-4 py-2.5 border-b border-zinc-800/40 cursor-pointer hover:bg-zinc-800/50 transition-colors"
            onClick={() => onSelect(item)}
          >
            <div className="text-[13px] font-medium text-zinc-300 truncate">{getTitle(item)}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{getMeta(item)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MemoryTab() {
  const [qmdQuery, setQmdQuery] = useState("");
  const [kbQuery, setKbQuery] = useState("");
  const [dQmd, setDQmd] = useState("");
  const [dKb, setDKb] = useState("");
  const [kbEntries, setKbEntries] = useState<KbEntry[]>([]);
  const [qmdEntries, setQmdEntries] = useState<QmdEntry[]>([]);
  const [loadingQmd, setLoadingQmd] = useState(false);
  const [loadingKb, setLoadingKb] = useState(false);
  const [modal, setModal] = useState<AnyEntry | null>(null);
  const [prunePreview, setPrunePreview] = useState<DeadEntry[] | null>(null);
  const [pruning, setPruning] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const prevStatsRef = useRef<{ memoryFiles: number; kbEntries: number } | null>(null);
  const scrollRefQmd = useRef<HTMLDivElement | null>(null);
  const scrollRefKb = useRef<HTMLDivElement | null>(null);

  useEffect(() => { const t = setTimeout(() => setDQmd(qmdQuery), 300); return () => clearTimeout(t); }, [qmdQuery]);
  useEffect(() => { const t = setTimeout(() => setDKb(kbQuery), 300); return () => clearTimeout(t); }, [kbQuery]);

  // Background polling: check /api/memory/stats every 10s, bump refreshTick on change
  useEffect(() => {
    const interval = setInterval(() => {
      fetch("/api/memory/stats")
        .then(r => r.json())
        .then((stats: { memoryFiles: number; kbEntries: number }) => {
          const prev = prevStatsRef.current;
          if (prev && (prev.memoryFiles !== stats.memoryFiles || prev.kbEntries !== stats.kbEntries)) {
            setRefreshTick(t => t + 1);
          }
          prevStatsRef.current = stats;
        })
        .catch(() => {});
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  const fetchQmd = useCallback((silent = false) => {
    if (!silent) setLoadingQmd(true);
    fetch(`/api/qmd${dQmd ? `?q=${encodeURIComponent(dQmd)}` : ""}`)
      .then(r => r.json()).then(d => setQmdEntries(d.entries ?? []))
      .catch(() => {}).finally(() => { if (!silent) setLoadingQmd(false); });
  }, [dQmd]);

  const fetchKb = useCallback((silent = false) => {
    if (!silent) setLoadingKb(true);
    fetch(`/api/kb${dKb ? `?q=${encodeURIComponent(dKb)}` : ""}`)
      .then(r => r.json()).then(d => setKbEntries(d.entries ?? []))
      .catch(() => {}).finally(() => { if (!silent) setLoadingKb(false); });
  }, [dKb]);

  // Initial fetch + search-driven refetch
  useEffect(() => { fetchQmd(); }, [dQmd]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchKb(); }, [dKb]); // eslint-disable-line react-hooks/exhaustive-deps

  // Silent refetch on background polling tick
  useEffect(() => {
    if (refreshTick > 0) { fetchQmd(true); fetchKb(true); }
  }, [refreshTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePrunePreview = () => {
    fetch("/api/kb", { method: "DELETE" })
      .then(r => r.json()).then(d => setPrunePreview(d.entries ?? []));
  };

  const handlePruneConfirm = () => {
    setPruning(true);
    fetch("/api/kb?confirm=1", { method: "DELETE" })
      .then(r => r.json())
      .then(() => {
        setPrunePreview(null);
        // Reload kb entries
        fetch("/api/kb").then(r => r.json()).then(d => setKbEntries(d.entries ?? []));
      })
      .finally(() => setPruning(false));
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden flex-col px-5 py-4">
    <div className="flex flex-1 min-h-0 overflow-hidden rounded-xl border border-zinc-800" style={{ background: "rgba(24,24,27,0.7)" }}>
      <MemoryList
        label="Short Term" entries={qmdEntries} loading={loadingQmd}
        query={qmdQuery} onQueryChange={setQmdQuery} onSelect={setModal} placeholder="Search memory..."
        scrollRef={scrollRefQmd}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <MemoryList
        label="Long Term" entries={kbEntries} loading={loadingKb}
        query={kbQuery} onQueryChange={setKbQuery} onSelect={setModal} placeholder="Search KB..."
        scrollRef={scrollRefKb}
      />
      <div className="border-t border-zinc-800/70 px-4 py-2.5 flex gap-2 flex-shrink-0" style={{ background: "rgba(24,24,27,0.4)" }}>
        <button
          onClick={handlePrunePreview}
          className="text-xs px-3 py-1.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-red-800/70 hover:bg-zinc-700 hover:text-red-400 transition-colors cursor-pointer font-medium"
        >Prune dead entries</button>
        <button
          onClick={() => fetch("/api/kb?template=1").then(r => r.json()).then(d => setModal({ id: "template", key: "KB Entry Template", value: d.template, created_at: "" }))}
          className="text-xs px-3 py-1.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300 transition-colors cursor-pointer font-medium"
        >View template</button>
      </div>
      </div>
    </div>

      {prunePreview !== null && (
        <Modal onClose={() => setPrunePreview(null)}>
          <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
            <span className="text-sm font-semibold text-zinc-200">Prune dead KB entries</span>
            <button onClick={() => setPrunePreview(null)} className="text-zinc-500 hover:text-zinc-200 text-2xl leading-none">×</button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
            {prunePreview.length === 0
              ? <p className="text-zinc-500 text-sm italic">No dead entries found.</p>
              : <>
                  <p className="text-zinc-400 text-xs mb-4">{prunePreview.length} entries with &lt;80 chars of content will be deleted:</p>
                  {prunePreview.map(e => (
                    <div key={e.id} className="mb-3 p-3 rounded bg-zinc-800 border border-zinc-700">
                      <div className="text-xs font-medium text-zinc-200">{e.title}</div>
                      <div className="text-xs text-zinc-500 font-mono mt-1">{e.content || "(empty)"}</div>
                      <div className="text-[10px] text-zinc-600 mt-1">{e.id}</div>
                    </div>
                  ))}
                </>
            }
          </div>
          {prunePreview.length > 0 && (
            <div className="border-t border-zinc-800 px-6 py-3 flex gap-2 flex-shrink-0">
              <button
                onClick={handlePruneConfirm}
                disabled={pruning}
                className="text-xs px-4 py-1.5 rounded bg-red-900 text-red-200 hover:bg-red-800 disabled:opacity-50"
              >{pruning ? "Deleting…" : `Delete ${prunePreview.length} entries`}</button>
              <button onClick={() => setPrunePreview(null)} className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200">Cancel</button>
            </div>
          )}
        </Modal>
      )}

      {modal && (
        <Modal onClose={() => setModal(null)}>
          {/* Header */}
          <div className="border-b border-zinc-800 px-6 py-4 flex items-start gap-3 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-zinc-700 text-zinc-400">
                  {isKb(modal) ? "long term" : "short term"}
                </span>
                <span className="text-xs text-zinc-500 font-mono">{getMeta(modal)}</span>
              </div>
              <h2 className="text-lg font-semibold text-zinc-100 leading-snug">{getTitle(modal)}</h2>
            </div>
            <button onClick={() => setModal(null)} className="text-zinc-500 hover:text-zinc-200 text-2xl leading-none shrink-0">×</button>
          </div>
          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap break-words font-mono">
            {getBody(modal) || <span className="text-zinc-600 italic">No content</span>}
          </div>
        </Modal>
      )}
    </div>
  );
}
