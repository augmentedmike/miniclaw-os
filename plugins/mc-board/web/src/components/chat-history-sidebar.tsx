"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAccent } from "@/lib/accent-context";

interface ArchivedChat {
  id: string;
  title: string;
  preview: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  total_cost: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onResume: (chatId: string) => void;
  onDelete?: (chatId: string) => void;
  currentSessionId: string | null;
  serverBaseUrl: string; // e.g. "http://localhost:4221"
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatCost(cost: number): string {
  if (cost === 0) return "";
  if (cost < 0.01) return `<$0.01`;
  return `$${cost.toFixed(2)}`;
}

export function ChatHistorySidebar({
  isOpen,
  onClose,
  onResume,
  currentSessionId,
  serverBaseUrl,
}: Props) {
  const accent = useAccent();
  const [chats, setChats] = useState<ArchivedChat[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const LIMIT = 25;
  const searchRef = useRef<HTMLInputElement>(null);

  const fetchChats = useCallback(async (newOffset = 0, replace = true) => {
    setLoading(true);
    setError(null);
    try {
      const url = `${serverBaseUrl}/chats?limit=${LIMIT}&offset=${newOffset}`;
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setChats(prev => replace ? (data.chats ?? []) : [...prev, ...(data.chats ?? [])]);
      setTotal(data.total ?? 0);
      setOffset(newOffset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load chats");
    } finally {
      setLoading(false);
    }
  }, [serverBaseUrl]);

  // Fetch when opened
  useEffect(() => {
    if (isOpen) {
      fetchChats(0, true);
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen, fetchChats]);

  const handleDelete = useCallback(async (chatId: string) => {
    if (confirmDeleteId !== chatId) {
      setConfirmDeleteId(chatId);
      return;
    }
    setConfirmDeleteId(null);
    setDeletingId(chatId);
    try {
      const resp = await fetch(`${serverBaseUrl}/chats/${chatId}`, { method: "DELETE" });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setChats(prev => prev.filter(c => c.id !== chatId));
      setTotal(prev => Math.max(0, prev - 1));
    } catch {
      setError("Failed to delete chat");
    } finally {
      setDeletingId(null);
    }
  }, [serverBaseUrl, confirmDeleteId]);

  const filteredChats = query.trim()
    ? chats.filter(c =>
        c.title.toLowerCase().includes(query.toLowerCase()) ||
        c.preview.toLowerCase().includes(query.toLowerCase())
      )
    : chats;

  if (!isOpen) return null;

  return (
    <div style={{
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "#0c0c0e",
      zIndex: 20,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 14px",
        borderBottom: "1px solid #27272a",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{
            fontSize: 12, fontWeight: 700, color: "#a1a1aa",
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}>History</span>
          {total > 0 && (
            <span style={{
              fontSize: 10, padding: "1px 5px", borderRadius: 3,
              background: "#27272a", color: "#71717a", fontWeight: 600,
            }}>{total}</span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", color: "#52525b",
            cursor: "pointer", fontSize: 18, lineHeight: 1,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = "#a1a1aa")}
          onMouseLeave={e => (e.currentTarget.style.color = "#52525b")}
          title="Close history"
        >✕</button>
      </div>

      {/* Search */}
      <div style={{ padding: "8px 10px", borderBottom: "1px solid #1f1f1f", flexShrink: 0 }}>
        <div style={{ position: "relative" }}>
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="#52525b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)" }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search chats…"
            style={{
              width: "100%",
              background: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 5,
              color: "#e4e4e7",
              fontSize: 12,
              padding: "5px 8px 5px 26px",
              outline: "none",
              boxSizing: "border-box",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "#52525b")}
            onBlur={e => (e.currentTarget.style.borderColor = "#3f3f46")}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              style={{
                position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", color: "#52525b",
                cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0,
              }}
            >×</button>
          )}
        </div>
      </div>

      {/* Chat list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {loading && chats.length === 0 && (
          <div style={{ color: "#3f3f46", fontSize: 12, textAlign: "center", padding: "24px 0" }}>
            Loading…
          </div>
        )}

        {error && (
          <div style={{
            margin: "8px 10px", padding: "8px 10px", borderRadius: 5,
            background: "#2a1a1a", border: "1px solid #7c2d12",
            fontSize: 11, color: "#f87171",
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          }}>
            <span>{error}</span>
            <button
              onClick={() => { setError(null); fetchChats(); }}
              style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 11 }}
            >retry</button>
          </div>
        )}

        {!loading && !error && filteredChats.length === 0 && (
          <div style={{ color: "#3f3f46", fontSize: 12, textAlign: "center", padding: "32px 14px" }}>
            {query ? "No matching chats" : "No archived chats yet.\nStart a new chat and click \"new\" to archive."}
          </div>
        )}

        {filteredChats.map(chat => {
          const isActive = chat.id === currentSessionId;
          const isConfirm = confirmDeleteId === chat.id;
          const isDeleting = deletingId === chat.id;

          return (
            <div
              key={chat.id}
              style={{
                padding: "9px 12px",
                borderLeft: isActive ? `2px solid ${accent}` : "2px solid transparent",
                background: isActive ? "#141414" : "transparent",
                cursor: "pointer",
                position: "relative",
              }}
              onClick={() => { if (!isConfirm) { setConfirmDeleteId(null); onResume(chat.id); } }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#111111"; }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
            >
              {/* Title row */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                <div style={{
                  flex: 1, minWidth: 0,
                  fontSize: 12, fontWeight: isActive ? 600 : 500,
                  color: isActive ? "#e4e4e7" : "#a1a1aa",
                  lineHeight: 1.4,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {isActive && (
                    <span style={{
                      fontSize: 9, background: accent + "22", color: accent,
                      border: `1px solid ${accent}55`, borderRadius: 3,
                      padding: "1px 4px", marginRight: 6, fontWeight: 700,
                      letterSpacing: "0.04em", verticalAlign: "middle",
                    }}>LIVE</span>
                  )}
                  {chat.title || "Untitled chat"}
                </div>
                {/* Delete button */}
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(chat.id); }}
                  disabled={isDeleting}
                  style={{
                    background: isConfirm ? "#7c2d12" : "none",
                    border: isConfirm ? "1px solid #ef4444" : "1px solid transparent",
                    borderRadius: 3,
                    color: isConfirm ? "#fca5a5" : "#3f3f46",
                    cursor: isDeleting ? "wait" : "pointer",
                    fontSize: 10, padding: "1px 4px",
                    flexShrink: 0, fontFamily: "inherit",
                    transition: "all 0.1s",
                  }}
                  onMouseEnter={e => { if (!isConfirm) e.currentTarget.style.color = "#f87171"; }}
                  onMouseLeave={e => { if (!isConfirm) e.currentTarget.style.color = "#3f3f46"; }}
                  title={isConfirm ? "Confirm delete" : "Delete chat"}
                >
                  {isDeleting ? "…" : isConfirm ? "confirm" : "✕"}
                </button>
              </div>

              {/* Preview */}
              {chat.preview && (
                <div style={{
                  fontSize: 11, color: "#52525b", marginTop: 3,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  lineHeight: 1.4,
                }}>
                  {chat.preview}
                </div>
              )}

              {/* Meta row */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginTop: 4,
                fontSize: 10, color: "#3f3f46",
              }}>
                <span title={new Date(chat.updated_at).toLocaleString()}>
                  {formatDate(chat.updated_at)}
                </span>
                <span>·</span>
                <span>{chat.message_count} msg{chat.message_count !== 1 ? "s" : ""}</span>
                {chat.total_cost > 0 && (
                  <>
                    <span>·</span>
                    <span style={{ color: "#4a4a2a" }}>{formatCost(chat.total_cost)}</span>
                  </>
                )}
              </div>

              {/* Confirm delete banner */}
              {isConfirm && (
                <div
                  style={{
                    marginTop: 6, fontSize: 10, color: "#fca5a5",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                  onClick={e => e.stopPropagation()}
                >
                  <span>Delete this chat?</span>
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDeleteId(null); }}
                    style={{
                      background: "none", border: "none", color: "#71717a",
                      cursor: "pointer", fontSize: 10, padding: 0, fontFamily: "inherit",
                    }}
                  >cancel</button>
                </div>
              )}
            </div>
          );
        })}

        {/* Load more */}
        {!query && filteredChats.length < total && (
          <div style={{ padding: "8px", display: "flex", justifyContent: "center" }}>
            <button
              onClick={() => fetchChats(offset + LIMIT, false)}
              disabled={loading}
              style={{
                background: "none",
                border: "1px solid #27272a",
                borderRadius: 5,
                color: loading ? "#3f3f46" : "#52525b",
                fontSize: 11, padding: "4px 12px",
                cursor: loading ? "wait" : "pointer",
                fontFamily: "inherit",
              }}
            >{loading ? "Loading…" : `Load more (${total - filteredChats.length} remaining)`}</button>
          </div>
        )}
      </div>

      {/* Footer: refresh */}
      <div style={{
        borderTop: "1px solid #1f1f1f",
        padding: "6px 12px",
        display: "flex",
        justifyContent: "flex-end",
        flexShrink: 0,
      }}>
        <button
          onClick={() => fetchChats(0, true)}
          disabled={loading}
          style={{
            background: "none", border: "none",
            color: loading ? "#3f3f46" : "#52525b",
            cursor: loading ? "wait" : "pointer",
            fontSize: 10, fontFamily: "inherit", padding: 0,
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.color = "#a1a1aa"; }}
          onMouseLeave={e => { if (!loading) e.currentTarget.style.color = "#52525b"; }}
        >↻ refresh</button>
      </div>
    </div>
  );
}
