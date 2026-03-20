"use client";

import { Card, CardTimeline, TimelineEvent, Project, Attachment, AgentRun } from "@/lib/types";
import { useEffect, useState, useRef } from "react";
import useSWR from "swr";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import { Modal } from "./modal";
import { FileViewModal } from "./file-view-modal";

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

// Matches file paths in text content (not inside HTML tags)
const FILE_PATH_RE = /(~\/[\w./@-]+(?:\/[\w./@-]+)*|\/[\w./@-]+(?:\/[\w./@-]+)+\.[\w]+|(?:[\w.-]+\/)+[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|json|md|txt|sh|py|png|jpg|jpeg|gif|svg|css|html|yaml|yml|toml|rs|go|sql|rb|java|kt|swift|c|cpp|h|hpp|lock|env))/g;

function linkifyFilePaths(html: string): string {
  // Only replace in text nodes — split on HTML tags, leave tags untouched
  return html.replace(/(<[^>]+>)|([^<]+)/g, (match, tag, text) => {
    if (tag) return tag;
    if (!text) return "";
    return text.replace(FILE_PATH_RE, (fp: string) =>
      `<span data-fp="${fp}" style="color:#60a5fa;cursor:pointer;text-decoration:underline;text-decoration-style:dashed">${fp}</span>`
    );
  });
}

function renderMarkdown(text: string): string {
  if (!text) return "";
  try { return linkifyFilePaths(marked(unescapeNewlines(text), { async: false }) as string); } catch { return text; }
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
  onInjectContext?: (ctx: string) => void;
  onHold?: (cardId: string) => void;
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
          {connected ? "live" : "connecting..."} — ~/.openclaw/logs/cards/{cardId}.log
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

const COLUMN_COLORS: Record<string, { bg: string; text: string }> = {
  backlog:     { bg: "#3b0764", text: "#c084fc" },
  "in-progress": { bg: "#1e3a5f", text: "#60a5fa" },
  "in-review": { bg: "#451a03", text: "#fb923c" },
  "on-hold":   { bg: "#1c1917", text: "#a8a29e" },
  shipped:     { bg: "#052e16", text: "#4ade80" },
};

function TimelineSection({ cardId }: { cardId: string }) {
  const { data: timeline, isLoading } = useSWR<CardTimeline>(
    `/api/card/${cardId}/timeline`,
    fetcher,
    { refreshInterval: 5000 }
  );
  const [open, setOpen] = useState(false);

  const events = timeline?.events ?? [];

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
          cursor: "pointer", padding: 0, marginBottom: open ? 10 : 0,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Timeline
        </span>
        {!isLoading && (
          <span style={{ fontSize: 10, color: "#52525b", background: "#27272a", borderRadius: 10, padding: "0 6px", lineHeight: "18px" }}>
            {events.length}
          </span>
        )}
        <span style={{ fontSize: 10, color: "#52525b", marginLeft: 2 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div>
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ height: 36, background: "#27272a", borderRadius: 6, opacity: 0.5 }} />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div style={{ color: "#52525b", fontSize: 12, padding: "8px 0", fontStyle: "italic" }}>
              No timeline events yet.
            </div>
          ) : (
            <div style={{ position: "relative" }}>
              <div style={{
                position: "absolute", left: 7, top: 8, bottom: 8, width: 1,
                background: "#27272a", zIndex: 0,
              }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {events.map((ev: TimelineEvent, i: number) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, position: "relative", zIndex: 1 }}>
                    {/* dot */}
                    <div style={{
                      width: 15, height: 15, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                      background: ev.kind === "column"
                        ? (COLUMN_COLORS[ev.column]?.bg ?? "#27272a")
                        : ev.kind === "pickup"
                          ? (ev.action === "pickup" ? "#14532d" : "#1c1917")
                          : "#27272a",
                      border: `2px solid ${ev.kind === "column"
                        ? (COLUMN_COLORS[ev.column]?.text ?? "#52525b")
                        : ev.kind === "pickup"
                          ? (ev.action === "pickup" ? "#4ade80" : "#78716c")
                          : "#3f3f46"}`,
                    }} />
                    <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {ev.kind === "column" && (
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 4,
                            background: COLUMN_COLORS[ev.column]?.bg ?? "#27272a",
                            color: COLUMN_COLORS[ev.column]?.text ?? "#a1a1aa",
                          }}>
                            → {ev.column}
                          </span>
                        )}
                        {ev.kind === "pickup" && (
                          <>
                            <span style={{ fontSize: 11, color: "#a1a1aa", fontWeight: 500 }}>{ev.worker}</span>
                            <span style={{
                              fontSize: 10, padding: "1px 6px", borderRadius: 4, fontWeight: 600,
                              background: ev.action === "pickup" ? "#14532d" : "#1c1917",
                              color: ev.action === "pickup" ? "#4ade80" : "#78716c",
                            }}>
                              {ev.action}
                            </span>
                            <span style={{
                              fontSize: 10, padding: "1px 6px", borderRadius: 4,
                              background: COLUMN_COLORS[ev.col]?.bg ?? "#27272a",
                              color: COLUMN_COLORS[ev.col]?.text ?? "#71717a",
                            }}>
                              {ev.col}
                            </span>
                          </>
                        )}
                        {ev.kind === "worklog" && (
                          <>
                            <span style={{ fontSize: 11, color: "#a1a1aa", fontWeight: 500 }}>{ev.worker}</span>
                            <span style={{ fontSize: 10, color: "#52525b" }}>note</span>
                          </>
                        )}
                        <span style={{ fontSize: 10, color: "#52525b", fontFamily: "monospace", marginLeft: "auto" }}>
                          {ev.at.slice(0, 16).replace("T", " ")}
                        </span>
                      </div>
                      {ev.kind === "worklog" && ev.note && (
                        <div style={{ fontSize: 11, color: "#71717a", marginTop: 2, lineHeight: 1.4, wordBreak: "break-word" }}>
                          {ev.note.length > 120 ? ev.note.slice(0, 120) + "…" : ev.note}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmtTokens(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

function fmtDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"]);

function isImageAttachment(a: Attachment): boolean {
  if (a.mime?.startsWith("image/")) return true;
  const ext = a.path.slice(a.path.lastIndexOf(".")).toLowerCase();
  return IMAGE_EXTS.has(ext);
}

function AttachmentsSection({ card, onOpenFile, onInjectContext, onMutate, onToast }: {
  card: Card;
  onOpenFile?: (path: string) => void;
  onInjectContext?: (ctx: string) => void;
  onMutate?: () => void;
  onToast?: (icon: string, title: string, sub?: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: FileList | File[]) => {
    const allFiles = Array.from(files);
    if (!allFiles.length) return;
    setUploading(true);
    try {
      for (const file of allFiles) {
        const form = new FormData();
        form.append("file", file);
        form.append("cardId", card.id);
        const upRes = await fetch("/api/upload", { method: "POST", body: form });
        if (!upRes.ok) { onToast?.("!", "Upload failed", await upRes.text()); continue; }
        const { path } = await upRes.json();
        await fetch(`/api/cards/${card.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, label: file.name, mime: file.type }),
        });
      }
      onMutate?.();
      onToast?.("📎", "File attached", `${allFiles.length} file${allFiles.length > 1 ? "s" : ""}`);
    } catch (e) {
      onToast?.("!", "Upload error", String(e));
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const file = items[i].getAsFile();
      if (file) pastedFiles.push(file);
    }
    if (pastedFiles.length) uploadFiles(pastedFiles);
  };

  const attachments = card.attachments ?? [];

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
      tabIndex={0}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Attachments</h3>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer"
          style={{ background: "none", border: "none", fontFamily: "inherit" }}
        >{uploading ? "uploading…" : "+ add file"}</button>
        <input ref={fileInputRef} type="file" multiple hidden onChange={e => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {attachments.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          {attachments.map((a: Attachment, i: number) => {
            const isImage = isImageAttachment(a);
            const ctxMenu = onInjectContext ? (e: React.MouseEvent) => {
              e.preventDefault();
              onInjectContext(`[${card.id}] Attachment: ${a.label || a.path}\nPath: ${a.path}`);
            } : undefined;

            if (isImage) {
              return (
                <a
                  key={i}
                  href={`/api/media?path=${encodeURIComponent(a.path)}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "block", borderRadius: 6, overflow: "hidden", border: "1px solid #3f3f46", background: "#18181b" }}
                  title={a.label || a.path}
                  onContextMenu={ctxMenu}
                >
                  <img
                    src={`/api/media?path=${encodeURIComponent(a.path)}`}
                    alt={a.label || "attachment"}
                    style={{ width: "100%", height: "auto", display: "block" }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  {a.label && (
                    <div style={{ padding: "4px 6px", fontSize: 11, color: "#a1a1aa", fontFamily: "var(--font-geist-mono), ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.label}
                    </div>
                  )}
                </a>
              );
            }

            // Non-image: open in FileViewModal
            const ext = a.path.slice(a.path.lastIndexOf(".")).toLowerCase();
            const fileName = a.label || a.path.split("/").pop() || a.path;
            return (
              <div
                key={i}
                onClick={() => onOpenFile?.(a.path)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  borderRadius: 6, border: "1px solid #3f3f46", background: "#18181b",
                  cursor: "pointer", transition: "border-color 0.15s",
                }}
                title={a.path}
                onContextMenu={ctxMenu}
                onMouseEnter={e => (e.currentTarget.style.borderColor = "#60a5fa")}
                onMouseLeave={e => (e.currentTarget.style.borderColor = "#3f3f46")}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>
                  {ext === ".md" ? "📝" : ext === ".pdf" ? "📄" : "📄"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: "#e4e4e7", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {fileName}
                  </div>
                  <div style={{ fontSize: 10, color: "#71717a", fontFamily: "var(--font-geist-mono), ui-monospace, monospace" }}>
                    {ext || "file"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div
        style={{
          border: dragOver ? "2px dashed #818cf8" : "1px dashed #3f3f46",
          borderRadius: 6, padding: "12px 0", textAlign: "center",
          background: dragOver ? "#1a1a2e" : "transparent",
          transition: "all 0.15s", cursor: "pointer",
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <span style={{ fontSize: 11, color: dragOver ? "#818cf8" : "#52525b" }}>
          {dragOver ? "Drop file here" : "Drop, paste, or click to attach files"}
        </span>
      </div>
    </div>
  );
}

function AgentRunsSection({ cardId }: { cardId: string }) {
  const { data: runs, isLoading } = useSWR<AgentRun[]>(
    `/api/card/${cardId}/runs`,
    fetcher,
    { refreshInterval: 10000 }
  );
  const { data: budget } = useSWR<{ multiplier: number; plan: string }>(
    "/api/budget",
    fetcher,
  );
  const [open, setOpen] = useState(false);

  const items = runs ?? [];
  const totalRuns = items.length;
  const totalTokens = items.reduce((s, r) => s + r.totalTokens, 0);
  const totalCost = items.reduce((s, r) => s + r.costUsd, 0);
  const mult = budget?.multiplier ?? 1;
  const subCost = (n: number) => fmtCost(n / mult);

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
          cursor: "pointer", padding: 0, marginBottom: open ? 10 : 0,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Agent Runs
        </span>
        {!isLoading && (
          <span style={{ fontSize: 10, color: "#52525b", background: "#27272a", borderRadius: 10, padding: "0 6px", lineHeight: "18px" }}>
            {totalRuns}
          </span>
        )}
        {/* cost badge hidden for now */}
        <span style={{ fontSize: 10, color: "#52525b", marginLeft: 2 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div>
          {isLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{ height: 48, background: "#27272a", borderRadius: 6, opacity: 0.5 }} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div style={{ color: "#52525b", fontSize: 12, padding: "8px 0", fontStyle: "italic" }}>
              No agent runs recorded yet.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {items.map((run) => (
                  <div key={run.id} style={{
                    background: "#18181b", border: "1px solid #27272a", borderRadius: 6, padding: "8px 10px",
                    fontSize: 11, fontFamily: "monospace",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{
                        padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                        background: COLUMN_COLORS[run.column]?.bg ?? "#27272a",
                        color: COLUMN_COLORS[run.column]?.text ?? "#a1a1aa",
                      }}>
                        {run.column}
                      </span>
                      <span style={{ color: "#a1a1aa" }}>{fmtDuration(run.durationMs)}</span>
                      <span style={{
                        color: run.exitCode === 0 ? "#4ade80" : run.exitCode === null ? "#71717a" : "#f87171",
                        fontWeight: 600,
                      }}>
                        exit {run.exitCode ?? "?"}
                      </span>
                      <span style={{ color: "#71717a", marginLeft: "auto" }}>
                        {run.endedAt.slice(0, 16).replace("T", " ")}
                      </span>
                    </div>
                    {(run.totalTokens > 0 || run.costUsd > 0) && (
                      <div style={{ display: "flex", gap: 12, marginTop: 4, color: "#52525b", fontSize: 10 }}>
                        <span>in: {fmtTokens(run.inputTokens)}</span>
                        <span>out: {fmtTokens(run.outputTokens)}</span>
                        <span>cache-r: {fmtTokens(run.cacheReadTokens)}</span>
                        <span>cache-w: {fmtTokens(run.cacheWriteTokens)}</span>
                        <span style={{ color: "#a1a1aa" }}>total: {fmtTokens(run.totalTokens)}</span>
                        {/* cost per run hidden for now */}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Totals bar */}
              {totalRuns > 1 && (
                <div style={{
                  marginTop: 8, padding: "6px 10px", background: "#09090b", border: "1px solid #27272a",
                  borderRadius: 6, fontSize: 11, fontFamily: "monospace", color: "#a1a1aa",
                  display: "flex", gap: 16, alignItems: "center",
                }}>
                  <span>{totalRuns} runs</span>
                  {totalTokens > 0 && <span>{fmtTokens(totalTokens)} tokens</span>}
                  {/* total cost hidden for now */}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function CardModal({ cardId, projects, activeIds, onClose, onOpenLog, onToast, onMutate, onInjectContext, onHold }: Props) {
  const { data: card } = useSWR<Card>(
    cardId ? `/api/card/${cardId}` : null,
    fetcher,
    { refreshInterval: 5000 }
  );

  const [fileModal, setFileModal] = useState<{ path: string; base?: string } | null>(null);

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.name]));
  const isActive = cardId ? (activeIds?.has(cardId) ?? false) : false;
  const workDir = card?.project_id ? projects.find(p => p.id === card.project_id)?.work_dir : undefined;

  function handleContentClick(e: React.MouseEvent) {
    const el = (e.target as HTMLElement).closest("[data-fp]") as HTMLElement | null;
    if (el) {
      e.preventDefault();
      setFileModal({ path: el.getAttribute("data-fp")!, base: workDir });
    }
  }

  if (!cardId) return null;

  return (
    <>
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
              {card && card.column !== "shipped" && onHold && (() => {
                const held = card.tags.includes("hold");
                return (
                  <button
                    onClick={() => onHold(card.id)}
                    title={held ? "Remove hold" : "Put on hold"}
                    style={{
                      fontSize: 11, padding: "3px 10px", borderRadius: 6, fontWeight: 600,
                      background: held ? "#fbbf24" : "#1c1917",
                      border: `1px solid ${held ? "#f59e0b" : "#78716c"}`,
                      color: held ? "#1c1917" : "#a8a29e", cursor: "pointer",
                    }}
                  >
                    {held ? "↩ Unhold" : "⏸ Hold"}
                  </button>
                );
              })()}
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
            const handleSectionContextMenu = (e: React.MouseEvent) => {
              if (!onInjectContext) return;
              e.preventDefault();
              onInjectContext(`[${card.id}] ${label}:\n${unescapeNewlines(val).slice(0, 800)}${val.length > 800 ? "\n…(truncated)" : ""}`);
            };
            return (
              <div key={field} onContextMenu={handleSectionContextMenu}>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">{label}</h3>
                <div
                  className="card-markdown text-sm text-zinc-300 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(val) }}
                  onClick={handleContentClick}
                />
              </div>
            );
          })}

          {/* Verify URL */}
          {card.verify_url && (() => {
            const url = card.verify_url;
            const isFilePath = url.startsWith("/") || url.startsWith("~/") || url.startsWith("file://");
            const displayPath = url.startsWith("file://") ? url.slice(7) : url;
            return (
              <div>
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Verify URL</h3>
                {isFilePath ? (
                  <span
                    onClick={() => setFileModal({ path: displayPath })}
                    className="text-sm text-blue-400 hover:text-blue-300 underline font-mono break-all cursor-pointer"
                  >
                    {url}
                  </span>
                ) : (
                  <a href={url} target="_blank" rel="noreferrer"
                    className="text-sm text-blue-400 hover:text-blue-300 underline font-mono break-all">
                    {url}
                  </a>
                )}
              </div>
            );
          })()}

          {/* Work Log */}
          {card.work_log && card.work_log.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Work Log</h3>
              <div className="space-y-2">
                {card.work_log.map((entry, i) => (
                  <div key={i} className="bg-zinc-800 rounded px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 text-zinc-500 mb-1">
                      <span className="font-mono">{entry.at?.slice(0, 16)?.replace("T", " ") ?? ""}</span>
                      <span>·</span>
                      <span>{entry.worker}</span>
                    </div>
                    <div className="text-zinc-300 leading-relaxed">{entry.note}</div>
                    {entry.links?.map((l) => (
                      <a key={l} href={l} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline block mt-1 truncate">{l}</a>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attachments */}
          <AttachmentsSection card={card} onOpenFile={(path) => setFileModal({ path, base: workDir })} onInjectContext={onInjectContext} onMutate={onMutate} onToast={onToast} />

          {/* Agent Runs */}
          <AgentRunsSection cardId={card.id} />

          {/* Timeline */}
          <TimelineSection cardId={card.id} />
        </div>
      )}

      {/* Footer */}
      {card && (
        <div className="border-t border-zinc-800 px-6 py-3 flex-shrink-0">
          <div className="text-xs text-zinc-600 font-mono">{card.id}</div>
        </div>
      )}
    </Modal>

    {fileModal && (
      <FileViewModal
        filePath={fileModal.path}
        base={fileModal.base}
        onClose={() => setFileModal(null)}
      />
    )}
    </>
  );
}
