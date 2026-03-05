"use client";

import { useState, useEffect, useRef } from "react";
import { Modal } from "./Modal";

interface Props {
  onClose: () => void;
}

export function BacklogSchedulerModal({ onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testLog, setTestLog] = useState<string>("");
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    fetch("/api/backlog-prompt")
      .then(r => r.json())
      .then(d => setPrompt(d.prompt ?? ""))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [testLog]);

  async function handleBlur() {
    try {
      await fetch("/api/backlog-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  }

  async function handleTest() {
    setTestLog("");
    setTesting(true);
    const t0 = performance.now();
    const ts = () => `+${((performance.now() - t0) / 1000).toFixed(2)}s`;
    setTestLog(`[${ts()}] click → fetch sent\n`);
    let firstChunk = true;
    try {
      const res = await fetch("/api/backlog-prompt/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      setTestLog(prev => prev + `[${ts()}] server responded (headers)\n`);
      if (!res.body) {
        setTestLog(prev => prev + "No response body.");
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          setTestLog(prev => prev + `\n[${ts()}] done\n`);
          break;
        }
        if (firstChunk) {
          setTestLog(prev => prev + `[${ts()}] first token\n\n`);
          firstChunk = false;
        }
        setTestLog(prev => prev + dec.decode(value, { stream: true }));
      }
    } catch (e) {
      setTestLog(prev => prev + `\n[${ts()}] Error: ${String(e)}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-start gap-3 flex-shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-zinc-700 text-zinc-400">backlog</span>
            <span className="text-xs text-zinc-500">every 5 min · Haiku</span>
            {saved && <span className="text-xs text-emerald-500">saved</span>}
          </div>
          <h2 className="text-lg font-semibold text-zinc-100">Backlog Processor Prompt</h2>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-2xl leading-none shrink-0">×</button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 px-6 py-5 flex flex-col" style={{ position: "relative" }}>
        {loading
          ? <div className="text-zinc-600 text-xs italic text-center py-12">Loading prompt...</div>
          : <textarea
              className="flex-1 min-h-0 w-full bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm font-mono px-4 py-3 rounded resize-none focus:outline-none focus:border-zinc-500 leading-relaxed"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onBlur={handleBlur}
              spellCheck={false}
            />
        }

        {(testing || testLog) && (
          <div style={{
            position: "absolute", inset: "20px 24px",
            background: "#09090b", border: "1px solid #27272a",
            borderRadius: 8, zIndex: 10,
            display: "flex", flexDirection: "column",
          }}>
            <div style={{ padding: "8px 12px", borderBottom: "1px solid #18181b", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Test Output</span>
              {testing && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", animation: "pulse 1s infinite" }} />}
              {!testing && <button onClick={() => setTestLog("")} style={{ marginLeft: "auto", fontSize: 11, color: "#52525b", background: "none", border: "none", cursor: "pointer" }}>✕ clear</button>}
            </div>
            <pre
              ref={logRef}
              style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px", fontSize: 12, fontFamily: "monospace", color: "#a1a1aa", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0 }}
            >
              {testLog || <span style={{ color: "#3f3f46" }}>Starting...</span>}
            </pre>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-800 px-6 py-4 flex items-center gap-3 flex-shrink-0">
        <span className="text-xs text-zinc-600 flex-1">
          <code className="text-zinc-500">~/am/cron/prompts/board-worker-backlog.txt</code>
        </span>
        <button
          onClick={handleTest}
          disabled={testing || loading}
          style={{
            fontSize: 12, padding: "6px 16px", borderRadius: 6,
            background: "#18181b", border: "1px solid #3f3f46",
            color: testing ? "#52525b" : "#a1a1aa",
            cursor: testing ? "not-allowed" : "pointer",
          }}
        >
          {testing ? "Running..." : "▶ Test on backlog"}
        </button>
      </div>
    </Modal>
  );
}
