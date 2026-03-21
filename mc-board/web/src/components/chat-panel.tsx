"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAccent } from "@/lib/accent-context";
import { AgentMessageModal, type ContentBlock } from "./agent-message-modal";
import { ChatHistorySidebar } from "./chat-history-sidebar";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  images?: string[]; // base64 data URLs for display
  error?: boolean;
  blocks?: ContentBlock[]; // raw content blocks for agent modal expansion
}

interface PendingImage {
  file: File;
  preview: string;
  base64: string;
  mediaType: string;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const LOCAL_STORAGE_MAX_BYTES = 4 * 1024 * 1024; // 4MB safe threshold

/** Strip base64 image data URLs from messages before localStorage persist */
function stripImagesForStorage(messages: Message[]): Message[] {
  return messages.map(msg => {
    if (!msg.images || msg.images.length === 0) return msg;
    return {
      ...msg,
      images: msg.images.map(src =>
        src.startsWith("data:") ? "[image]" : src
      ),
    };
  });
}

/** Prune oldest messages until JSON fits within maxBytes */
function pruneToFit(messages: Message[], maxBytes: number): Message[] {
  let pruned = [...messages];
  while (pruned.length > 0) {
    const json = JSON.stringify(stripImagesForStorage(pruned));
    if (json.length * 2 <= maxBytes) return pruned; // JS strings are ~2 bytes/char in localStorage
    pruned = pruned.slice(1); // drop oldest
  }
  return [];
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
  const accent = useAccent();
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
  const [reconnecting, setReconnecting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("mc-chat-session") || null;
  });
  const [visibleCount, setVisibleCount] = useState(20);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [interrupted, setInterrupted] = useState(false);

  // Mic / voice transcription state
  const [micAvailable, setMicAvailable] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingStartRef = useRef<number>(0);
  const recordingIntentRef = useRef<boolean>(false);
  const MIN_RECORDING_MS = 500;
  const MAX_RECORDING_SECONDS = 60;

  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const [expandedBlocks, setExpandedBlocks] = useState<ContentBlock[] | null>(null);
  const [topicShift, setTopicShift] = useState<{ suggestedTopic: string; seedMessage: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const streamingBlocksRef = useRef<ContentBlock[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamingInsertIndexRef = useRef<number | null>(null);

  // Persist messages to localStorage — strip images, prune if needed, surface errors
  useEffect(() => {
    const stripped = stripImagesForStorage(messages);
    const json = JSON.stringify(stripped);
    // Check size before attempting to write
    if (json.length * 2 > LOCAL_STORAGE_MAX_BYTES) {
      const pruned = pruneToFit(messages, LOCAL_STORAGE_MAX_BYTES);
      const prunedJson = JSON.stringify(stripImagesForStorage(pruned));
      const dropped = messages.length - pruned.length;
      try {
        localStorage.setItem("mc-chat-messages", prunedJson);
        if (dropped > 0) {
          setStorageWarning(`Chat history too large — oldest ${dropped} message${dropped > 1 ? "s" : ""} pruned from local storage.`);
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
          setStorageWarning("Storage quota exceeded — chat history could not be saved locally. Messages are preserved on the server.");
        }
      }
    } else {
      try {
        localStorage.setItem("mc-chat-messages", json);
        setStorageWarning(null);
      } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") {
          // Try pruning as fallback
          const pruned = pruneToFit(messages, LOCAL_STORAGE_MAX_BYTES);
          try {
            localStorage.setItem("mc-chat-messages", JSON.stringify(stripImagesForStorage(pruned)));
            const dropped = messages.length - pruned.length;
            setStorageWarning(`Storage full — oldest ${dropped} message${dropped > 1 ? "s" : ""} pruned.`);
          } catch {
            setStorageWarning("Storage quota exceeded — chat history could not be saved locally.");
          }
        }
      }
    }
  }, [messages]);

  useEffect(() => {
    if (sessionId) localStorage.setItem("mc-chat-session", sessionId);
    else localStorage.removeItem("mc-chat-session");
  }, [sessionId]);

  // Check mic/transcription availability on mount
  useEffect(() => {
    let cancelled = false;
    async function checkMic() {
      // Check browser support
      if (!navigator.mediaDevices?.getUserMedia) return;
      try {
        const resp = await fetch("/api/chat/transcribe");
        if (!resp.ok) return;
        const data = await resp.json();
        if (!cancelled && data.available) setMicAvailable(true);
      } catch { /* server unavailable — mic stays hidden */ }
    }
    checkMic();
    return () => { cancelled = true; };
  }, []);

  // Cleanup recording resources on unmount
  useEffect(() => {
    return () => {
      recordingIntentRef.current = false;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        const stream = mediaRecorderRef.current.stream;
        mediaRecorderRef.current.stop();
        stream?.getTracks().forEach(t => t.stop());
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    };
  }, []);

  // Recording helpers
  const stopRecording = useCallback(() => {
    recordingIntentRef.current = false;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      // Enforce minimum recording duration to avoid empty/tiny blobs
      const elapsed = Date.now() - recordingStartRef.current;
      if (elapsed < MIN_RECORDING_MS) {
        // Delay stop so whisper gets enough audio
        setTimeout(() => {
          if (recorder.state !== "inactive") recorder.stop();
        }, MIN_RECORDING_MS - elapsed);
      } else {
        recorder.stop();
      }
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setRecording(false);
    setRecordingDuration(0);
  }, []);

  const transcribeAudio = useCallback(async (blob: Blob) => {
    setTranscribing(true);
    setMicError(null);
    try {
      const formData = new FormData();
      formData.append("audio", blob, "recording.webm");
      const resp = await fetch("/api/chat/transcribe", { method: "POST", body: formData });
      const data = await resp.json();
      if (!resp.ok) {
        setMicError(data.error || "Transcription failed");
        return;
      }
      const text = (data.text || "").trim();
      if (!text || text === "[BLANK_AUDIO]") {
        setMicError("No speech detected");
        return;
      }
      setDraft(prev => prev ? prev + " " + text : text);
      textareaRef.current?.focus();
    } catch {
      setMicError("Transcription request failed");
    } finally {
      setTranscribing(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    recordingIntentRef.current = true;
    setMicError(null);
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // If user released before getUserMedia resolved, abandon
      if (!recordingIntentRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "";

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch {
        // MediaRecorder constructor failure — release stream tracks
        stream.getTracks().forEach(t => t.stop());
        setMicError("Could not start recording");
        recordingIntentRef.current = false;
        return;
      }

      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream!.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        if (blob.size > 0) transcribeAudio(blob);
      };

      recorder.start(250); // collect chunks every 250ms
      mediaRecorderRef.current = recorder;
      recordingStartRef.current = Date.now();
      setRecording(true);
      setRecordingDuration(0);

      // Duration timer
      recordingTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartRef.current) / 1000);
        setRecordingDuration(elapsed);
        if (elapsed >= MAX_RECORDING_SECONDS) {
          stopRecording();
        }
      }, 500);
    } catch (err: unknown) {
      // Release stream tracks on any error path
      if (stream) stream.getTracks().forEach(t => t.stop());
      recordingIntentRef.current = false;
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission") || msg.includes("NotAllowed")) {
        setMicError("Mic permission denied");
        setMicAvailable(false); // hide for this session
      } else {
        setMicError("Could not access microphone");
      }
    }
  }, [transcribeAudio, stopRecording]);

  // Image processing helpers
  const processFile = useCallback((file: File) => {
    setImageError(null);
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      setImageError(`Unsupported file type: ${file.type}. Use PNG, JPEG, GIF, or WebP.`);
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setImageError(`Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 5MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const commaIdx = dataUrl.indexOf(",");
      const base64 = dataUrl.slice(commaIdx + 1);
      const mediaType = file.type;
      setPendingImages(prev => [...prev, { file, preview: dataUrl, base64, mediaType }]);
    };
    reader.readAsDataURL(file);
  }, []);

  const removeImage = useCallback((index: number) => {
    setPendingImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Drag-and-drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(f => {
      if (f.type.startsWith("image/")) processFile(f);
    });
  }, [processFile]);

  // Paste handler for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith("image/"));
    if (imageItems.length === 0) return; // let normal text paste through
    e.preventDefault();
    imageItems.forEach(item => {
      const file = item.getAsFile();
      if (file) processFile(file);
    });
  }, [processFile]);

  // WebSocket connection with auto-reconnect
  useEffect(() => {
    let didUnmount = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let isTabVisible = true;

    const getBackoffDelay = () => {
      const base = Math.min(1000 * Math.pow(2, reconnectAttempt), 30000);
      const jitter = Math.random() * base * 0.3; // up to 30% jitter
      return base + jitter;
    };

    const scheduleReconnect = () => {
      if (didUnmount || !isTabVisible) return;
      const delay = getBackoffDelay();
      reconnectAttempt++;
      setReconnecting(true);
      reconnectTimer = setTimeout(() => {
        if (!didUnmount && isTabVisible) connectWs();
      }, delay);
    };

    const connectWs = () => {
      if (didUnmount) return;
      const wsHost = window.location.hostname;
      const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${wsProto}://${wsHost}:4221`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (didUnmount) { ws.close(); return; }
        reconnectAttempt = 0;
        setConnected(true);
        setReconnecting(false);
        const sid = localStorage.getItem("mc-chat-session");
        ws.send(JSON.stringify({ type: "join", sessionId: sid }));
      };

      ws.onclose = () => {
        if (didUnmount) return;
        setConnected(false);
        setStreaming(false);
        wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror, so reconnect is handled there
      };

      ws.onmessage = (event) => {
        const d = JSON.parse(event.data);
        switch (d.type) {
          case "joined":
            setSessionId(d.sessionId);
            if (d.processing) setStreaming(true);
            // If server sent message history on reconnect, merge it
            if (d.resumed && d.history && Array.isArray(d.history) && d.history.length > 0) {
              setMessages(prev => {
                if (prev.length === 0) return d.history;
                if (d.history.length >= prev.length) return d.history;
                return prev;
              });
            }
            break;
          case "streaming":
            setStreaming(true);
            if (d.text) setStreamingText(d.text.replace(/<topic_shift\s+detected="true"\s+new_topic="[^"]+"\s*\/>/g, "").trimEnd());
            if (d.tools?.length) setStreamingTools(d.tools);
            if (d.blocks?.length) streamingBlocksRef.current = d.blocks;
            break;
          case "result": {
            setStreaming(false); setStreamingText(""); setStreamingTools([]);
            const finalBlocks = d.blocks?.length ? d.blocks : (streamingBlocksRef.current.length > 0 ? streamingBlocksRef.current : undefined);
            streamingBlocksRef.current = [];
            // Strip any topic_shift tags from displayed text
            const cleanText = (d.text || "").replace(/<topic_shift\s+detected="true"\s+new_topic="[^"]+"\s*\/>/g, "").trimEnd();
            if (cleanText) {
              const insertIdx = streamingInsertIndexRef.current;
              const newMsg: Message = { role: "assistant", content: cleanText, blocks: finalBlocks };
              if (insertIdx !== null) {
                setMessages(prev => [
                  ...prev.slice(0, insertIdx),
                  newMsg,
                  ...prev.slice(insertIdx),
                ]);
              } else {
                setMessages(prev => [...prev, newMsg]);
              }
            }
            streamingInsertIndexRef.current = null;
            break;
          }
          case "interrupted": {
            setStreaming(false); setStreamingText(""); setStreamingTools([]);
            setInterrupted(true);
            setTimeout(() => setInterrupted(false), 1500);
            const partial = d.partialText || "";
            if (partial) {
              const iIdx = streamingInsertIndexRef.current;
              if (iIdx !== null) {
                setMessages(prev => [
                  ...prev.slice(0, iIdx),
                  { role: "assistant", content: partial + "\n\n[interrupted]" },
                  ...prev.slice(iIdx),
                ]);
              } else {
                setMessages(prev => [...prev, { role: "assistant", content: partial + "\n\n[interrupted]" }]);
              }
            }
            streamingInsertIndexRef.current = null;
            break;
          }
          case "done": case "process_exit":
            setStreaming(false); setStreamingText(""); setStreamingTools([]);
            streamingInsertIndexRef.current = null;
            break;
          case "topic_shift":
            setTopicShift({ suggestedTopic: d.suggestedTopic, seedMessage: d.seedMessage || "" });
            break;
          case "error":
            setMessages(prev => [...prev, { role: "system", content: d.message, error: true }]);
            setStreaming(false);
            streamingInsertIndexRef.current = null;
            break;
        }
      };
    };

    // Visibility change: pause reconnect when hidden, resume when visible
    const handleVisibility = () => {
      isTabVisible = document.visibilityState === "visible";
      if (isTabVisible) {
        // Tab became visible — if disconnected and not already reconnecting, try now
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
          reconnectAttempt = 0;
          connectWs();
        }
      } else {
        // Tab hidden — cancel any pending reconnect to save resources
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    connectWs();

    return () => {
      didUnmount = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, []);

  // Consume injected context
  useEffect(() => {
    if (!pendingContext) return;
    setContext(pendingContext);
    onContextConsumed();
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [pendingContext, onContextConsumed]);

  // Track scroll position to detect when user is not at bottom
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 60;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    isAtBottomRef.current = atBottom;
    setIsAtBottom(atBottom);
  }, []);

  // Scroll to bottom helper
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  // Auto-scroll on new messages only when user is already at the bottom
  useEffect(() => {
    if (isAtBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    textareaRef.current?.focus();
  }, [messages, streamingText]);

  const send = useCallback(() => {
    const text = draft.trim();
    if ((!text && pendingImages.length === 0) || !wsRef.current || !connected) return;

    if (text === "/clear") {
      wsRef.current.send(JSON.stringify({ type: "new_chat" }));
      setMessages([]);
      setSessionId(null);
      setVisibleCount(20);
      setDraft("");
      setContext(null);
      setPendingImages([]);
      setImageError(null);
      setStorageWarning(null);
      setTopicShift(null);
      streamingInsertIndexRef.current = null;
      return;
    }

    let content = text || "(see attached image)";
    if (context) {
      content = `[Context: ${context}]\n\n${content}`;
      setContext(null);
    }

    // Build user message with image previews for display
    const imagePreviews = pendingImages.map(img => img.preview);
    setMessages(prev => {
      const next = [...prev, {
        role: "user" as const,
        content: text || "(image)",
        images: imagePreviews.length > 0 ? imagePreviews : undefined,
      }];
      // Track where the streaming assistant response should be inserted.
      // Only set on the FIRST send that starts streaming — subsequent sends
      // during the same streaming session must NOT overwrite the index,
      // otherwise messages sent during streaming appear in the wrong order.
      if (streamingInsertIndexRef.current === null) {
        streamingInsertIndexRef.current = next.length;
      }
      return next;
    });

    // Send via WS with image data
    const wsMsg: Record<string, unknown> = { type: "chat", content };
    if (pendingImages.length > 0) {
      wsMsg.images = pendingImages.map(img => ({
        base64: img.base64,
        mediaType: img.mediaType,
      }));
    }
    wsRef.current.send(JSON.stringify(wsMsg));

    setDraft("");
    setPendingImages([]);
    setImageError(null);
    setStreaming(true);
  }, [draft, context, connected, pendingImages, streaming]);

  const stopResponse = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "stop" }));
    setStreaming(false); setStreamingText(""); setStreamingTools([]);
  }, []);

  const interruptResponse = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: "interrupt", partialText: streamingText }));
  }, [streamingText]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const clearContext = () => setContext(null);

  const startNewChatFromTopicShift = useCallback(() => {
    if (!topicShift || !wsRef.current || !connected) return;
    const seed = topicShift.seedMessage;
    wsRef.current.send(JSON.stringify({ type: "new_chat", seedMessage: seed }));
    setMessages(seed ? [{ role: "user", content: seed }] : []);
    setSessionId(null);
    setVisibleCount(20);
    setTopicShift(null);
    setStorageWarning(null);
    setStreaming(!!seed); // will be streaming if seed message was sent
    streamingInsertIndexRef.current = seed ? 1 : null;
  }, [topicShift, connected]);

  const resumeChat = useCallback((chatId: string) => {
    if (!wsRef.current || !connected) return;
    wsRef.current.send(JSON.stringify({ type: "resume_chat", sessionId: chatId }));
    setMessages([]);
    setSessionId(chatId);
    setVisibleCount(20);
    setStorageWarning(null);
    streamingInsertIndexRef.current = null;
  }, [connected]);

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
          color: connected ? accent : reconnecting ? "#fbbf24" : "#52525b",
          textTransform: "uppercase",
        }}>
          CHAT
        </span>
      </div>
    );
  }

  // Open state
  return (
    <div
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        width: 380,
        flexShrink: 0,
        borderLeft: dragOver ? "2px solid #818cf8" : "1px solid #27272a",
        background: dragOver ? "#0c0c1a" : "#0c0c0e",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        transition: "width 0.2s ease, background 0.15s, border-color 0.15s",
        position: "relative",
      }}>
      {/* Drop overlay */}
      {dragOver && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 10,
          background: "rgba(99, 102, 241, 0.08)",
          border: "2px dashed #818cf8", borderRadius: 8,
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <span style={{ color: "#818cf8", fontSize: 14, fontWeight: 600 }}>Drop images here</span>
        </div>
      )}
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
            background: connected ? "#1a2a1a" : reconnecting ? "#2a2a1a" : "#2a1a1a",
            color: connected ? accent : reconnecting ? "#fbbf24" : "#f87171",
            fontWeight: 600,
          }}>{connected ? "connected" : reconnecting ? "reconnecting…" : "offline"}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setHistoryOpen(o => !o)}
            title="Chat history"
            style={{
              background: historyOpen ? "#27272a" : "none", border: "none",
              color: historyOpen ? accent : "#52525b", cursor: "pointer",
              fontSize: 11, padding: "2px 6px", borderRadius: 3, fontFamily: "inherit",
              transition: "color 0.15s, background 0.15s",
            }}
            onMouseEnter={e => { if (!historyOpen) e.currentTarget.style.color = "#a1a1aa"; }}
            onMouseLeave={e => { if (!historyOpen) e.currentTarget.style.color = "#52525b"; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </button>
          {messages.length > 0 && (
            <button
              onClick={() => { setMessages([]); setStorageWarning(null); wsRef.current?.send(JSON.stringify({ type: "new_chat" })); }}
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

      {/* Storage warning banner */}
      {storageWarning && (
        <div style={{
          margin: "0", padding: "6px 14px", flexShrink: 0,
          background: "#2a2a1a", borderBottom: "1px solid #854d0e",
          fontSize: 11, color: "#fbbf24", display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{ flex: 1 }}>{storageWarning}</span>
          <button
            onClick={() => setStorageWarning(null)}
            style={{ background: "none", border: "none", color: "#854d0e", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}
          >×</button>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div ref={scrollContainerRef} onScroll={handleScroll} style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
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

          const truncate = (text: string, maxLines: number) => {
            const lines = text.split("\n");
            if (lines.length <= maxLines) return text;
            return lines.slice(0, maxLines).join("\n") + "…";
          };

          const renderMsg = (msg: Message, i: number) => {
            const hasBlocks = msg.role === "assistant" && msg.blocks && msg.blocks.length > 0;
            const isCompact = hasBlocks;

            return (
            <div key={`msg-${i}`} style={{
              display: "flex", flexDirection: "column",
              alignItems: msg.role === "user" ? "flex-end" : "flex-start",
            }}>
              {msg.role === "system" ? (
                <div style={{ fontSize: 11, color: "#52525b", textAlign: "center", width: "100%", padding: "4px 0" }}>
                  {msg.content}
                </div>
              ) : (
                <div
                  onClick={hasBlocks ? () => setExpandedBlocks(msg.blocks!) : undefined}
                  style={{
                    maxWidth: "92%", padding: "8px 11px",
                    borderRadius: msg.role === "user" ? "10px 10px 3px 10px" : "10px 10px 10px 3px",
                    background: msg.role === "user" ? "#1d3a2a" : "#18181b",
                    border: msg.error ? "1px solid #7c2d12"
                      : msg.role === "user" ? `1px solid ${accent}` : "1px solid #27272a",
                    fontSize: 13, color: msg.error ? "#f87171" : msg.role === "user" ? "#bbf7d0" : "#d4d4d8",
                    lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word",
                    cursor: hasBlocks ? "pointer" : undefined,
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={hasBlocks ? e => { e.currentTarget.style.borderColor = "#52525b"; e.currentTarget.style.background = "#1f1f23"; } : undefined}
                  onMouseLeave={hasBlocks ? e => { e.currentTarget.style.borderColor = "#27272a"; e.currentTarget.style.background = "#18181b"; } : undefined}
                >
                  {msg.images && msg.images.length > 0 && msg.images[0] !== "[image]" && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                      {msg.images.map((src, imgIdx) => (
                        src !== "[image]" ? (
                          <img key={imgIdx} src={src} alt="" style={{
                            width: 64, height: 64, objectFit: "cover", borderRadius: 4,
                            border: "1px solid #27272a",
                          }} />
                        ) : (
                          <span key={imgIdx} style={{
                            width: 64, height: 64, display: "flex", alignItems: "center", justifyContent: "center",
                            borderRadius: 4, border: "1px solid #27272a", background: "#27272a",
                            fontSize: 10, color: "#71717a",
                          }}>image</span>
                        )
                      ))}
                    </div>
                  )}
                  {isCompact ? truncate(msg.content, 3) : msg.content}
                  {hasBlocks && (
                    <div style={{
                      marginTop: 6, fontSize: 11, color: "#6366f1",
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <span>▸ {msg.blocks!.length} step{msg.blocks!.length !== 1 ? "s" : ""} · click to expand</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )};


          const streamingBlock = streaming ? (
            <div key="streaming" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
              <div style={{
                  maxWidth: "92%", padding: "8px 11px",
                  borderRadius: "10px 10px 10px 3px",
                  background: "#18181b", border: "1px solid #27272a",
                  fontSize: 13, color: "#d4d4d8", lineHeight: 1.55,
                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                  transition: "border-color 0.15s",
                  position: "relative" as const,
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
                <div style={{ paddingRight: 60 }}>
                  {streamingText || <span style={{ color: "#52525b", animation: "pulse 1.5s infinite" }}>
                    {streamingTools.length > 0 ? "working..." : "thinking..."}
                  </span>}
                </div>
                <button
                  onClick={interrupted ? undefined : interruptResponse}
                  style={{
                    position: "absolute" as const,
                    top: 6, right: 6,
                    background: interrupted ? "#7c2d12" : "rgba(39,39,42,0.8)",
                    border: `1px solid ${interrupted ? "#7c2d12" : "#3f3f46"}`,
                    color: interrupted ? "#fef2f2" : "#f87171",
                    cursor: interrupted ? "default" : "pointer",
                    fontSize: 9, padding: "2px 6px", borderRadius: 3, fontFamily: "inherit",
                    transition: "all 0.3s ease",
                    opacity: interrupted ? 0.7 : 1,
                    zIndex: 1,
                  }}
                >{interrupted ? "interrupted" : "interrupt"}</button>
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

      {/* Scroll-to-bottom floating button */}
      <button
        onClick={() => scrollToBottom("smooth")}
        aria-label="Scroll to bottom"
        style={{
          position: "absolute",
          bottom: 16,
          right: 16,
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: "#27272a",
          border: "1px solid #3f3f46",
          color: "#a1a1aa",
          fontSize: 14,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
          opacity: isAtBottom ? 0 : 1,
          transform: isAtBottom ? "translateY(8px)" : "translateY(0)",
          pointerEvents: isAtBottom ? "none" : "auto",
          transition: "opacity 0.2s ease, transform 0.2s ease, background 0.15s, color 0.15s",
          zIndex: 5,
          padding: 0,
          lineHeight: 1,
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "#3f3f46"; e.currentTarget.style.color = "#e4e4e7"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "#27272a"; e.currentTarget.style.color = "#a1a1aa"; }}
      >↓</button>
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
            {context.slice(0, 80)}{context.length > 80 ? "..." : ""}
          </span>
          <button onClick={clearContext} style={{ background: "none", border: "none", color: "#52525b", cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0, flexShrink: 0 }}>x</button>
        </div>
      )}

      {/* Image preview strip */}
      {pendingImages.length > 0 && (
        <div style={{
          margin: "0 10px", padding: "6px 8px", flexShrink: 0,
          display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
          background: "#18181b", borderRadius: 6, border: "1px solid #27272a",
        }}>
          {pendingImages.map((img, idx) => (
            <div key={idx} style={{ position: "relative", width: 48, height: 48 }}>
              <img src={img.preview} alt="" style={{
                width: 48, height: 48, objectFit: "cover", borderRadius: 4,
                border: "1px solid #3f3f46",
              }} />
              <button
                onClick={() => removeImage(idx)}
                style={{
                  position: "absolute", top: -4, right: -4,
                  width: 16, height: 16, borderRadius: "50%",
                  background: "#ef4444", border: "none", color: "#fff",
                  fontSize: 10, lineHeight: 1, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: 0,
                }}
              >x</button>
            </div>
          ))}
          <span style={{ fontSize: 10, color: "#71717a" }}>
            {pendingImages.length} image{pendingImages.length > 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Image error */}
      {imageError && (
        <div style={{
          margin: "0 10px", padding: "4px 10px", borderRadius: 4,
          background: "#2a1a1a", border: "1px solid #7c2d12",
          fontSize: 11, color: "#f87171", flexShrink: 0,
        }}>
          {imageError}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        style={{ display: "none" }}
        onChange={e => {
          const files = Array.from(e.target.files || []);
          files.forEach(f => processFile(f));
          e.target.value = "";
        }}
      />

      {/* Recording indicator */}
      {recording && (
        <div style={{
          margin: "0 10px", padding: "6px 10px", borderRadius: 4,
          background: "#1a1a2a", border: "1px solid #4c1d95",
          fontSize: 12, color: "#c4b5fd", flexShrink: 0,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <span style={{
            display: "inline-block", width: 8, height: 8, borderRadius: "50%",
            background: "#ef4444",
            animation: "mic-pulse 1s ease-in-out infinite",
          }} />
          <span>Recording... {recordingDuration}s / {MAX_RECORDING_SECONDS}s</span>
          <button
            onClick={stopRecording}
            style={{
              marginLeft: "auto", background: "none", border: "1px solid #7c3aed",
              borderRadius: 4, color: "#c4b5fd", fontSize: 11, padding: "1px 8px",
              cursor: "pointer", fontFamily: "inherit",
            }}
          >stop</button>
        </div>
      )}

      {/* Transcribing indicator */}
      {transcribing && (
        <div style={{
          margin: "0 10px", padding: "4px 10px", borderRadius: 4,
          background: "#1a1a2a", border: "1px solid #4c1d95",
          fontSize: 11, color: "#a78bfa", flexShrink: 0,
        }}>
          Transcribing audio...
        </div>
      )}

      {/* Mic error */}
      {micError && (
        <div style={{
          margin: "0 10px", padding: "4px 10px", borderRadius: 4,
          background: "#2a1a1a", border: "1px solid #7c2d12",
          fontSize: 11, color: "#f87171", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span>{micError}</span>
          <button
            onClick={() => setMicError(null)}
            style={{ background: "none", border: "none", color: "#f87171", cursor: "pointer", fontSize: 11 }}
          >dismiss</button>
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
          onPaste={handlePaste}
          placeholder={`Message ${agentName}...`}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: "#3f3f46" }}>Shift+Enter to send</span>
          <div style={{ display: "flex", gap: 4 }}>
            {micAvailable && (
              <button
                onMouseDown={!recording && !transcribing ? startRecording : undefined}
                onMouseUp={recording ? stopRecording : undefined}
                onMouseLeave={recording ? stopRecording : undefined}
                onTouchStart={!recording && !transcribing ? startRecording : undefined}
                onTouchEnd={recording ? stopRecording : undefined}
                onTouchCancel={recording ? stopRecording : undefined}
                disabled={transcribing}
                style={{
                  background: recording ? "#7c3aed" : "none",
                  border: `1px solid ${recording ? "#7c3aed" : "#3f3f46"}`,
                  borderRadius: 4,
                  color: recording ? "#fff" : transcribing ? "#52525b" : "#71717a",
                  fontSize: 11, padding: "4px 6px", cursor: transcribing ? "wait" : "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}
                aria-label={recording ? "Release to stop recording" : transcribing ? "Transcribing audio" : "Hold to record"}
                title={recording ? "Release to stop" : transcribing ? "Transcribing..." : "Hold to record"}
              >{recording ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#ef4444" stroke="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="7">
                    <animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite" />
                  </circle>
                </svg>
              ) : transcribing ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="6" cy="12" r="2"><animate attributeName="opacity" values="1;0.3;1" dur="0.8s" repeatCount="indefinite" begin="0s" /></circle>
                  <circle cx="12" cy="12" r="2"><animate attributeName="opacity" values="1;0.3;1" dur="0.8s" repeatCount="indefinite" begin="0.2s" /></circle>
                  <circle cx="18" cy="12" r="2"><animate attributeName="opacity" values="1;0.3;1" dur="0.8s" repeatCount="indefinite" begin="0.4s" /></circle>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                  <rect x="9" y="1" width="6" height="11" rx="3" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}</button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: "none", border: "1px solid #3f3f46", borderRadius: 4,
                color: "#71717a", fontSize: 11, padding: "4px 6px", cursor: "pointer",
                fontFamily: "inherit",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
              }}
              aria-label="Attach image"
              title="Attach image"
            ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg></button>
          </div>
        </div>
      </div>

      {/* Chat history sidebar (overlay within chat panel) */}
      <ChatHistorySidebar
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onResumeChat={resumeChat}
        currentSessionId={sessionId}
      />

      {/* Agent message expansion modal */}
      {expandedBlocks && (
        <AgentMessageModal blocks={expandedBlocks} onClose={() => setExpandedBlocks(null)} />
      )}
    </div>
  );
}
