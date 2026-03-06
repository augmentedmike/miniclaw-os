"use client";

import { useEffect, useState } from "react";
import hljs from "highlight.js";

interface FileData {
  content: string;
  resolved: string;
  ext: string;
  lang: string;
  size: number;
}

interface Props {
  filePath: string;
  base?: string;
  onClose: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"]);

const FONT = "'Geist Mono', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace";
const FONT_SIZE = 12.5;
const LINE_H = "1.65";

export function FileViewModal({ filePath, base, onClose }: Props) {
  const [data, setData] = useState<FileData | null>(null);
  const [isImage, setIsImage] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [wrap, setWrap] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "w" && (e.metaKey || e.altKey)) { e.preventDefault(); setWrap(w => !w); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    setData(null); setError(null); setIsImage(false); setImageUrl(null);
    const ext = filePath.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? "";
    if (IMAGE_EXTS.has(ext)) {
      setIsImage(true);
      const params = new URLSearchParams({ path: filePath });
      if (base) params.set("base", base);
      setImageUrl(`/api/file?${params}`);
      return;
    }
    const params = new URLSearchParams({ path: filePath });
    if (base) params.set("base", base);
    fetch(`/api/file?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(`${d.error}${d.resolved ? `\n\n${d.resolved}` : ""}`); return; }
        setData(d);
      })
      .catch(e => setError(String(e)));
  }, [filePath, base]);

  function highlight(content: string, lang: string): string {
    try {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(content, { language }).value;
    } catch {
      return content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
  }

  const filename = filePath.split("/").pop() ?? filePath;
  const dirPart = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/") + 1) : "";

  const lines = data ? data.content.split("\n") : [];
  // Trim trailing empty line that's an artifact of files ending with \n
  const lineCount = lines.length > 0 && lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
  const numWidth = String(lineCount).length;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 700, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          display: "flex", flexDirection: "column",
          width: "min(93vw, 1100px)", maxHeight: "90vh",
          background: "#0d0d10", border: "1px solid #2a2a30",
          borderRadius: 10, boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
          overflow: "hidden",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "10px 16px", borderBottom: "1px solid #1e1e23",
          background: "#111115", flexShrink: 0,
        }}>
          {/* Breadcrumb */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 0, overflow: "hidden" }}>
            {dirPart && (
              <span style={{ fontFamily: FONT, fontSize: 11, color: "#3f3f46", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flexShrink: 1 }}>
                {dirPart}
              </span>
            )}
            <span style={{ fontFamily: FONT, fontSize: 13, color: "#e4e4e7", fontWeight: 600, whiteSpace: "nowrap" }}>
              {filename}
            </span>
          </div>

          {/* Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {data && (
              <>
                <span style={{ fontFamily: FONT, fontSize: 11, color: "#3f3f46" }}>{data.lang}</span>
                <span style={{ color: "#27272a" }}>·</span>
                <span style={{ fontFamily: FONT, fontSize: 11, color: "#3f3f46" }}>{lineCount} lines</span>
                <span style={{ color: "#27272a" }}>·</span>
                <span style={{ fontFamily: FONT, fontSize: 11, color: "#3f3f46" }}>{formatSize(data.size)}</span>
                <span style={{ color: "#27272a" }}>·</span>
                <button
                  onClick={() => setWrap(w => !w)}
                  title={`${wrap ? "Disable" : "Enable"} word wrap (⌥W)`}
                  style={{
                    fontFamily: FONT, fontSize: 11,
                    color: wrap ? "#60a5fa" : "#52525b",
                    background: wrap ? "rgba(96,165,250,0.1)" : "none",
                    border: wrap ? "1px solid rgba(96,165,250,0.25)" : "1px solid transparent",
                    borderRadius: 4, cursor: "pointer", padding: "1px 6px",
                  }}
                >
                  wrap
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(data.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); })}
                  title="Copy file contents"
                  style={{
                    fontSize: 13, color: copied ? "#22c55e" : "#52525b",
                    background: "none", border: "none", cursor: "pointer", padding: "0 2px",
                  }}
                >
                  {copied ? "✓" : "⎘"}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              style={{ color: "#52525b", background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: "0 2px" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#a1a1aa")}
              onMouseLeave={e => (e.currentTarget.style.color = "#52525b")}
            >×</button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "auto", display: "flex" }}>
          {!data && !isImage && !error && (
            <div style={{ padding: 24, color: "#52525b", fontSize: 13, fontFamily: FONT }}>
              Loading {filename}…
            </div>
          )}

          {error && (
            <div style={{ padding: 24, color: "#f87171", fontSize: 13, fontFamily: FONT, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
              {error}
            </div>
          )}

          {isImage && imageUrl && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={filename} style={{ maxWidth: "100%", maxHeight: "76vh", borderRadius: 4 }} />
            </div>
          )}

          {data && (
            <div style={{ display: "flex", flex: 1, minWidth: "max-content" }}>
              {/* Line numbers gutter */}
              <div style={{
                position: "sticky", left: 0,
                background: "#0d0d10",
                borderRight: "1px solid #1e1e23",
                padding: `16px 14px 16px 20px`,
                userSelect: "none", flexShrink: 0, zIndex: 1,
              }}>
                <pre style={{
                  margin: 0,
                  fontFamily: FONT, fontSize: FONT_SIZE, lineHeight: LINE_H,
                  color: "#2e2e36", textAlign: "right",
                }}>
                  {Array.from({ length: lineCount }, (_, i) =>
                    String(i + 1).padStart(numWidth)
                  ).join("\n")}
                </pre>
              </div>

              {/* Code */}
              <pre
                className="hljs"
                style={{
                  margin: 0, padding: "16px 32px 16px 20px",
                  fontFamily: FONT, fontSize: FONT_SIZE, lineHeight: LINE_H,
                  background: "transparent", color: "#abb2bf",
                  whiteSpace: wrap ? "pre-wrap" : "pre",
                  wordBreak: wrap ? "break-all" : "normal",
                  flex: 1, overflowX: "visible",
                }}
                dangerouslySetInnerHTML={{ __html: highlight(data.content, data.lang) }}
              />
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {data && (
          <div style={{
            borderTop: "1px solid #1a1a1f", padding: "5px 16px",
            fontFamily: FONT, fontSize: 11, color: "#2a2a34",
            background: "#0b0b0e", flexShrink: 0,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {data.resolved}
          </div>
        )}
      </div>
    </div>
  );
}
