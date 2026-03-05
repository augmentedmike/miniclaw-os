"use client";
import { useState, useCallback, useEffect } from "react";
import { Board } from "./Board";
import { MemoryTab } from "./MemoryTab";
import { CronTab } from "./CronTab";
import { Project } from "@/lib/types";

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

export function AppShell({ initialTab }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "board");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [notifsEnabled, setNotifsEnabled] = useState(getNotifsEnabled);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>(getInitialProject);

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

  const handleBoardData = useCallback((ps: Project[], c: Counts) => {
    setProjects(ps);
    setCounts(c);
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

        {/* Center: project dropdown */}
        <div className="flex flex-1 items-center justify-center px-4">
          {projects.length > 0 && (
            <select
              className="filter-select"
              value={selectedProject}
              onChange={e => setProject(e.target.value)}
            >
              <option value="">All Projects</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
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

        {/* Far right: alerts bell */}
        <button
          onClick={toggleNotifs}
          className="flex items-center justify-center w-11 border-l border-zinc-800 text-lg shrink-0 hover:bg-zinc-900 transition-colors h-full"
          title={notifsEnabled ? "Alerts on — click to mute" : "Alerts muted — click to enable"}
        >
          {notifsEnabled ? "🔔" : "🔕"}
        </button>
      </div>

      {/* Tab panels */}
      <div className={`tab-panel${tab === "board" ? " active" : ""}`}>
        <Board
          selectedProject={selectedProject}
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
    </div>
  );
}
