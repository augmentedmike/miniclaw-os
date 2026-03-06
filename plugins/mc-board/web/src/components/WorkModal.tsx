"use client";

import { useState, useEffect, useRef } from "react";
import { Modal } from "./Modal";
import type { Card, Column } from "@/lib/types";

interface CardStream {
  card: Card;
  log: string;
  done: boolean;
}

interface Props {
  column: Column;
  cards: Card[]; // top N cards to work, pre-sorted
  onClose: () => void;
}

const FULL_AGENT_COLUMNS = new Set<Column>(["in-progress", "in-review"]);

export function WorkModal({ column, cards, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [promptLoaded, setPromptLoaded] = useState(false);
  const [streams, setStreams] = useState<CardStream[]>(() =>
    cards.map(c => ({ card: c, log: "", done: false }))
  );
  const [activeTab, setActiveTab] = useState(0);
  const [showDebug, setShowDebug] = useState(false);
  const [started, setStarted] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const isFullAgent = FULL_AGENT_COLUMNS.has(column);

  useEffect(() => {
    fetch(`/api/process/${column}`)
      .then(r => r.json())
      .then(d => setPrompt(d.prompt ?? ""))
      .catch(() => {})
      .finally(() => setPromptLoaded(true));
  }, [column]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [streams, activeTab]);

  function appendLog(idx: number, text: string) {
    setStreams(prev => prev.map((s, i) =>
      i === idx ? { ...s, log: s.log + text } : s
    ));
  }

  function markDone(idx: number) {
    setStreams(prev => prev.map((s, i) =>
      i === idx ? { ...s, done: true } : s
    ));
  }

  async function runCard(idx: number, card: Card, p: string) {
    const t0 = performance.now();
    const ts = () => `+${((performance.now() - t0) / 1000).toFixed(2)}s`;
    appendLog(idx, `[${ts()}] starting → ${card.id}\n`);
    try {
      const res = await fetch(`/api/process/${column}/${card.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p }),
      });

      if (isFullAgent) {
        // Fire-and-forget: agent runs in background, watch via log
        const data = await res.json() as { ok: boolean; pid?: number; logFile?: string };
        if (data.ok) {
          appendLog(idx, `[${ts()}] agent started (pid ${data.pid})\n`);
          appendLog(idx, `[${ts()}] running in background\n`);
          appendLog(idx, `[${ts()}] click the green dot on the card to watch live\n`);
        } else {
          appendLog(idx, `[${ts()}] failed to start agent\n`);
        }
        return;
      }

      // Streaming mode (backlog enrichment)
      if (!res.body) { appendLog(idx, "No response body.\n"); return; }
      appendLog(idx, `[${ts()}] server responded\n`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let firstChunk = true;
      while (true) {
        const { done, value } = await reader.read();
        if (done) { appendLog(idx, `\n[${ts()}] done\n`); break; }
        if (firstChunk) { appendLog(idx, `[${ts()}] first token\n\n`); firstChunk = false; }
        appendLog(idx, dec.decode(value, { stream: true }));
      }
    } catch (e) {
      appendLog(idx, `\n[${ts()}] Error: ${String(e)}\n`);
    } finally {
      markDone(idx);
    }
  }

  function handleStart() {
    if (!promptLoaded || started) return;
    setStarted(true);
    cards.forEach((card, idx) => runCard(idx, card, prompt));
  }

  const allDone = streams.every(s => s.done);
  const anyRunning = started && !allDone;

  const activeStream = streams[activeTab];
  const rawLog = activeStream?.log ?? "";
  const displayLog = showDebug
    ? rawLog
    : rawLog.split("\n").filter(l => !l.startsWith("  [dbg]")).join("\n");

  return (
    <Modal onClose={onClose}>
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-start gap-3 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-zinc-700 text-zinc-400">{column}</span>
            <span className="text-xs text-zinc-500">
              {isFullAgent ? "Full agent" : "Haiku"} · {cards.length} card{cards.length === 1 ? "" : "s"}
            </span>
            {allDone && started && <span className="text-xs text-emerald-500">{isFullAgent ? "launched" : "all done"}</span>}
          </div>
          <h2 className="text-lg font-semibold text-zinc-100">Work</h2>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-2xl leading-none shrink-0">×</button>
      </div>

      {/* Card tabs */}
      <div style={{ display: "flex", gap: 4, padding: "8px 24px 0", borderBottom: "1px solid #27272a", flexShrink: 0 }}>
        {streams.map((s, i) => (
          <button
            key={s.card.id}
            onClick={() => setActiveTab(i)}
            style={{
              fontSize: 10, padding: "4px 10px", borderRadius: "4px 4px 0 0",
              background: activeTab === i ? "#18181b" : "transparent",
              border: `1px solid ${activeTab === i ? "#3f3f46" : "transparent"}`,
              borderBottom: activeTab === i ? "1px solid #18181b" : "1px solid transparent",
              color: s.done ? "#22c55e" : anyRunning && !s.done ? "#f59e0b" : "#71717a",
              cursor: "pointer", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
            title={s.card.title}
          >
            {s.done ? "✓ " : anyRunning ? "● " : ""}{s.card.title.slice(0, 20)}
          </button>
        ))}
      </div>

      {/* Stream output */}
      <div className="flex-1 min-h-0 px-6 py-4 flex flex-col">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: "#52525b", fontFamily: "monospace" }}>{activeStream?.card.id}</span>
          {anyRunning && !activeStream?.done && (
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", display: "inline-block", animation: "pulse 1s infinite" }} />
          )}
          <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#52525b", cursor: "pointer", userSelect: "none" }}>
            <input type="checkbox" checked={showDebug} onChange={e => setShowDebug(e.target.checked)} style={{ accentColor: "#52525b" }} />
            debug
          </label>
        </div>
        <pre ref={logRef} style={{
          flex: 1, minHeight: 0, overflowY: "auto",
          background: "#09090b", border: "1px solid #27272a", borderRadius: 6,
          padding: "12px", fontSize: 12, fontFamily: "monospace",
          color: "#a1a1aa", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0,
        }}>
          {displayLog || <span style={{ color: "#3f3f46" }}>{started ? "Starting..." : "Press ▶ Work to begin"}</span>}
        </pre>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-800 px-6 py-4 flex items-center gap-3 flex-shrink-0">
        <span className="text-xs text-zinc-600 flex-1">
          <code className="text-zinc-500">~/am/.../prompts/{column}-process.txt</code>
        </span>
        <button
          onClick={handleStart}
          disabled={!promptLoaded || started}
          style={{
            fontSize: 12, padding: "6px 16px", borderRadius: 6,
            background: "#18181b", border: "1px solid #3f3f46",
            color: started ? "#52525b" : "#f59e0b",
            cursor: started ? "not-allowed" : "pointer",
          }}
        >
          {anyRunning ? "Launching..." : allDone && started ? (isFullAgent ? "Running →" : "Done") : "▶ Work"}
        </button>
      </div>
    </Modal>
  );
}
