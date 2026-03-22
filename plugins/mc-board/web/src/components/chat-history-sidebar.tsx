"use client";
import { useState, useEffect, useCallback } from "react";
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
  open: boolean;
  onClose: () => void;
  onResumeChat: (chatId: string) => void;
  currentSessionId: string | null;
}

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ChatHistorySidebar({ open, onClose, onResumeChat, currentSessionId }: Props) {
  const accent = useAccent();
  const [chats, setChats] = useState<ArchivedChat[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const fetchChats = useCallback(async (newOffset = 0) => {
    setLoading(true);
    try {
      const wsHost = window.location.hostname;
      const res = await fetch(`http://${wsHost}:4221/chats?limit=${LIMIT}&offset=${newOffset}`);
      if (!res.ok) return;
      const data = await res.json();
      setChats(data.chats || []);
      setTotal(data.total || 0);
      setOffset(newOffset);
    } catch {
      // Chat server may be down
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh chat list when sidebar opens
  useEffect(() => {
    if (open) fetchChats(0);
  }, [open, fetchChats]);

  const handleDelete = useCallback(async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    const wsHost = window.location.hostname;
    try {
      const res = await fetch(`http://${wsHost}:4221/chats/${chatId}`, { method: "DELETE" });
      if (res.ok) {
        setChats(prev => prev.filter(c => c.id !== chatId));
        setTotal(prev => prev - 1);
      }
    } catch {}
  }, []);

  if (!open) return null;

  const hasMore = offset + LIMIT < total;
  const hasPrev = offset > 0;

  return (
    <div style={{
      position: "absolute",
      top: 0,
      left: 0,
      bottom: 0,
      width: "100%",
      background: "#0c0c0e",
      zIndex: 20,
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: "1px solid #27272a", flexShrink: 0,
      }}>
        <span style={{
          fontSize: 12, fontWeight: 700, color: "#a1a1aa",
          letterSpacing: "0.06em", textTransform: "uppercase",
        }}>
          Chat History
        </span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#52525b" }}>{total} chats</span>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "#52525b",
              cursor: "pointer", fontSize: 18, lineHeight: 1,
            }}
            onMouseEnter={e => (e.currentTarget.style.color = "#a1a1aa")}
            onMouseLeave={e => (e.currentTarget.style.color = "#52525b")}
          >✕</button>
        </div>
      </div>

      {/* Chat list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px" }}>
        {loading && chats.length === 0 && (
          <div style={{ color: "#3f3f46", fontSize: 12, textAlign: "center", marginTop: 40 }}>
            Loading...
          </div>
        )}
        {!loading && chats.length === 0 && (
          <div style={{ color: "#3f3f46", fontSize: 12, textAlign: "center", marginTop: 40, lineHeight: 1.6 }}>
            No chat history yet.<br />Start a conversation and it will appear here.
          </div>
        )}
        {chats.map(chat => {
          const isActive = chat.id === currentSessionId;
          return (
            <div
              key={chat.id}
              onClick={() => { onResumeChat(chat.id); onClose(); }}
              style={{
                padding: "10px 10px",
                borderRadius: 6,
                cursor: "pointer",
                marginBottom: 2,
                background: isActive ? "#1a2a1a" : "transparent",
                border: isActive ? `1px solid ${accent}33` : "1px solid transparent",
                transition: "background 0.15s, border-color 0.15s",
                position: "relative",
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.background = "#18181b";
                  const delBtn = e.currentTarget.querySelector("[data-delete]") as HTMLElement;
                  if (delBtn) delBtn.style.opacity = "1";
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.background = "transparent";
                  const delBtn = e.currentTarget.querySelector("[data-delete]") as HTMLElement;
                  if (delBtn) delBtn.style.opacity = "0";
                }
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: isActive ? accent : "#d4d4d8",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {isActive && <span style={{ marginRight: 4 }}>●</span>}
                    {chat.title || "Untitled"}
                  </div>
                  <div style={{
                    fontSize: 11, color: "#52525b", marginTop: 3,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {chat.preview || "No preview"}
                  </div>
                </div>
                <button
                  data-delete
                  onClick={(e) => handleDelete(e, chat.id)}
                  style={{
                    background: "none", border: "none", color: "#52525b",
                    cursor: "pointer", fontSize: 13, lineHeight: 1, padding: "2px",
                    opacity: 0, transition: "opacity 0.15s, color 0.15s",
                    flexShrink: 0,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#f87171")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#52525b")}
                  title="Delete chat"
                >×</button>
              </div>
              <div style={{
                display: "flex", gap: 8, marginTop: 4,
                fontSize: 10, color: "#3f3f46",
              }}>
                <span>{timeAgo(chat.updated_at)}</span>
                <span>{chat.message_count} msg{chat.message_count !== 1 ? "s" : ""}</span>
                {chat.total_cost > 0 && (
                  <span>${chat.total_cost.toFixed(3)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {(hasPrev || hasMore) && (
        <div style={{
          display: "flex", justifyContent: "center", gap: 12,
          padding: "8px 14px", borderTop: "1px solid #27272a", flexShrink: 0,
        }}>
          {hasPrev && (
            <button
              onClick={() => fetchChats(Math.max(0, offset - LIMIT))}
              style={{
                background: "none", border: "1px solid #27272a", borderRadius: 4,
                color: "#71717a", fontSize: 11, padding: "3px 10px", cursor: "pointer",
                fontFamily: "inherit",
              }}
            >← Newer</button>
          )}
          {hasMore && (
            <button
              onClick={() => fetchChats(offset + LIMIT)}
              style={{
                background: "none", border: "1px solid #27272a", borderRadius: 4,
                color: "#71717a", fontSize: 11, padding: "3px 10px", cursor: "pointer",
                fontFamily: "inherit",
              }}
            >Older →</button>
          )}
        </div>
      )}
    </div>
  );
}
