"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  pendingContext: string | null;
  onContextConsumed: () => void;
  projectId?: string;
  activeCardId?: string;
}

export function ChatPanel({ open, onClose, pendingContext, onContextConsumed, projectId, activeCardId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [context, setContext] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Consume injected context — append to draft and focus
  useEffect(() => {
    if (!pendingContext) return;
    setContext(pendingContext);
    onContextConsumed();
    // Open panel happens in parent; just focus the textarea
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [pendingContext, onContextConsumed]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || streaming) return;

    const userMessage: Message = { role: "user", content: text };
    const capturedContext = context;

    setMessages(prev => [...prev, userMessage]);
    setDraft("");
    setContext(null);
    setStreaming(true);

    // Placeholder assistant message that we'll fill in
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          context: capturedContext ?? undefined,
          projectId: projectId ?? undefined,
          activeCardId: activeCardId ?? undefined,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "Unknown error");
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: errText, error: true };
          return copy;
        });
        setStreaming(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(part.slice(6)) as { type: string; text?: string; message?: string };
            if (evt.type === "delta" && evt.text) {
              setMessages(prev => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last.role === "assistant") {
                  copy[copy.length - 1] = { ...last, content: last.content + evt.text };
                }
                return copy;
              });
            } else if (evt.type === "error") {
              setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: "assistant", content: evt.message ?? "Error", error: true };
                return copy;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const msg = err instanceof Error ? err.message : "Request failed";
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: msg, error: true };
          return copy;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [draft, context, messages, streaming]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearContext = () => setContext(null);

  const panelStyle: React.CSSProperties = {
    width: open ? 360 : 0,
    minWidth: 0,
    flexShrink: 0,
    borderLeft: open ? "1px solid #27272a" : "none",
    background: "#0c0c0e",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    transition: "width 0.2s ease",
  };

  return (
    <div style={panelStyle}>
      {open && (
        <>
          {/* Header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 14px", borderBottom: "1px solid #27272a", flexShrink: 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#a1a1aa", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                AM Chat
              </span>
              <span style={{
                fontSize: 10, padding: "1px 6px", borderRadius: 3,
                background: "#1a2a1a", color: "#4ade80", fontWeight: 600,
              }}>Haiku</span>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  title="Clear history"
                  style={{
                    background: "none", border: "none", color: "#52525b", cursor: "pointer",
                    fontSize: 11, padding: "2px 6px", borderRadius: 3,
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = "#a1a1aa")}
                  onMouseLeave={e => (e.currentTarget.style.color = "#52525b")}
                >
                  clear
                </button>
              )}
              <button
                onClick={onClose}
                style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
                onMouseEnter={e => (e.currentTarget.style.color = "#a1a1aa")}
                onMouseLeave={e => (e.currentTarget.style.color = "#52525b")}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.length === 0 && (
              <div style={{ color: "#3f3f46", fontSize: 12, textAlign: "center", marginTop: 40, lineHeight: 1.6 }}>
                Right-click any card, section, or attachment<br />to inject context here.
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: "flex",
                flexDirection: "column",
                alignItems: msg.role === "user" ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  maxWidth: "92%",
                  padding: "8px 11px",
                  borderRadius: msg.role === "user" ? "10px 10px 3px 10px" : "10px 10px 10px 3px",
                  background: msg.role === "user" ? "#1d3a2a" : "#18181b",
                  border: msg.error
                    ? "1px solid #7c2d12"
                    : msg.role === "user"
                      ? "1px solid #16a34a"
                      : "1px solid #27272a",
                  fontSize: 13,
                  color: msg.error ? "#f87171" : msg.role === "user" ? "#bbf7d0" : "#d4d4d8",
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {msg.role === "assistant" && msg.content === "" && !msg.error && (
                    <span style={{ color: "#52525b", fontSize: 11 }}>▌</span>
                  )}
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Context badge */}
          {context && (
            <div style={{
              margin: "0 10px", padding: "6px 10px", borderRadius: 6,
              background: "#1a1a2e", border: "1px solid #3b3b6b",
              display: "flex", alignItems: "flex-start", gap: 6, flexShrink: 0,
            }}>
              <span style={{ fontSize: 10, color: "#818cf8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0, marginTop: 1 }}>
                ctx
              </span>
              <span style={{ fontSize: 11, color: "#a5b4fc", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {context.slice(0, 80)}{context.length > 80 ? "…" : ""}
              </span>
              <button
                onClick={clearContext}
                style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0, flexShrink: 0 }}
              >×</button>
            </div>
          )}

          {/* Compose box */}
          <div style={{
            padding: "10px 10px 12px", borderTop: "1px solid #1f1f1f", flexShrink: 0,
            display: "flex", flexDirection: "column", gap: 6,
          }}>
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={streaming ? "Waiting for response…" : "Message AM… (Enter to send)"}
              disabled={streaming}
              rows={3}
              style={{
                width: "100%", background: "#18181b", border: "1px solid #3f3f46",
                borderRadius: 6, color: "#e4e4e7", fontSize: 13, fontFamily: "inherit",
                padding: "7px 10px", outline: "none", resize: "none", lineHeight: 1.5,
                transition: "border-color 0.15s", boxSizing: "border-box",
                opacity: streaming ? 0.6 : 1,
              }}
              onFocus={e => { e.currentTarget.style.borderColor = "#52525b"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "#3f3f46"; }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: "#3f3f46" }}>Shift+Enter for newline</span>
              <button
                onClick={send}
                disabled={!draft.trim() || streaming}
                style={{
                  background: draft.trim() && !streaming ? "#16a34a" : "#27272a",
                  border: "none", borderRadius: 5, color: draft.trim() && !streaming ? "#f0fdf4" : "#52525b",
                  fontSize: 12, fontWeight: 600, padding: "5px 14px", cursor: draft.trim() && !streaming ? "pointer" : "not-allowed",
                  fontFamily: "inherit", transition: "background 0.15s, color 0.15s",
                }}
              >
                {streaming ? "…" : "Send"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
