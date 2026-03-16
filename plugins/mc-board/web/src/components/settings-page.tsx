"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { FormEvent } from "react";

/* ── Types ── */
type Category = "general" | "telegram" | "github" | "email" | "gemini" | "anthropic";

interface NavItem {
  key: Category;
  icon: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: "general", icon: "⚙", label: "General" },
  { key: "telegram", icon: "💬", label: "Telegram" },
  { key: "github", icon: "🐙", label: "GitHub" },
  { key: "email", icon: "📧", label: "Email" },
  { key: "gemini", icon: "🎨", label: "Gemini" },
  { key: "anthropic", icon: "🧠", label: "Claude" },
];

/* ── Password Confirmation Modal ── */
function PasswordConfirmModal({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPw("");
      setError("");
      setVerifying(false);
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pw.trim()) {
      setError("Password is required");
      return;
    }
    setVerifying(true);
    setError("");
    try {
      // Verify password — the hook's handleConfirm will extract the token
      const res = await fetch("/api/setup/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const data = await res.json();
      if (data.ok) {
        onConfirm(data.sensitiveToken);
      } else {
        setError(data.error || "Incorrect password");
        setVerifying(false);
      }
    } catch {
      setError("Verification failed");
      setVerifying(false);
    }
  };

  if (!open) return null;

  return (
    <div className="backdrop open" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal form-modal" role="dialog" aria-modal="true" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <div className="modal-header-info">
            <div className="modal-title" style={{ fontSize: 16, marginBottom: 0 }}>Confirm Password</div>
          </div>
          <button className="modal-close" onClick={onCancel} aria-label="Close">&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p style={{ fontSize: 13, color: "#a1a1aa", marginBottom: 14 }}>
              Enter your current password to save changes to sensitive fields.
            </p>
            {error && <div className="form-error">{error}</div>}
            <div className="form-field">
              <label className="form-label" htmlFor="pw-confirm">Current Password</label>
              <input
                ref={inputRef}
                id="pw-confirm"
                type="password"
                className="form-input"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
            </div>
          </div>
          <div className="modal-footer form-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={verifying}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={verifying}>
              {verifying ? "Verifying..." : "Confirm"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Generic settings form field ── */
function SettingsField({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="settings-field">
      <div className="settings-field-header">
        <label className="settings-field-label">{label}</label>
        {description && <span className="settings-field-desc">{description}</span>}
      </div>
      {children}
    </div>
  );
}

/* ── Save status feedback ── */
type SaveStatus = "idle" | "saving" | "saved" | "error";

function SaveButton({ status, onClick, disabled }: { status: SaveStatus; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      className="btn btn-primary"
      onClick={onClick}
      disabled={disabled || status === "saving"}
    >
      {status === "saving" ? "Saving..." : status === "saved" ? "Saved" : "Save"}
    </button>
  );
}

/* ── General Panel ── */
function GeneralPanel() {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [pronouns, setPronouns] = useState("she/her");
  const [accentColor, setAccentColor] = useState("#00E5CC");
  const [status, setStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    fetch("/api/setup/state")
      .then((r) => r.json())
      .then((data) => {
        setName(data.assistantName || "");
        setShortName(data.shortName || "");
        setPronouns(data.pronouns || "she/her");
        setAccentColor(data.accentColor || "#00E5CC");
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    setStatus("saving");
    try {
      const res = await fetch("/api/setup/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantName: name, shortName, pronouns, accentColor }),
      });
      if (res.ok) {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <h2 className="settings-panel-title">General</h2>
        <p className="settings-panel-desc">Basic assistant configuration</p>
      </div>
      <div className="settings-panel-body">
        <SettingsField label="Assistant Name" description="Full display name">
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amelia" />
        </SettingsField>
        <SettingsField label="Short Name" description="Used in conversations">
          <input className="form-input" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="e.g. Am" />
        </SettingsField>
        <SettingsField label="Pronouns">
          <select className="form-input form-select" value={pronouns} onChange={(e) => setPronouns(e.target.value)}>
            <option value="she/her">she/her</option>
            <option value="he/him">he/him</option>
            <option value="they/them">they/them</option>
          </select>
        </SettingsField>
        <SettingsField label="Accent Color">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              style={{ width: 36, height: 36, border: "1px solid #3f3f46", borderRadius: 6, background: "#18181b", cursor: "pointer", padding: 2 }}
            />
            <input className="form-input" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} style={{ flex: 1, fontFamily: "monospace" }} />
          </div>
        </SettingsField>
      </div>
      <div className="settings-panel-footer">
        {status === "error" && <span style={{ fontSize: 12, color: "#f87171" }}>Save failed</span>}
        <SaveButton status={status} onClick={save} />
      </div>
    </div>
  );
}

/* ── Sensitive Field Wrapper — requires password confirmation ── */
function useSensitiveSave() {
  const [pendingSave, setPendingSave] = useState<((sensitiveToken: string) => Promise<void>) | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const requestSave = useCallback((saveFn: (sensitiveToken: string) => Promise<void>) => {
    setPendingSave(() => saveFn);
    setShowConfirm(true);
  }, []);

  const handleConfirm = useCallback((sensitiveToken: string) => {
    setShowConfirm(false);
    if (pendingSave) pendingSave(sensitiveToken);
    setPendingSave(null);
  }, [pendingSave]);

  const handleCancel = useCallback(() => {
    setShowConfirm(false);
    setPendingSave(null);
  }, []);

  return { showConfirm, requestSave, handleConfirm, handleCancel };
}

/* ── Telegram Panel ── */
function TelegramPanel() {
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");
  const { showConfirm, requestSave, handleConfirm, handleCancel } = useSensitiveSave();

  useEffect(() => {
    fetch("/api/setup/state")
      .then((r) => r.json())
      .then((data) => {
        setUsername(data.telegramBotUsername || "");
        setToken(data.telegramBotToken || "");
        setChatId(data.telegramChatId || "");
        setConfigured(!!data.telegramBotToken);
      })
      .catch(() => {});
  }, []);

  const doSave = async (sensitiveToken: string) => {
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/setup/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken: token.trim(), chatId: chatId.trim(), botUsername: username.trim(), sensitiveToken }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("saved");
        setConfigured(true);
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setStatus("error");
        setError(data.error || "Failed to save");
      }
    } catch {
      setStatus("error");
      setError("Network error");
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <h2 className="settings-panel-title">Telegram</h2>
        <p className="settings-panel-desc">Bot connection for messaging</p>
        {configured && <span className="settings-status-badge configured">Configured</span>}
      </div>
      <div className="settings-panel-body">
        <SettingsField label="Bot Username">
          <input className="form-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@YourBot" />
        </SettingsField>
        <SettingsField label="Bot Token" description="From @BotFather">
          <input className="form-input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456:ABC-DEF..." />
        </SettingsField>
        <SettingsField label="Chat ID" description="Your Telegram user ID">
          <input className="form-input" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="123456789" />
        </SettingsField>
      </div>
      <div className="settings-panel-footer">
        {error && <span style={{ fontSize: 12, color: "#f87171" }}>{error}</span>}
        <SaveButton status={status} onClick={() => requestSave(doSave)} disabled={!token.trim() || !chatId.trim()} />
      </div>
      <PasswordConfirmModal open={showConfirm} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  );
}

/* ── GitHub Panel ── */
function GitHubPanel() {
  const [token, setToken] = useState("");
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");
  const [ghUser, setGhUser] = useState("");
  const { showConfirm, requestSave, handleConfirm, handleCancel } = useSensitiveSave();

  useEffect(() => {
    fetch("/api/setup/state")
      .then((r) => r.json())
      .then((data) => {
        setToken(data.ghToken || "");
        setConfigured(!!data.ghConfigured);
      })
      .catch(() => {});
  }, []);

  const doSave = async (sensitiveToken: string) => {
    if (!token.trim()) return;
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/setup/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), sensitiveToken }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("saved");
        setConfigured(true);
        setGhUser(data.username || "");
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setStatus("error");
        setError(data.error || "Token validation failed");
      }
    } catch {
      setStatus("error");
      setError("Network error");
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <h2 className="settings-panel-title">GitHub</h2>
        <p className="settings-panel-desc">Code access, repos, and custom tools</p>
        {configured && <span className="settings-status-badge configured">Configured</span>}
      </div>
      <div className="settings-panel-body">
        <SettingsField label="Personal Access Token" description="With repo, workflow, admin:org scopes">
          <input className="form-input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" style={{ fontFamily: "monospace" }} />
        </SettingsField>
        {ghUser && (
          <div style={{ fontSize: 12, color: "#4ade80", padding: "4px 0" }}>
            Connected as <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{ghUser}</span>
          </div>
        )}
      </div>
      <div className="settings-panel-footer">
        {error && <span style={{ fontSize: 12, color: "#f87171" }}>{error}</span>}
        <SaveButton status={status} onClick={() => requestSave(doSave)} disabled={!token.trim()} />
      </div>
      <PasswordConfirmModal open={showConfirm} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  );
}

/* ── Email Panel ── */
function EmailPanel() {
  const [emailAddr, setEmailAddr] = useState("");
  const [appPassword, setAppPassword] = useState("");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("587");
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");
  const { showConfirm, requestSave, handleConfirm, handleCancel } = useSensitiveSave();

  const isGmail = emailAddr.split("@")[1]?.toLowerCase() === "gmail.com" || emailAddr.split("@")[1]?.toLowerCase() === "googlemail.com";

  useEffect(() => {
    fetch("/api/setup/state")
      .then((r) => r.json())
      .then((data) => {
        setEmailAddr(data.emailAddress || "");
        setAppPassword(data.appPassword || "");
        setConfigured(!!data.emailConfigured);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isGmail && emailAddr.includes("@")) {
      const domain = emailAddr.split("@")[1]?.toLowerCase() || "";
      if (domain === "outlook.com" || domain === "hotmail.com") setSmtpHost("smtp.office365.com");
      else if (domain === "yahoo.com") setSmtpHost("smtp.mail.yahoo.com");
      else if (domain === "icloud.com" || domain === "me.com") setSmtpHost("smtp.mail.me.com");
      else setSmtpHost(`smtp.${domain}`);
    }
  }, [emailAddr, isGmail]);

  const doSave = async (sensitiveToken: string) => {
    if (!emailAddr.trim() || !appPassword.trim()) return;
    setStatus("saving");
    setError("");
    try {
      const body: Record<string, string> = { email: emailAddr.trim(), appPassword: appPassword.trim(), sensitiveToken };
      if (!isGmail) {
        body.smtpHost = smtpHost.trim();
        body.smtpPort = smtpPort.trim();
      }
      const res = await fetch("/api/setup/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("saved");
        setConfigured(true);
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setStatus("error");
        setError(data.error || "Verification failed");
      }
    } catch {
      setStatus("error");
      setError("Network error");
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <h2 className="settings-panel-title">Email</h2>
        <p className="settings-panel-desc">Inbox, agent actions, and triage</p>
        {configured && <span className="settings-status-badge configured">Configured</span>}
      </div>
      <div className="settings-panel-body">
        <SettingsField label="Email Address">
          <input className="form-input" type="email" value={emailAddr} onChange={(e) => setEmailAddr(e.target.value)} placeholder="you@example.com" />
          {emailAddr.includes("@") && (
            <span style={{ fontSize: 11, color: "#3b82f6", marginTop: 4, display: "block" }}>
              {isGmail ? "Gmail detected — using Google IMAP" : "SMTP"}
            </span>
          )}
        </SettingsField>
        <SettingsField label={isGmail ? "App Password" : "Password"}>
          <input className="form-input" type="password" value={appPassword} onChange={(e) => setAppPassword(e.target.value)} placeholder={isGmail ? "xxxx xxxx xxxx xxxx" : "Your email password"} style={{ fontFamily: "monospace" }} />
        </SettingsField>
        {!isGmail && emailAddr.includes("@") && (
          <>
            <SettingsField label="SMTP Host">
              <input className="form-input" value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" />
            </SettingsField>
            <SettingsField label="SMTP Port">
              <input className="form-input" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" style={{ maxWidth: 100 }} />
            </SettingsField>
          </>
        )}
      </div>
      <div className="settings-panel-footer">
        {error && <span style={{ fontSize: 12, color: "#f87171" }}>{error}</span>}
        <SaveButton status={status} onClick={() => requestSave(doSave)} disabled={!emailAddr.trim() || !appPassword.trim()} />
      </div>
      <PasswordConfirmModal open={showConfirm} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  );
}

/* ── Gemini Panel ── */
function GeminiPanel() {
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");
  const { showConfirm, requestSave, handleConfirm, handleCancel } = useSensitiveSave();

  useEffect(() => {
    fetch("/api/setup/state")
      .then((r) => r.json())
      .then((data) => {
        setApiKey(data.geminiKey || "");
        setConfigured(!!data.geminiConfigured);
      })
      .catch(() => {});
  }, []);

  const doSave = async (sensitiveToken: string) => {
    if (!apiKey.trim()) return;
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/setup/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), sensitiveToken }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("saved");
        setConfigured(true);
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setStatus("error");
        setError(data.error || "Failed to save");
      }
    } catch {
      setStatus("error");
      setError("Network error");
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <h2 className="settings-panel-title">Gemini</h2>
        <p className="settings-panel-desc">Image generation API key</p>
        {configured && <span className="settings-status-badge configured">Configured</span>}
      </div>
      <div className="settings-panel-body">
        <SettingsField label="API Key" description="Get a free key at aistudio.google.com">
          <input className="form-input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIza..." style={{ fontFamily: "monospace" }} />
        </SettingsField>
      </div>
      <div className="settings-panel-footer">
        {error && <span style={{ fontSize: 12, color: "#f87171" }}>{error}</span>}
        <SaveButton status={status} onClick={() => requestSave(doSave)} disabled={!apiKey.trim()} />
      </div>
      <PasswordConfirmModal open={showConfirm} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  );
}

/* ── Claude/Anthropic Panel ── */
function AnthropicPanel() {
  const [configured, setConfigured] = useState(false);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState("");
  const { showConfirm, requestSave, handleConfirm, handleCancel } = useSensitiveSave();

  useEffect(() => {
    fetch("/api/setup/state")
      .then((r) => r.json())
      .then((data) => {
        setConfigured(!!data.anthropicToken || !!data.complete);
      })
      .catch(() => {});
  }, []);

  const doSave = async (sensitiveToken: string) => {
    if (!token.trim()) return;
    setStatus("saving");
    setError("");
    try {
      const res = await fetch("/api/setup/anthropic", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim(), sensitiveToken }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("saved");
        setConfigured(true);
        setTimeout(() => setStatus("idle"), 2000);
      } else {
        setStatus("error");
        setError(data.error || "Token failed");
      }
    } catch {
      setStatus("error");
      setError("Network error");
    }
  };

  const handleConnect = async () => {
    setStatus("saving");
    setError("");
    try {
      await fetch("/api/setup/anthropic", { method: "POST" });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      setError("Connection failed");
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-panel-header">
        <h2 className="settings-panel-title">Claude</h2>
        <p className="settings-panel-desc">Subscription and compute</p>
        {configured && <span className="settings-status-badge configured">Connected</span>}
      </div>
      <div className="settings-panel-body">
        <SettingsField label="Session Token" description="Paste a token or use OAuth below">
          <input className="form-input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Paste code here..." style={{ fontFamily: "monospace" }} />
        </SettingsField>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn btn-secondary" onClick={handleConnect} disabled={status === "saving"}>
            Sign in via OAuth
          </button>
          {configured && <span style={{ fontSize: 12, color: "#4ade80" }}>Currently connected</span>}
        </div>
      </div>
      <div className="settings-panel-footer">
        {error && <span style={{ fontSize: 12, color: "#f87171" }}>{error}</span>}
        <SaveButton status={status} onClick={() => requestSave(doSave)} disabled={!token.trim()} />
      </div>
      <PasswordConfirmModal open={showConfirm} onConfirm={handleConfirm} onCancel={handleCancel} />
    </div>
  );
}

/* ── Panel Router ── */
const PANELS: Record<Category, React.FC> = {
  general: GeneralPanel,
  telegram: TelegramPanel,
  github: GitHubPanel,
  email: EmailPanel,
  gemini: GeminiPanel,
  anthropic: AnthropicPanel,
};

/* ── Main Settings Page ── */
export function SettingsPage() {
  const [active, setActive] = useState<Category>("general");
  const [configured, setConfigured] = useState<Record<string, boolean>>({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    fetch("/api/setup/state")
      .then((r) => r.json())
      .then((data) => {
        setConfigured({
          telegram: !!data.telegramBotToken,
          github: !!data.ghConfigured,
          email: !!data.emailConfigured,
          gemini: !!data.geminiConfigured,
          anthropic: !!data.anthropicToken || !!data.complete,
        });
      })
      .catch(() => {});
  }, [active]);

  const Panel = PANELS[active];

  return (
    <div className="settings-layout">
      {/* Mobile nav toggle */}
      <div className="settings-mobile-header">
        <button
          className={`settings-nav-toggle${mobileNavOpen ? " active" : ""}`}
          onClick={() => setMobileNavOpen((v) => !v)}
        >
          {mobileNavOpen ? "Hide" : "Menu"}
        </button>
        <span className="settings-mobile-title">{NAV_ITEMS.find((n) => n.key === active)?.label}</span>
      </div>

      {/* Left nav */}
      <nav className={`settings-nav${mobileNavOpen ? " mobile-open" : ""}`}>
        <div className="settings-nav-label">Settings</div>
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`settings-nav-btn${active === item.key ? " active" : ""}`}
            onClick={() => { setActive(item.key); setMobileNavOpen(false); }}
          >
            <span className="settings-nav-icon">{item.icon}</span>
            <span className="settings-nav-text">{item.label}</span>
            {configured[item.key] && <span className="settings-nav-dot" />}
          </button>
        ))}
      </nav>

      {/* Right panel */}
      <div className="settings-content">
        <Panel />
      </div>
    </div>
  );
}
