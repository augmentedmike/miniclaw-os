"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  error?: boolean;
}

interface Props {
  open: boolean;
  onToggle: () => void;
  pendingContext: string | null;
  onContextConsumed: () => void;
  projectId?: string;
  activeCardId?: string;
  agentName?: string;
}

export function ChatPanel({ open, onToggle, pendingContext, onContextConsumed, projectId, activeCardId, agentName = "AM" }: Props) {
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("mc-chat-messages") || "[]"); } catch { return []; }
  });
  const [draft, setDraft] = useState("");
  const [context, setContext] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingTools, setStreamingTools] = useState<{ name: string }[]>([]);
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("mc-chat-session") || null;
  });
  const [visibleCount, setVisibleCount] = useState(20);

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamingInsertIndexRef = useRef<number | null>(null);

  // Persist
  useEffect(() => {
    try { localStorage.setItem("mc-chat-messages", JSON.stringify(messages)); } catch {}
  }, [messages]);
  useEffect(() => {
    if (sessionId) localStorage.setItem("mc-chat-session", sessionId);
    else localStorage.removeItem("mc-chat-session");
  }, [sessionId]);

  // WebSocket connection
  useEffect(() => {
    const wsHost = window.location.hostname;
    const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${wsProto}://${wsHost}:4221`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      const sid = localStorage.getItem("mc-chat-session");
      ws.send(JSON.stringify({ type: "join", sessionId: sid }));
    };

    ws.onclose = () => { setConnected(false); setStreaming(false); };

    ws.onmessage = (event) => {
      const d = JSON.parse(event.data);
      switch (d.type) {
        case "joined":
          setSessionId(d.sessionId);
          if (d.processing) setStreaming(true);
          break;
        case "streaming":
          setStreaming(true);
          if (d.text) setStreamingText(d.text);
          if (d.tools?.length) setStreamingTools(d.tools);
          break;
        case "result":
          setStreaming(false); setStreamingText(""); setStreamingTools([]);
          if (d.text) {
            const insertIdx = streamingInsertIndexRef.current;
            if (insertIdx !== null) {
              setMessages(prev => [
                ...prev.slice(0, insertIdx),
                { role: "assistant", content: d.text },
                ...prev.slice(insertIdx),
              ]);
            } else {
              setMessages(prev => [...prev, { role: "assistant", content: d.text }]);
            }
          }
          streamingInsertIndexRef.current = null;
          break;
        case "done": case "process_exit":
          setStreaming(false); setStreamingText(""); setStreamingTools([]);
          streamingInsertIndexRef.current = null;
          break;
        case "error":
          setMessages(prev => [...prev, { role: "system", content: d.message, error: true }]);
          setStreaming(false);
          streamingInsertIndexRef.current = null;
          break;
      }
    };

    return () => ws.close();
  }, []);

  // Consume injected context
  useEffect(() => {
    if (!pendingContext) return;
    setContext(pendingContext);
    onContextConsumed();
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [pendingContext, onContextConsumed]);

  // Scroll to bottom and focus textarea on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    textareaRef.current?.focus();
  }, [messages, streamingText]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (!text || !wsRef.current || !connected) return;

    if (text === "/clear") {
      wsRef.current.send(JSON.stringify({ type: "new_chat" }));
      setMessages([]);
      setSessionId(null);
      setVisibleCount(20);
      setDraft("");
      setContext(null);
      streamingInsertIndexRef.current = null;
      return;
    }

    let content = text;
    if (context) {
      content = `[Context: ${context}]\n\n${text}`;
      setContext(null);
    }

    setMessages(prev => {
      const next = [...prev, { role: "user" as const, content: text }];
      // Track where the streaming assistant response should be inserted.
      // Only set on the FIRST send that starts streaming — subsequent sends
      // during the same streaming session must NOT overwrite the index,
      // otherwise messages sent during streaming appear in the wrong order.
      if (streamingInsertIndexRef.current === null) {
        streamingInsertIndexRef.current = next.length;
      }
      return next;
    });
    wsRef.current.send(JSON.stringify({ type: "chat", content }));
    setDraft("");
    setStreaming(true);
  }, [draft, context, connected, streaming]);

  const stopResponse = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "stop" }));
    setStreaming(false); setStreamingText(""); setStreamingTools([]);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearContext = () => setContext(null);

  // Collapsed state — vertical "CHAT" label
  if (!open) {
    return (
      <div
        onClick={onToggle}
        style={{
          width: 32,
          flexShrink: 0,
          background: "#0c0c0e",
          borderLeft: "1px solid #27272a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          writingMode: "vertical-rl",
          textOrientation: "mixed",
          userSelect: "none",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "#18181b"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "#0c0c0e"; }}
      >
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.15em",
          color: connected ? "#4ade80" : "#52525b",
          textTransform: "uppercase",
        }}>
          CHAT
        </span>
      </div>
    );
  }

  // Open state
  return (
    <div style={{
      width: 380,
      flexShrink: 0,
      borderLeft: "1px solid #27272a",
      background: "#0c0c0e",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
      transition: "width 0.2s ease",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", borderBottom: "1px solid #27272a", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#a1a1aa", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {agentName}
          </span>
          <span style={{
            fontSize: 10, padding: "1px 6px", borderRadius: 3,
            background: connected ? "#1a2a1a" : "#2a1a1a",
            color: connected ? "#4ade80" : "#f87171",
            fontWeight: 600,
          }}>{connected ? "connected" : "offline"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {streaming && (
            <button
              onClick={stopResponse}
              style={{
                background: "none", border: "1px solid #7c2d12", color: "#f87171", cursor: "pointer",
                fontSize: 10, padding: "2px 8px", borderRadius: 3, fontFamily: "inherit",
              }}
            >stop</button>
          )}
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); wsRef.current?.send(JSON.stringify({ type: "new_chat" })); }}
              title="New chat"
              style={{
                background: "none", border: "none", color: "#52525b", cursor: "pointer",
                fontSize: 11, padding: "2px 6px", borderRadius: 3, fontFamily: "inherit",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "#a1a1aa")}
              onMouseLeave={e => (e.currentTarget.style.color = "#52525b")}
            >new</button>
          )}
          <button
            onClick={onToggle}
            style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 18, lineHeight: 1 }}
            onMouseEnter={e => (e.currentTarget.style.color = "#a1a1aa")}
            onMouseLeave={e => (e.currentTarget.style.color = "#52525b")}
          >✕</button>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && !streaming && (
          <div style={{ color: "#3f3f46", fontSize: 12, textAlign: "center", marginTop: 40, lineHeight: 1.6 }}>
            Chat with {agentName}.<br />Right-click any card to inject context.
          </div>
        )}
        {messages.length > visibleCount && (
          <button
            onClick={() => setVisibleCount(v => v + 20)}
            style={{
              background: "none", border: "1px solid #27272a", borderRadius: 6,
              color: "#52525b", fontSize: 11, padding: "4px 12px", cursor: "pointer",
              alignSelf: "center", fontFamily: "inherit",
            }}
          >Show older ({messages.length - visibleCount} more)</button>
        )}
        {(() => {
          const visible = messages.slice(-visibleCount);
          const visibleStartIdx = Math.max(0, messages.length - visibleCount);
          // Determine where streaming block goes within the visible slice
          const insertIdx = streamingInsertIndexRef.current;
          const streamingPos = (streaming && insertIdx !== null)
            ? Math.max(0, Math.min(insertIdx - visibleStartIdx, visible.length))
            : null;

          const renderMsg = (msg: Message, i: number) => (
            <div key={`msg-${i}`} style={{
              display: "flex", flexDirection: "column",
              alignItems: msg.role === "user" ? "flex-end" : "flex-start",
            }}>
              {msg.role === "system" ? (
                <div style={{ fontSize: 11, color: "#52525b", textAlign: "center", width: "100%", padding: "4px 0" }}>
                  {msg.content}
                </div>
              ) : (
                <div style={{
                  maxWidth: "92%", padding: "8px 11px",
                  borderRadius: msg.role === "user" ? "10px 10px 3px 10px" : "10px 10px 10px 3px",
                  background: msg.role === "user" ? "#1d3a2a" : "#18181b",
                  border: msg.error ? "1px solid #7c2d12"
                    : msg.role === "user" ? "1px solid #16a34a" : "1px solid #27272a",
                  fontSize: 13, color: msg.error ? "#f87171" : msg.role === "user" ? "#bbf7d0" : "#d4d4d8",
                  lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
                }}>
                  {msg.content}
                </div>
              )}
            </div>
          );

          const streamingBlock = streaming ? (
            <div key="streaming" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{
                maxWidth: "92%", padding: "8px 11px",
                borderRadius: "10px 10px 10px 3px",
                background: "#18181b", border: "1px solid #27272a",
                fontSize: 13, color: "#d4d4d8", lineHeight: 1.55,
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}>
                {streamingTools.length > 0 && (
                  <div style={{ marginBottom: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {streamingTools.map((t, i) => (
                      <span key={i} style={{
                        fontSize: 10, background: "#27272a", borderRadius: 3,
                        padding: "1px 6px", color: "#d97706", fontFamily: "monospace",
                      }}>{t.name}</span>
                    ))}
                  </div>
                )}
                {streamingText || <span style={{ color: "#52525b", animation: "pulse 1.5s infinite" }}>
                  {streamingTools.length > 0 ? "working..." : "thinking..."}
                </span>}
              </div>
            </div>
          ) : null;

          if (streamingPos !== null) {
            // Split: messages before streaming position, streaming block, messages after
            return (
              <>
                {visible.slice(0, streamingPos).map(renderMsg)}
                {streamingBlock}
                {visible.slice(streamingPos).map((msg, i) => renderMsg(msg, streamingPos + i))}
              </>
            );
          }
          // No insert position — render all messages then streaming block at end (normal case)
          return (
            <>
              {visible.map(renderMsg)}
              {streamingBlock}
            </>
          );
        })()}
        <div ref={messagesEndRef} />
      </div>

      {/* Context badge */}
      {context && (
        <div style={{
          margin: "0 10px", padding: "6px 10px", borderRadius: 6,
          background: "#1a1a2e", border: "1px solid #3b3b6b",
          display: "flex", alignItems: "flex-start", gap: 6, flexShrink: 0,
        }}>
          <span style={{ fontSize: 10, color: "#818cf8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0, marginTop: 1 }}>ctx</span>
          <span style={{ fontSize: 11, color: "#a5b4fc", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {context.slice(0, 80)}{context.length > 80 ? "…" : ""}
          </span>
          <button onClick={clearContext} style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
        </div>
      )}

      {/* Compose */}
      <div style={{
        padding: "10px 10px 12px", borderTop: "1px solid #1f1f1f", flexShrink: 0,
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${agentName}…`}
          rows={3}
          style={{
            width: "100%", background: "#18181b", border: "1px solid #3f3f46",
            borderRadius: 6, color: "#e4e4e7", fontSize: 13, fontFamily: "inherit",
            padding: "7px 10px", outline: "none", resize: "none", lineHeight: 1.5,
            transition: "border-color 0.15s", boxSizing: "border-box",
          }}
          onFocus={e => { e.currentTarget.style.borderColor = "#52525b"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "#3f3f46"; }}
        />
        <span style={{ fontSize: 10, color: "#3f3f46" }}>Shift+Enter to send</span>
      </div>
    </div>
  );
}
