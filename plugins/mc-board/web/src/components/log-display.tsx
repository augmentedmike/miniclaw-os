"use client";

import { useState, useRef, useEffect } from "react";

interface Props {
  lines: string[];
  height?: number;
  showDebugToggle?: boolean;
  autoScroll?: boolean;
  running?: boolean;
  accent?: string;
}

export function LogDisplay({
  lines,
  height = 300,
  showDebugToggle = false,
  autoScroll = true,
  running = false,
  accent = "#00E5CC",
}: Props) {
  const [showDebug, setShowDebug] = useState(false);
  const [copied, setCopied] = useState(false);
  const termRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const visibleLines = showDebugToggle && !showDebug
    ? lines.filter(isImportantLine)
    : lines;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Controls bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        gap: 8,
        padding: "4px 8px",
        background: "#0d0d0d",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
      }}>
        {showDebugToggle && (
          <label style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            color: "#555",
            cursor: "pointer",
            userSelect: "none",
          }}>
            <input
              type="checkbox"
              checked={showDebug}
              onChange={() => setShowDebug(!showDebug)}
              style={{ width: 12, height: 12 }}
            />
            debug
          </label>
        )}
        <button
          onClick={handleCopy}
          title="Copy log to clipboard"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 2,
            fontSize: 14,
            color: copied ? "#4ade80" : "#555",
            transition: "color 0.2s",
          }}
        >
          {copied ? "✓" : "⧉"}
        </button>
      </div>

      {/* Terminal */}
      <div
        ref={termRef}
        style={{
          height,
          overflow: "auto",
          padding: 12,
          background: "#0a0a0a",
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
          lineHeight: "18px",
        }}
      >
        {visibleLines.map((line, i) => (
          <div key={i} style={{ color: lineColor(line) }}>{strip(line)}</div>
        ))}
        {running && (
          <div style={{ color: accent, animation: "pulse 1.5s infinite" }}>▋</div>
        )}
      </div>
    </div>
  );
}

function isImportantLine(l: string): boolean {
  const s = strip(l);
  if (s.startsWith("──") || s.startsWith("===")) return true;
  if (/\[✓\]|\[✗\]|\[!\]|\[i\]|✓|✗|⚠/.test(s)) return true;
  if (s.includes("miniclaw-os install")) return true;
  if (/Registered|Seeded/.test(s)) return true;
  // Show "Installed plugin:" but hide "Installing to /path..."
  if (s.startsWith("Installed plugin:")) return true;
  // Hide noisy openclaw output, bun install output, npm output, etc.
  if (s.startsWith("Installing to ")) return false;
  if (s.includes("bun install") || s.includes("npm install")) return false;
  if (s.includes("packages installed")) return false;
  if (s.includes("Resolving dependencies")) return false;
  if (s.includes("postinstalls")) return false;
  if (s.includes("lockfile")) return false;
  if (s.includes("[plugins]")) return false;
  if (s.includes("Config overwrite")) return false;
  if (s.includes("Config warnings")) return false;
  // Show progress lines like "[ ] Installing mc-board"
  if (/^\[ \]|^\[✓\]|^\[✗\]/.test(s)) return true;
  return false;
}

function strip(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function lineColor(l: string): string {
  if (l.includes("[✓]") || l.includes("✓")) return "#4ade80";
  if (l.includes("[✗]") || l.includes("✗")) return "#FF5252";
  if (l.includes("[!]") || l.includes("⚠")) return "#fbbf24";
  if (l.includes("[i]")) return "#60a5fa";
  if (l.startsWith("──")) return "#fff";
  return "#888";
}
