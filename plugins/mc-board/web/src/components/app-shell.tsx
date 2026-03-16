"use client";
import { useState, useCallback, useEffect } from "react";
import { Board } from "./board";
import { MemoryTab } from "./memory-tab";
import { RolodexTab } from "./rolodex-tab";
import { SettingsPage } from "./settings-page";
import { Modal } from "./modal";
import { ChatPanel } from "./chat-panel";
import { WelcomeWizard, useWelcomeWizard } from "./welcome-wizard";
import { Project, BoardCard } from "@/lib/types";

import useSWR from "swr";

type Tab = "board" | "memory" | "rolodex" | "settings";
interface Toast { id: number; icon: string; title: string; sub?: string; exiting?: boolean; }
interface Counts { backlog: number; inProgress: number; inReview: number; shipped: number; }

const fetcher = (url: string) => fetch(url).then(r => r.json());

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function DailyStats() {
  const { data } = useSWR<{
    total_runs: number; total_tokens: number; total_cost_usd: number;
    subscription_cost_usd: number; plan: string; multiplier: number;
  }>("/api/stats/runs", fetcher, { refreshInterval: 30000 });

  if (!data || data.total_runs === 0) return null;

  return (
    <>
      <span className="stat-pill" title={`${data.total_tokens.toLocaleString()} tokens today`}>
        tokens<b>{fmtK(data.total_tokens)}</b>
      </span>
      {/* cost pill hidden for now */}
    </>
  );
}

const TAB_PATHS: Record<Tab, string> = { board: "/board", memory: "/memory", rolodex: "/rolodex", settings: "/settings" };

function getNotifsEnabled(): boolean {
  try { return localStorage.getItem("brain-toasts") !== "false"; } catch { return true; }
}

function getInitialProject(): string {
  if (typeof window === "undefined") return "";
  // Support legacy ?project= query param (will be redirected server-side on full load,
  // but handle client-side in case of soft navigation)
  return new URLSearchParams(window.location.search).get("project") ?? "";
}

function getChatOpen(): boolean {
  try { return localStorage.getItem("mc-board:chat-open") === "true"; } catch { return false; }
}

export function AppShell({ initialTab, initialCardId, initialProjectId }: { initialTab?: Tab; initialCardId?: string; initialProjectId?: string }) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "board");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifsEnabled, setNotifsEnabled] = useState(getNotifsEnabled);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allCards, setAllCards] = useState<BoardCard[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>(initialProjectId ?? getInitialProject);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [pendingContext, setPendingContext] = useState<string | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(initialCardId ?? null);
  const { showWelcome, dismissWelcome } = useWelcomeWizard();
  const [assistantName, setAssistantName] = useState("Am");
  const { data: rolodexCount } = useSWR<{ count: number }>("/api/rolodex/count", fetcher, { refreshInterval: 60000 });
  const { data: memoryStats } = useSWR<{ memoryFiles: number; kbEntries: number; total: number }>("/api/memory/stats", fetcher, { refreshInterval: 60000 });

  // Fetch assistant name for empty-state message
  useEffect(() => {
    fetch("/api/assistant-name").then(r => r.json()).then(d => {
      if (d.shortName) setAssistantName(d.shortName);
    }).catch(() => {});
  }, []);

  const showEmptyState = !showWelcome && counts !== null && allCards.length === 0 && tab === "board";

  const showToast = useCallback((icon: string, title: string, sub?: string) => {
    const id = Date.now();
    setToasts(t => [...t, { id, icon, title, sub }]);
    setTimeout(() => {
      setToasts(t => t.map(x => x.id === id ? { ...x, exiting: true } : x));
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 220);
    }, 4800);
  }, []);

  // Rehydrate chatOpen from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    setChatOpen(getChatOpen());
  }, []);

  const toggleChat = useCallback(() => {
    setChatOpen(on => {
      const next = !on;
      try { localStorage.setItem("mc-board:chat-open", next ? "true" : "false"); } catch {}
      return next;
    });
  }, []);

  const handleInjectContext = useCallback((ctx: string) => {
    setPendingContext(ctx);
    setChatOpen(true);
    try { localStorage.setItem("mc-board:chat-open", "true"); } catch {}
  }, []);

  const toggleNotifs = () => {
    setNotifsEnabled(on => {
      const next = !on;
      try { localStorage.setItem("brain-toasts", next ? "true" : "false"); } catch {}
      return next;
    });
  };

  // Project filter with URL sync — uses /board/project/:id clean route
  const setProject = useCallback((p: string) => {
    setSelectedProject(p);
    history.pushState(null, "", p ? `/board/project/${encodeURIComponent(p)}` : "/board");
  }, []);

  // Handle browser back/forward — sync React state with URL
  useEffect(() => {
    const onPopState = () => {
      const match = window.location.pathname.match(/^\/board\/project\/([^/]+)/);
      setSelectedProject(match ? decodeURIComponent(match[1]) : "");
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleBoardData = useCallback((ps: Project[], c: Counts, cards: BoardCard[]) => {
    setProjects(ps);
    setCounts(c);
    setAllCards(cards);
  }, []);

  const switchTab = (t: Tab) => {
    setTab(t);
    try { history.pushState(null, "", TAB_PATHS[t]); } catch {}
  };

  return (
    <div className="app-body">
      {/* Top bar */}
      <div className="top-bar">
        {/* Left: brand + tabs */}
        <div className="flex items-stretch">
          <div className="brand">MiniClaw Brain</div>
          <div className="tab-bar">
            {(["board", "memory", "rolodex", "settings"] as Tab[]).map(t => {
              const activeCount = t === "board" && counts ? counts.inProgress : 0;
              const memoryCount = t === "memory" && memoryStats ? memoryStats.total : 0;
              const badgeCount = t === "rolodex" && rolodexCount ? rolodexCount.count : t === "memory" ? memoryCount : activeCount;
              return (
                <button key={t} onClick={() => switchTab(t)}
                  className={`tab-btn${tab === t ? " active" : ""}`}
                  style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {t === "board" ? "Board" : t === "memory" ? "Memory" : t === "rolodex" ? "Contacts" : "Settings"}
                  {badgeCount > 0 && (
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      background: "#52525b",
                      color: "#fafafa",
                      borderRadius: 10,
                      padding: "1px 6px",
                      lineHeight: "14px",
                    }}>{badgeCount}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Center: project button (board only) */}
        <div className="flex flex-1 items-center justify-center px-4" data-tour="projects">
          {tab === "board" && projects.length > 0 && (() => {
            const proj = selectedProject ? projects.find(p => p.id === selectedProject) : null;
            const pCards = proj ? allCards.filter(c => c.project_id === proj.id) : [];
            const colColors: Record<string, string> = { backlog: "#7c3aed", "in-progress": "#3b82f6", "in-review": "#f59e0b", shipped: "#22c55e" };
            const countPills = (["in-progress", "in-review", "backlog", "shipped"] as const)
              .map(col => ({ col, n: pCards.filter(c => c.column === col).length }))
              .filter(x => x.n > 0);
            return (
              <button
                onClick={() => setProjectsOpen(true)}
                style={{
                  background: proj ? "#27272a" : "transparent",
                  border: "1px solid #3f3f46",
                  borderRadius: 6,
                  padding: proj ? "6px 12px" : "4px 12px",
                  color: proj ? "#e4e4e7" : "#a1a1aa",
                  fontSize: 13,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: proj ? "column" : "row",
                  alignItems: proj ? "flex-start" : "center",
                  gap: proj ? 4 : 6,
                  maxWidth: 320,
                  minWidth: 0,
                }}
              >
                {/* Row 1: icon + name + clear */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                  <span style={{ fontSize: 11, opacity: 0.6, flexShrink: 0 }}>◈</span>
                  <span style={{
                    fontWeight: proj ? 600 : 400,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    minWidth: 0,
                  }}>
                    {proj ? proj.name : "Projects"}
                  </span>
                  {proj && (
                    <span
                      onClick={e => { e.stopPropagation(); setProject(""); }}
                      style={{ marginLeft: 2, opacity: 0.5, fontSize: 12, lineHeight: 1, flexShrink: 0 }}
                      title="Clear filter"
                    >✕</span>
                  )}
                </div>
                {/* Row 2: card count pills (only when project selected) */}
                {proj && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 17 }}>
                    {countPills.length === 0 ? (
                      <span style={{ fontSize: 11, color: "#52525b" }}>0 cards</span>
                    ) : countPills.map(({ col, n }) => (
                      <span key={col} style={{
                        fontSize: 11,
                        color: colColors[col] ?? "#52525b",
                        background: (colColors[col] ?? "#52525b") + "22",
                        borderRadius: 4,
                        padding: "1px 5px",
                        fontWeight: 500,
                      }}>
                        {col} <b style={{ fontWeight: 700 }}>{n}</b>
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })()}
        </div>

        {/* Right: stat pills */}
        {counts && (
          <div className="stat-pills">
            <span className="stat-pill">projects<b>{projects.length}</b></span>
            <span className="stat-pill">backlog<b>{counts.backlog}</b></span>
            <span className="stat-pill">in&nbsp;progress<b>{counts.inProgress}</b></span>
            <span className="stat-pill">in&nbsp;review<b>{counts.inReview}</b></span>
            <span className="stat-pill">shipped<b>{counts.shipped}</b></span>
            <DailyStats />
            {memoryStats && (
              <span className="stat-pill" title={`${memoryStats.memoryFiles} memory files, ${memoryStats.kbEntries} KB entries`}>
                memory<b>{memoryStats.memoryFiles}&thinsp;/&thinsp;{memoryStats.kbEntries}</b>
              </span>
            )}
          </div>
        )}

        {/* Chat toggle — disabled until chat daemon is ready */}

        {/* Far right: alerts icon */}
        <button
          onClick={toggleNotifs}
          className="flex items-center justify-center w-11 border-l border-zinc-800 shrink-0 hover:bg-zinc-900 transition-colors h-full"
          title={notifsEnabled ? "Alerts on — click to mute" : "Alerts muted — click to enable"}
        >
          <svg width="18" height="18" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"
            style={{ opacity: notifsEnabled ? 1 : 0.35 }}>
            <path d="M24 18L20 10V6C20 2.686 17.314 0 14 0C10.686 0 8 2.686 8 6V10L4 18H11.184C11.597 19.163 12.695 20 14 20C15.305 20 16.403 19.163 16.816 18H24Z"
              fill="currentColor" />
          </svg>
        </button>
      </div>

      {/* Main content + Chat panel flex row */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
        {/* Tab panels */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className={`tab-panel${tab === "board" ? " active" : ""}`}>
            <Board
              selectedProject={selectedProject}
              initialCardId={initialCardId}
              onToast={showToast}
              notifsEnabled={notifsEnabled}
              onBoardData={handleBoardData}
              onInjectContext={handleInjectContext}
              onCardOpen={setOpenCardId}
            />
          </div>
          <div className={`tab-panel${tab === "memory" ? " active" : ""}`}>
            <MemoryTab />
          </div>
          <div className={`tab-panel${tab === "rolodex" ? " active" : ""}`}>
            <RolodexTab />
          </div>
          <div className={`tab-panel${tab === "settings" ? " active" : ""}`}>
            <SettingsPage />
          </div>
        </div>

        {/* Chat panel — disabled until chat daemon is ready (next release) */}
      </div>

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast${t.exiting ? " toast-out" : ""}`}>
            <span className="toast-icon">{t.icon}</span>
            <div>
              <div className="toast-title">{t.title}</div>
              {t.sub && <div className="toast-sub">{t.sub}</div>}
            </div>
          </div>
        ))}
      </div>

      {/* Projects modal */}
      {/* Welcome wizard */}
      {showWelcome && <WelcomeWizard onDone={dismissWelcome} />}

      {/* Empty board — no prompt, board just shows empty columns */}

      {projectsOpen && (
        <Modal onClose={() => setProjectsOpen(false)}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #27272a" }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#e4e4e7" }}>Projects</span>
            <button onClick={() => setProjectsOpen(false)} style={{ background: "none", border: "none", color: "#71717a", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
            {/* All projects row */}
            <div
              onClick={() => { setProject(""); setProjectsOpen(false); }}
              style={{
                padding: "10px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
                background: !selectedProject ? "#27272a" : "transparent",
                borderLeft: !selectedProject ? "2px solid #52525b" : "2px solid transparent",
              }}
              onMouseEnter={e => { if (selectedProject) (e.currentTarget as HTMLElement).style.background = "#1f1f23"; }}
              onMouseLeave={e => { if (selectedProject) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#e4e4e7" }}>All Projects</div>
                <div style={{ fontSize: 11, color: "#71717a", marginTop: 2 }}>{allCards.length} total cards</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["backlog","in-progress","in-review","shipped"] as const).map(col => {
                  const n = allCards.filter(c => c.column === col).length;
                  if (!n) return null;
                  const label = col === "in-progress" ? "prog" : col === "in-review" ? "rev" : col;
                  return <span key={col} style={{ fontSize: 11, color: "#71717a" }}>{label} <b style={{ color: "#a1a1aa" }}>{n}</b></span>;
                })}
              </div>
            </div>

            <div style={{ height: 1, background: "#27272a", margin: "8px 0" }} />

            {projects.map(p => {
              const pCards = allCards.filter(c => c.project_id === p.id);
              const isSelected = selectedProject === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() => { setProject(p.id); setProjectsOpen(false); }}
                  style={{
                    padding: "12px 20px", cursor: "pointer",
                    background: isSelected ? "#27272a" : "transparent",
                    borderLeft: isSelected ? "2px solid #52525b" : "2px solid transparent",
                  }}
                  onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "#1f1f23"; }}
                  onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#e4e4e7" }}>{p.name}</div>
                      {p.description && <div style={{ fontSize: 12, color: "#71717a", marginTop: 3 }}>{p.description}</div>}
                      <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
                        {p.work_dir && (
                          <span style={{ fontSize: 11, color: "#52525b", fontFamily: "monospace" }} title={p.work_dir}>
                            📁 {p.work_dir.replace(/^\/Users\/[^/]+/, "~")}
                          </span>
                        )}
                        {p.github_repo && (
                          <span style={{ fontSize: 11, color: "#52525b" }}>
                            ⎇ {p.github_repo}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                      <span style={{ fontSize: 12, color: "#71717a" }}>{pCards.length} cards</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {(["backlog","in-progress","in-review","shipped"] as const).map(col => {
                          const n = pCards.filter(c => c.column === col).length;
                          if (!n) return null;
                          const colors: Record<string, string> = { backlog: "#7c3aed", "in-progress": "#3b82f6", "in-review": "#f59e0b", shipped: "#22c55e" };
                          const label = col === "in-progress" ? "prog" : col === "in-review" ? "rev" : col;
                          return (
                            <span key={col} style={{ fontSize: 11, color: colors[col] ?? "#71717a" }}>
                              {label} <b>{n}</b>
                            </span>
                          );
                        })}
                      </div>
                      <span style={{ fontSize: 10, color: "#3f3f46", fontFamily: "monospace" }}>{p.id}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
