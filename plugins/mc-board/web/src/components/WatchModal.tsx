"use client";

import { useState, useEffect, useRef } from "react";
import { Modal } from "./Modal";

interface Props {
  cardId: string;
  cardTitle: string;
  worker?: string;
  onClose: () => void;
}

export function WatchModal({ cardId, cardTitle, worker, onClose }: Props) {
  const [log, setLog] = useState<string>("");
  const [connected, setConnected] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/watch/${cardId}`);
    esRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type: string; line?: string };
        if (msg.type === "log" && msg.line) {
          setLog(prev => prev + msg.line + "\n");
        }
      } catch {}
    };

    es.onerror = () => {
      setLog(prev => prev + "\n[watch] connection lost\n");
      es.close();
    };

    return () => { es.close(); };
  }, [cardId]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const displayLog = showDebug
    ? log
    : log.split("\n").filter(l => !l.startsWith("  [dbg]")).join("\n");

  return (
    <Modal onClose={onClose} zIndex={60}>
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-start gap-3 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block", flexShrink: 0, position: "relative" }}>
              <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#22c55e", animation: "dot-ping 1.3s cubic-bezier(0,0,.2,1) infinite" }} />
            </span>
            <span className="text-xs px-1.5 py-0.5 rounded font-mono bg-zinc-800 text-zinc-500">{cardId}</span>
            {worker && <span className="text-xs text-zinc-500">{worker}</span>}
            {connected && <span className="text-xs text-emerald-600">live</span>}
          </div>
          <h2 className="text-lg font-semibold text-zinc-100 truncate">{cardTitle}</h2>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-2xl leading-none shrink-0">×</button>
      </div>

      {/* Log */}
      <div className="flex-1 min-h-0 px-6 py-5 flex flex-col">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600 }}>Live Log</span>
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
          {displayLog || <span style={{ color: "#3f3f46" }}>Connecting…</span>}
        </pre>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-800 px-6 py-4 flex items-center gap-3 flex-shrink-0">
        <span className="text-xs text-zinc-600 flex-1">
          <code className="text-zinc-500">~/am/logs/[column]-[type]/{cardId}.log</code>
        </span>
        <button
          onClick={onClose}
          style={{
            fontSize: 12, padding: "6px 16px", borderRadius: 6,
            background: "#18181b", border: "1px solid #3f3f46",
            color: "#a1a1aa", cursor: "pointer",
          }}
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
