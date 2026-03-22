"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface GitStatus {
  branch: string;
  dirty: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  headSha?: string;
}

interface GitCommit {
  graph: string;
  sha: string;
  message: string;
}

interface Props {
  wsUrl?: string;
  repoPath?: string;
  accent?: string;
}

const CHAT_WS_PORT = 4221;

export function GitPanel({ wsUrl, repoPath, accent = "#00E5CC" }: Props) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("mc-git-panel-collapsed") !== "false"; } catch { return true; }
  });
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"files" | "log">("files");
  const [configuredRepo, setConfiguredRepo] = useState<string>(
    () => {
      try { return localStorage.getItem("mc-git-panel-repo") || repoPath || ""; }
      catch { return repoPath || ""; }
    }
  );
  const wsRef = useRef<WebSocket | null>(null);

  const currentRepo = configuredRepo || repoPath || "";

  useEffect(() => {
    try { localStorage.setItem("mc-git-panel-collapsed", String(collapsed)); } catch {}
  }, [collapsed]);

  useEffect(() => {
    try { localStorage.setItem("mc-git-panel-repo", configuredRepo); } catch {}
  }, [configuredRepo]);

  const baseUrl = `http://127.0.0.1:${CHAT_WS_PORT}`;

  const fetchStatus = useCallback(async () => {
    if (!currentRepo) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/git/status?repo=${encodeURIComponent(currentRepo)}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to fetch status"); return; }
      setStatus(data);
    } catch {
      setError("Cannot connect to mc-web-chat server");
    } finally {
      setLoading(false);
    }
  }, [currentRepo, baseUrl]);

  const fetchLog = useCallback(async () => {
    if (!currentRepo) return;
    try {
      const res = await fetch(`${baseUrl}/git/log?repo=${encodeURIComponent(currentRepo)}&limit=15`);
      const data = await res.json();
      if (res.ok) setCommits(data.commits || []);
    } catch { /* silent */ }
  }, [currentRepo, baseUrl]);

  const refresh = useCallback(async () => {
    await Promise.all([fetchStatus(), fetchLog()]);
  }, [fetchStatus, fetchLog]);

  // Subscribe to WS git_status updates
  useEffect(() => {
    if (!currentRepo || collapsed) return;

    const wsTarget = wsUrl || `ws://127.0.0.1:${CHAT_WS_PORT}`;
    const ws = new WebSocket(wsTarget);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join" }));
      ws.send(JSON.stringify({ type: "git_subscribe", repo: currentRepo }));
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === "git_status") {
          setStatus(data);
        }
      } catch {}
    };

    ws.onerror = () => {};
    ws.onclose = () => { wsRef.current = null; };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "git_unsubscribe" }));
      }
      ws.close();
      wsRef.current = null;
    };
  }, [currentRepo, collapsed, wsUrl]);

  // Initial fetch
  useEffect(() => {
    if (!collapsed && currentRepo) {
      refresh();
    }
  }, [collapsed, currentRepo, refresh]);

  const dirtyCount = status ? status.staged.length + status.unstaged.length + status.untracked.length : 0;

  return (
    <div style={{
      borderBottom: "1px solid #27272a",
      background: "#0a0a0a",
      fontSize: 12,
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
    }}>
      {/* Header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "6px 12px", cursor: "pointer",
          borderBottom: collapsed ? "none" : "1px solid #1a1a1a",
          userSelect: "none",
        }}
      >
        <span style={{ color: "#52525b", fontSize: 10, transition: "transform 0.2s", transform: collapsed ? "rotate(-90deg)" : "rotate(0)" }}>▼</span>
        <span style={{ color: "#71717a", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>GIT</span>
        {status && (
          <>
            <span style={{ color: accent, fontWeight: 600, fontSize: 11 }}>{status.branch}</span>
            <span style={{
              fontSize: 9, padding: "1px 5px", borderRadius: 3,
              background: status.dirty ? "#2a1a1a" : "#1a2a1a",
              color: status.dirty ? "#f87171" : "#4ade80",
              fontWeight: 700,
            }}>
              {status.dirty ? `${dirtyCount} changed` : "clean"}
            </span>
          </>
        )}
        {!status && !loading && currentRepo && (
          <span style={{ color: "#52525b", fontSize: 10 }}>no connection</span>
        )}
        {loading && <span style={{ color: "#52525b", fontSize: 10 }}>loading...</span>}
      </div>

      {/* Expanded panel */}
      {!collapsed && (
        <div style={{ padding: "0 12px 8px" }}>
          {/* Repo path input */}
          <div style={{ display: "flex", gap: 4, alignItems: "center", marginBottom: 6, marginTop: 4 }}>
            <input
              type="text"
              value={configuredRepo}
              onChange={e => setConfiguredRepo(e.target.value)}
              placeholder="~/path/to/repo"
              style={{
                flex: 1, background: "#18181b", border: "1px solid #27272a",
                borderRadius: 4, padding: "3px 6px", color: "#a1a1aa",
                fontSize: 11, fontFamily: "inherit", outline: "none",
              }}
              onFocus={e => e.target.style.borderColor = accent}
              onBlur={e => e.target.style.borderColor = "#27272a"}
              onKeyDown={e => { if (e.key === "Enter") refresh(); }}
            />
            <button
              onClick={refresh}
              title="Refresh git status"
              style={{
                background: "#18181b", border: "1px solid #27272a",
                borderRadius: 4, padding: "3px 8px", color: "#71717a",
                cursor: "pointer", fontSize: 11, fontFamily: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#27272a"; e.currentTarget.style.color = "#71717a"; }}
            >&#8635;</button>
          </div>

          {error && (
            <div style={{ color: "#f87171", fontSize: 11, padding: "4px 0" }}>{error}</div>
          )}

          {/* Tab bar */}
          <div style={{ display: "flex", gap: 0, marginBottom: 6 }}>
            {(["files", "log"] as const).map(t => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                style={{
                  background: activeTab === t ? "#1a1a1a" : "transparent",
                  border: "1px solid #27272a",
                  borderBottom: activeTab === t ? "1px solid #1a1a1a" : "1px solid #27272a",
                  borderRadius: t === "files" ? "4px 0 0 0" : "0 4px 0 0",
                  padding: "3px 12px", color: activeTab === t ? accent : "#52525b",
                  cursor: "pointer", fontSize: 10, fontFamily: "inherit",
                  fontWeight: activeTab === t ? 600 : 400,
                  textTransform: "uppercase", letterSpacing: "0.04em",
                }}
              >{t}</button>
            ))}
          </div>

          {/* Files tab */}
          {activeTab === "files" && status && (
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {status.staged.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ color: "#4ade80", fontSize: 10, fontWeight: 600, marginBottom: 2 }}>STAGED ({status.staged.length})</div>
                  {status.staged.map((f, i) => (
                    <div key={`s-${i}`} style={{ color: "#86efac", fontSize: 11, padding: "1px 0 1px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f}
                    </div>
                  ))}
                </div>
              )}
              {status.unstaged.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ color: "#fbbf24", fontSize: 10, fontWeight: 600, marginBottom: 2 }}>MODIFIED ({status.unstaged.length})</div>
                  {status.unstaged.map((f, i) => (
                    <div key={`u-${i}`} style={{ color: "#fcd34d", fontSize: 11, padding: "1px 0 1px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f}
                    </div>
                  ))}
                </div>
              )}
              {status.untracked.length > 0 && (
                <div style={{ marginBottom: 4 }}>
                  <div style={{ color: "#71717a", fontSize: 10, fontWeight: 600, marginBottom: 2 }}>UNTRACKED ({status.untracked.length})</div>
                  {status.untracked.map((f, i) => (
                    <div key={`t-${i}`} style={{ color: "#a1a1aa", fontSize: 11, padding: "1px 0 1px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {f}
                    </div>
                  ))}
                </div>
              )}
              {dirtyCount === 0 && (
                <div style={{ color: "#4ade80", fontSize: 11, padding: "4px 0", textAlign: "center" }}>
                  Working tree clean
                </div>
              )}
            </div>
          )}

          {/* Log tab */}
          {activeTab === "log" && (
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {commits.length === 0 && (
                <div style={{ color: "#52525b", fontSize: 11, textAlign: "center", padding: "8px 0" }}>No commits</div>
              )}
              {commits.map((c, i) => (
                <div key={i} style={{
                  display: "flex", gap: 6, padding: "2px 0",
                  fontSize: 11, lineHeight: 1.4,
                }}>
                  <span style={{ color: "#6366f1", flexShrink: 0, whiteSpace: "pre", fontFamily: "inherit" }}>{c.graph}</span>
                  {c.sha && <span style={{ color: "#d97706", flexShrink: 0 }}>{c.sha.slice(0, 7)}</span>}
                  <span style={{ color: "#d4d4d8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
