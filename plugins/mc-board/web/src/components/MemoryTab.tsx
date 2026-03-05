"use client";

import { useState, useEffect } from "react";
import { Modal } from "./Modal";

interface KbEntry { id: string; key: string; value: string; updated_at?: string; created_at?: string; }
interface QmdEntry { filename: string; title: string; preview: string; modified: string; }
type AnyEntry = KbEntry | QmdEntry;

function isKb(e: AnyEntry): e is KbEntry { return "key" in e; }

function fmtDate(iso: string): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return iso; }
}

function getTitle(e: AnyEntry) { return isKb(e) ? e.key : e.title; }
function getMeta(e: AnyEntry)  { return isKb(e) ? fmtDate(e.updated_at ?? e.created_at ?? "") : e.filename; }
function getBody(e: AnyEntry)  { return isKb(e) ? e.value : e.preview; }

function MemoryList({
  label, entries, loading, query, onQueryChange, onSelect, placeholder,
}: {
  label: string;
  entries: AnyEntry[];
  loading: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onSelect: (e: AnyEntry) => void;
  placeholder: string;
}) {
  return (
    <div className="flex-1 flex flex-col min-w-0 border-r border-zinc-800 last:border-r-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex-shrink-0">
        <div className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-2">{label} ({entries.length})</div>
        <input
          className="w-full bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs px-3 py-1.5 rounded focus:outline-none focus:border-zinc-500 font-mono"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder={placeholder}
        />
      </div>
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-zinc-700">
        {loading && <div className="text-zinc-600 text-xs italic text-center p-8">Loading...</div>}
        {!loading && entries.length === 0 && <div className="text-zinc-700 text-xs italic text-center p-8">No entries</div>}
        {!loading && entries.map((item, i) => (
          <div
            key={isKb(item) ? item.id : `${item.filename}-${i}`}
            className="px-4 py-2.5 border-b border-zinc-800/50 cursor-pointer hover:bg-zinc-800/60 transition-colors"
            onClick={() => onSelect(item)}
          >
            <div className="text-[13px] font-medium text-zinc-200 truncate">{getTitle(item)}</div>
            <div className="text-[10px] text-zinc-600 mt-0.5">{getMeta(item)}</div>
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

  useEffect(() => { const t = setTimeout(() => setDQmd(qmdQuery), 300); return () => clearTimeout(t); }, [qmdQuery]);
  useEffect(() => { const t = setTimeout(() => setDKb(kbQuery), 300); return () => clearTimeout(t); }, [kbQuery]);

  useEffect(() => {
    setLoadingQmd(true);
    fetch(`/api/qmd${dQmd ? `?q=${encodeURIComponent(dQmd)}` : ""}`)
      .then(r => r.json()).then(d => setQmdEntries(d.entries ?? []))
      .catch(() => {}).finally(() => setLoadingQmd(false));
  }, [dQmd]);

  useEffect(() => {
    setLoadingKb(true);
    fetch(`/api/kb${dKb ? `?q=${encodeURIComponent(dKb)}` : ""}`)
      .then(r => r.json()).then(d => setKbEntries(d.entries ?? []))
      .catch(() => {}).finally(() => setLoadingKb(false));
  }, [dKb]);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <MemoryList
        label="Short Term" entries={qmdEntries} loading={loadingQmd}
        query={qmdQuery} onQueryChange={setQmdQuery} onSelect={setModal} placeholder="Search memory..."
      />
      <MemoryList
        label="Long Term" entries={kbEntries} loading={loadingKb}
        query={kbQuery} onQueryChange={setKbQuery} onSelect={setModal} placeholder="Search KB..."
      />

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
