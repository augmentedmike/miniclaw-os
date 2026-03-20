"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { Modal } from "./modal";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Agent {
  id: string;
  label: string;
  description: string;
  optional: boolean;
  installed: boolean;
  hasWeb: boolean;
  hasCli: boolean;
  toolCount: number;
  requires: string[];
}

/* ── Icon map — deterministic icon per plugin category ── */
const AGENT_ICONS: Record<string, string> = {
  "mc-board": "🧠",
  "mc-context": "🪞",
  "mc-designer": "🎨",
  "mc-kb": "📚",
  "mc-rolodex": "📇",
  "mc-queue": "📬",
  "mc-soul": "🫀",
  "mc-trust": "🔐",
  "mc-email": "📧",
  "mc-jobs": "💼",
  "mc-substack": "📝",
  "mc-backup": "💾",
  "mc-stripe": "💳",
  "mc-square": "🟪",
  "mc-authenticator": "🔑",
  "mc-booking": "📅",
  "mc-slack": "💬",
  "mc-discord": "🎮",
  "mc-twitter": "🐦",
  "mc-github": "🐙",
  "mc-calendar": "🗓️",
  "mc-notes": "📓",
  "mc-analytics": "📊",
  "mc-monitor": "📡",
  "mc-deploy": "🚀",
  "mc-test": "🧪",
  "mc-translate": "🌐",
  "mc-voice": "🎙️",
  "mc-search": "🔍",
  "mc-notify": "🔔",
  "mc-pdf": "📄",
  "mc-crm": "🤝",
  "mc-invoice": "🧾",
  "mc-scraper": "🕸️",
  "mc-forms": "📋",
};

function getAgentIcon(id: string): string {
  return AGENT_ICONS[id] ?? "🤖";
}

/* ── Status badge ── */
function StatusBadge({ agent }: { agent: Agent }) {
  if (agent.installed) {
    return <span className="agent-badge agent-badge-installed">Installed</span>;
  }
  if (agent.optional) {
    return <span className="agent-badge agent-badge-optional">Optional</span>;
  }
  return <span className="agent-badge agent-badge-core">Core</span>;
}

/* ── Single agent card ── */
function AgentCard({ agent }: { agent: Agent }) {
  return (
    <div className="agent-card">
      <div className="agent-card-header">
        <span className="agent-card-icon">{getAgentIcon(agent.id)}</span>
        <StatusBadge agent={agent} />
      </div>
      <div className="agent-card-body">
        <div className="agent-card-name">{agent.label}</div>
        <div className="agent-card-desc">{agent.description}</div>
      </div>
      <div className="agent-card-footer">
        <div className="agent-card-meta">
          {agent.hasCli && <span className="agent-meta-tag">CLI</span>}
          {agent.hasWeb && <span className="agent-meta-tag">Web</span>}
          {agent.toolCount > 0 && (
            <span className="agent-meta-tag">{agent.toolCount} tools</span>
          )}
        </div>
        {agent.requires.length > 0 && (
          <div className="agent-card-requires">
            Requires: {agent.requires.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Add Custom Agent modal ── */
function AddCustomAgentModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [source, setSource] = useState("");

  if (!open) return null;

  return (
    <Modal onClose={onClose}>
      <div className="modal-header">
        <div className="modal-header-info">
          <div className="modal-title">Add Custom Agent</div>
        </div>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>
      <div className="modal-body" style={{ padding: "16px 20px" }}>
        <p
          style={{
            fontSize: 13,
            color: "#a1a1aa",
            marginBottom: 16,
            marginTop: 0,
          }}
        >
          Add an agent that is not in the official registry. Provide a Git URL
          or local path to the plugin source.
        </p>
        <div className="form-field" style={{ marginBottom: 12 }}>
          <label className="form-label">Agent Name</label>
          <input
            className="form-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. mc-my-agent"
          />
        </div>
        <div className="form-field" style={{ marginBottom: 12 }}>
          <label className="form-label">Description</label>
          <input
            className="form-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this agent do?"
          />
        </div>
        <div className="form-field" style={{ marginBottom: 12 }}>
          <label className="form-label">Source (Git URL or local path)</label>
          <input
            className="form-input"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="https://github.com/user/repo or /path/to/plugin"
            style={{ fontFamily: "monospace" }}
          />
        </div>
      </div>
      <div
        className="modal-footer"
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          padding: "12px 20px",
          borderTop: "1px solid #27272a",
        }}
      >
        <button className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={!name.trim() || !source.trim()}
          onClick={() => {
            // Future: POST to /api/agents/custom
            onClose();
          }}
        >
          Add Agent
        </button>
      </div>
    </Modal>
  );
}

/* ── Main Gallery Tab ── */
export function AgentsTab() {
  const { data, error, isLoading } = useSWR<{
    ok: boolean;
    agents: Agent[];
    total: number;
  }>("/api/agents", fetcher, { refreshInterval: 30000 });
  const [filter, setFilter] = useState<"all" | "installed" | "optional">("all");
  const [search, setSearch] = useState("");
  const [customOpen, setCustomOpen] = useState(false);

  const agents = data?.agents ?? [];
  const filtered = agents.filter((a) => {
    if (filter === "installed" && !a.installed) return false;
    if (filter === "optional" && !a.optional) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        a.label.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="agents-tab">
      {/* Header */}
      <div className="agents-header">
        <div className="agents-header-left">
          <h2 className="agents-title">Agent Gallery</h2>
          {data && (
            <span className="agents-count">
              {agents.filter((a) => a.installed).length}/{agents.length}{" "}
              installed
            </span>
          )}
        </div>
        <div className="agents-header-right">
          <input
            className="form-input agents-search"
            placeholder="Search agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="agents-filters">
            {(["all", "installed", "optional"] as const).map((f) => (
              <button
                key={f}
                className={`agents-filter-btn${filter === f ? " active" : ""}`}
                onClick={() => setFilter(f)}
              >
                {f === "all" ? "All" : f === "installed" ? "Installed" : "Optional"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="agents-grid">
        {isLoading && (
          <div className="agents-loading">Loading agents...</div>
        )}
        {error && (
          <div className="agents-error">Failed to load agents</div>
        )}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="agents-empty">No agents match your search</div>
        )}
        {filtered.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}

        {/* Add Custom Agent card */}
        {!isLoading && !error && (
          <button
            className="agent-card agent-card-add"
            onClick={() => setCustomOpen(true)}
          >
            <div className="agent-card-header">
              <span className="agent-card-icon">+</span>
            </div>
            <div className="agent-card-body">
              <div className="agent-card-name">Add Custom Agent</div>
              <div className="agent-card-desc">
                Install an agent from a Git repo or local path
              </div>
            </div>
          </button>
        )}
      </div>

      <AddCustomAgentModal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
      />
    </div>
  );
}
