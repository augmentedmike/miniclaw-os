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

export function FileViewModal({ filePath, base, onClose }: Props) {
  const [data, setData] = useState<FileData | null>(null);
  const [isImage, setIsImage] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
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
        if (d.error) { setError(`${d.error}${d.resolved ? `\n${d.resolved}` : ""}`); return; }
        setData(d);
      })
      .catch(e => setError(String(e)));
  }, [filePath, base]);

  function highlight(content: string, lang: string): string {
    try {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(content, { language }).value;
    } catch {
      return content;
    }
  }

  const filename = filePath.split("/").pop() ?? filePath;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 700, background: "rgba(0,0,0,0.85)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="flex flex-col bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl"
        style={{ width: "min(90vw, 900px)", maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-800 flex-shrink-0">
          <span className="text-sm font-mono text-zinc-200 flex-1 truncate" title={filePath}>
            {filePath}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {data && (
              <>
                <span className="text-xs text-zinc-600 font-mono">{formatSize(data.size)}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(data.content).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    });
                  }}
                  style={{
                    fontSize: 13, color: copied ? "#22c55e" : "#52525b",
                    background: "none", border: "none", cursor: "pointer", padding: "0 4px",
                  }}
                  title="Copy contents"
                >
                  {copied ? "✓" : "⎘"}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-200 text-xl leading-none"
            >×</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto min-h-0">
          {!data && !isImage && !error && (
            <div className="p-6 text-zinc-500 text-sm font-mono">Loading {filename}…</div>
          )}
          {error && (
            <div className="p-6 text-red-400 text-sm font-mono whitespace-pre-wrap">{error}</div>
          )}
          {isImage && imageUrl && (
            <div className="flex items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt={filename} style={{ maxWidth: "100%", maxHeight: "75vh", borderRadius: 4 }} />
            </div>
          )}
          {data && (
            <pre
              style={{
                margin: 0, padding: "16px 20px",
                fontFamily: "monospace", fontSize: 12, lineHeight: 1.6,
                color: "#e4e4e7", background: "transparent",
                overflowX: "auto", whiteSpace: "pre",
              }}
              dangerouslySetInnerHTML={{ __html: highlight(data.content, data.lang) }}
            />
          )}
        </div>

        {/* Footer */}
        {data && (
          <div className="px-4 py-2 border-t border-zinc-800 flex-shrink-0 flex gap-3 text-xs text-zinc-600 font-mono">
            <span>{data.lang}</span>
            <span>·</span>
            <span>{data.content.split("\n").length} lines</span>
            <span>·</span>
            <span className="truncate">{data.resolved}</span>
          </div>
        )}
      </div>
    </div>
  );
}
