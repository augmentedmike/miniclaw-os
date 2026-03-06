"use client";
import { useState, useCallback, useEffect } from "react";
import { Board } from "./Board";
import { MemoryTab } from "./MemoryTab";
import { CronTab } from "./CronTab";
import { Modal } from "./Modal";
import { Project, Card } from "@/lib/types";

type Tab = "board" | "memory" | "scheduling";
interface Toast { id: number; icon: string; title: string; sub?: string; exiting?: boolean; }
interface Counts { backlog: number; inProgress: number; inReview: number; shipped: number; }

const TAB_PATHS: Record<Tab, string> = { board: "/board", memory: "/memory", scheduling: "/scheduling" };

function getNotifsEnabled(): boolean {
  try { return localStorage.getItem("brain-toasts") !== "false"; } catch { return true; }
}

function getInitialProject(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("project") ?? "";
}

export function AppShell({ initialTab, initialCardId, initialProjectId }: { initialTab?: Tab; initialCardId?: string; initialProjectId?: string }) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "board");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifsEnabled, setNotifsEnabled] = useState(getNotifsEnabled);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>(initialProjectId ?? getInitialProject);
  const [projectsOpen, setProjectsOpen] = useState(false);

  const showToast = useCallback((icon: string, title: string, sub?: string) => {
    const id = Date.now();
    setToasts(t => [...t, { id, icon, title, sub }]);
    setTimeout(() => {
      setToasts(t => t.map(x => x.id === id ? { ...x, exiting: true } : x));
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 220);
    }, 4800);
  }, []);

  const toggleNotifs = () => {
    setNotifsEnabled(on => {
      const next = !on;
      try { localStorage.setItem("brain-toasts", next ? "true" : "false"); } catch {}
      return next;
    });
  };

  // Project filter with URL sync
  const setProject = useCallback((p: string) => {
    setSelectedProject(p);
    const url = new URL(window.location.href);
    if (p) url.searchParams.set("project", p);
    else url.searchParams.delete("project");
    history.pushState(null, "", url.toString());
  }, []);

  const handleBoardData = useCallback((ps: Project[], c: Counts, cards: Card[]) => {
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
            {(["board", "memory", "scheduling"] as Tab[]).map(t => (
              <button key={t} onClick={() => switchTab(t)}
                className={`tab-btn${tab === t ? " active" : ""}`}>
                {t === "board" ? "Board" : t === "memory" ? "Memory" : "Scheduling"}
              </button>
            ))}
          </div>
        </div>

        {/* Center: project button (board only) */}
        <div className="flex flex-1 items-center justify-center px-4">
          {tab === "board" && projects.length > 0 && (
            <button
              onClick={() => setProjectsOpen(true)}
              style={{
                background: selectedProject ? "#27272a" : "transparent",
                border: "1px solid #3f3f46",
                borderRadius: 6,
                padding: "4px 12px",
                color: selectedProject ? "#e4e4e7" : "#a1a1aa",
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ fontSize: 11, opacity: 0.6 }}>◈</span>
              {selectedProject ? (projects.find(p => p.id === selectedProject)?.name ?? "Project") : "Projects"}
              {selectedProject && (
                <span
                  onClick={e => { e.stopPropagation(); setProject(""); }}
                  style={{ marginLeft: 2, opacity: 0.5, fontSize: 12, lineHeight: 1 }}
                  title="Clear filter"
                >✕</span>
              )}
            </button>
          )}
        </div>

        {/* Right: stat pills */}
        {counts && (
          <div className="stat-pills">
            <span className="stat-pill">projects<b>{projects.length}</b></span>
            <span className="stat-pill">backlog<b>{counts.backlog}</b></span>
            <span className="stat-pill">in&nbsp;progress<b>{counts.inProgress}</b></span>
            <span className="stat-pill">in&nbsp;review<b>{counts.inReview}</b></span>
            <span className="stat-pill">shipped<b>{counts.shipped}</b></span>
          </div>
        )}

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

      {/* Tab panels */}
      <div className={`tab-panel${tab === "board" ? " active" : ""}`}>
        <Board
          selectedProject={selectedProject}
          initialCardId={initialCardId}
          onToast={showToast}
          notifsEnabled={notifsEnabled}
          onBoardData={handleBoardData}
        />
      </div>
      <div className={`tab-panel${tab === "memory" ? " active" : ""}`}>
        <MemoryTab />
      </div>
      <div className={`tab-panel${tab === "scheduling" ? " active" : ""}`}>
        <CronTab />
      </div>

      {/* Footer */}
      <div className="footer">MiniClaw Brain · port 4220</div>

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
                          const colors: Record<string, string> = { backlog: "#52525b", "in-progress": "#3b82f6", "in-review": "#a855f7", shipped: "#22c55e" };
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
