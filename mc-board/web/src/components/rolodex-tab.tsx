"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, FormEvent, MouseEvent } from "react";
import { useSWRConfig } from "swr";

interface Contact {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  domains: string[];
  tags: string[];
  trustStatus?: "verified" | "pending" | "untrusted" | "unknown";
  lastVerified?: string;
  notes?: string;
}

type TrustStatus = "verified" | "pending" | "untrusted" | "unknown";

interface ApiResponse {
  contacts: Contact[];
  tags: string[];
  total: number;
}

const TRUST_LEVELS = ["verified", "pending", "untrusted", "unknown"] as const;

function trustClass(s?: string) {
  if (s === "verified") return "trust-badge trust-verified";
  if (s === "pending") return "trust-badge trust-pending";
  if (s === "untrusted") return "trust-badge trust-untrusted";
  return "trust-badge trust-unknown";
}

function trustLabel(s?: string) {
  return (!s || s === "unknown") ? "unknown" : s;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0] ?? "")
    .join("")
    .toUpperCase();
}

// ── CopyableValue ─────────────────────────────────────────────

function CopyableValue({ value, stopProp }: { value: string; stopProp?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = (e: MouseEvent) => {
    if (stopProp) e.stopPropagation();
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <span className="copyable-value" onClick={copy} title={`Click to copy: ${value}`}>
      <span className="copyable-text">{value}</span>
      <span className={`copy-icon${copied ? " copy-icon--done" : ""}`} aria-label="copy">
        {copied ? "✓" : "⎘"}
      </span>
    </span>
  );
}

// ── ChipInput ────────────────────────────────────────────────

function ChipInput({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string;
  placeholder?: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const commit = () => {
    const v = input.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setInput("");
  };

  const remove = (item: string) => onChange(values.filter(v => v !== item));

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && !input && values.length > 0) {
      remove(values[values.length - 1]);
    }
  };

  return (
    <div className="form-field">
      <label className="form-label">{label}</label>
      <div className="chip-wrap">
        {values.map(v => (
          <span key={v} className="chip">
            {v}
            <button type="button" className="chip-x" onClick={() => remove(v)} aria-label={`Remove ${v}`}>×</button>
          </span>
        ))}
        <input
          type="text"
          className="chip-text-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          placeholder={values.length === 0 ? (placeholder ?? "Type and press Enter") : ""}
        />
      </div>
    </div>
  );
}

// ── ContactFormModal ──────────────────────────────────────────

interface FormData {
  name: string;
  emails: string[];
  phones: string[];
  domains: string[];
  tags: string[];
  trustStatus: TrustStatus;
  notes: string;
}

function defaultForm(contact?: Contact): FormData {
  return {
    name: contact?.name ?? "",
    emails: contact?.emails ?? [],
    phones: contact?.phones ?? [],
    domains: contact?.domains ?? [],
    tags: contact?.tags ?? [],
    trustStatus: contact?.trustStatus ?? "unknown",
    notes: contact?.notes ?? "",
  };
}

function ContactFormModal({
  editing,
  onClose,
  onSaved,
}: {
  editing: Contact | "new" | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = editing === "new";
  const initial = isNew ? undefined : (editing as Contact | null);
  const [form, setForm] = useState<FormData>(() => defaultForm(initial ?? undefined));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing === null) return;
    const c = editing === "new" ? undefined : editing;
    setForm(defaultForm(c));
    setError(null);
    setSaving(false);
    const t = setTimeout(() => nameRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, onClose]);

  const set = <K extends keyof FormData>(k: K, v: FormData[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required");
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        emails: form.emails,
        phones: form.phones,
        domains: form.domains,
        tags: form.tags,
        trustStatus: form.trustStatus,
        notes: form.notes.trim(),
      };
      const res = isNew
        ? await fetch("/api/rolodex", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch(`/api/rolodex/${initial!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "Save failed");
      }
      onSaved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Save failed");
      setSaving(false);
    }
  };

  if (!editing) return null;

  return (
    <div className="backdrop open" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal form-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div className="modal-header-info">
            <div className="modal-title">{isNew ? "New Contact" : "Edit Contact"}</div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form onSubmit={submit}>
          <div className="modal-body">
            {error && <div className="form-error">{error}</div>}

            <div className="form-field">
              <label className="form-label" htmlFor="rdx-name">Name *</label>
              <input
                ref={nameRef}
                id="rdx-name"
                type="text"
                className="form-input"
                value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder="Full name"
                autoComplete="off"
              />
            </div>

            <ChipInput label="Emails" placeholder="email@example.com" values={form.emails} onChange={v => set("emails", v)} />
            <ChipInput label="Phones" placeholder="+1 555 000 0000" values={form.phones} onChange={v => set("phones", v)} />
            <ChipInput label="Domains" placeholder="example.com" values={form.domains} onChange={v => set("domains", v)} />
            <ChipInput label="Tags" placeholder="tag" values={form.tags} onChange={v => set("tags", v)} />

            <div className="form-field">
              <label className="form-label" htmlFor="rdx-trust">Trust Status</label>
              <select
                id="rdx-trust"
                className="form-input form-select"
                value={form.trustStatus}
                onChange={e => set("trustStatus", e.target.value as TrustStatus)}
              >
                {TRUST_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="rdx-notes">Notes</label>
              <textarea
                id="rdx-notes"
                className="form-input form-textarea"
                value={form.notes}
                onChange={e => set("notes", e.target.value)}
                placeholder="Notes about this contact…"
                rows={3}
              />
            </div>
          </div>

          <div className="modal-footer form-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Saving…" : isNew ? "Create Contact" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── ContactModal (view + delete) ──────────────────────────────

function ContactModal({
  contact,
  onClose,
  onEdit,
  onDelete,
}: {
  contact: Contact | null;
  onClose: () => void;
  onEdit: (c: Contact) => void;
  onDelete: (c: Contact) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!contact) { setConfirmDelete(false); return; }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contact, onClose]);

  useEffect(() => { setConfirmDelete(false); }, [contact?.id]);

  return (
    <div className={`backdrop ${contact ? "open" : ""}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      {contact && (
        <div className="modal" role="dialog" aria-modal="true">
          <div className="modal-header">
            <div className="modal-avatar">{initials(contact.name)}</div>
            <div className="modal-header-info">
              <div className="modal-title">{contact.name}</div>
              <div className="modal-meta">
                <span className={trustClass(contact.trustStatus)}>{trustLabel(contact.trustStatus)}</span>
                {(contact.tags ?? []).map(t => <span key={t} className="tag">{t}</span>)}
              </div>
            </div>
            <div className="modal-header-actions">
              <button className="btn-icon" onClick={() => onEdit(contact)} title="Edit contact" aria-label="Edit contact">✎</button>
              <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
            </div>
          </div>

          <div className="modal-body">
            {(contact.emails?.length ?? 0) > 0 && (
              <div className="modal-section">
                <div className="modal-section-label">Email</div>
                <ul className="modal-list">{contact.emails!.map(e => <li key={e}><CopyableValue value={e} /></li>)}</ul>
              </div>
            )}
            {(contact.phones?.length ?? 0) > 0 && (
              <div className="modal-section">
                <div className="modal-section-label">Phone</div>
                <ul className="modal-list">{contact.phones!.map(p => <li key={p}><CopyableValue value={p} /></li>)}</ul>
              </div>
            )}
            {(contact.domains?.length ?? 0) > 0 && (
              <div className="modal-section">
                <div className="modal-section-label">Domains</div>
                <ul className="modal-list">{contact.domains!.map(d => <li key={d}><CopyableValue value={d} /></li>)}</ul>
              </div>
            )}
            {contact.notes && (
              <div className="modal-section">
                <div className="modal-section-label">Notes</div>
                <div className="modal-section-body">{contact.notes}</div>
              </div>
            )}
            {contact.lastVerified && (
              <div className="modal-section">
                <div className="modal-section-label">Last Verified</div>
                <div className="modal-section-body">
                  {new Date(contact.lastVerified).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </div>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <span className="modal-id">id: {contact.id}</span>
            <div className="modal-footer-actions">
              {confirmDelete ? (
                <>
                  <span className="delete-confirm-text">Delete this contact?</span>
                  <button className="btn btn-danger" onClick={() => onDelete(contact)}>Yes, delete</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </>
              ) : (
                <button className="btn btn-danger-outline" onClick={() => setConfirmDelete(true)}>Delete</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── RolodexTab ────────────────────────────────────────────────

export function RolodexTab() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [activeTrust, setActiveTrust] = useState<string | null>(null);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [formMode, setFormMode] = useState<Contact | "new" | null>(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { mutate: globalMutate } = useSWRConfig();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 150);
    return () => clearTimeout(t);
  }, [query]);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (activeTag) params.set("tag", activeTag);
    if (activeTrust) params.set("trust", activeTrust);
    try {
      const res = await fetch(`/api/rolodex?${params}`);
      const json = await res.json() as ApiResponse;
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, activeTag, activeTrust]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);
  useEffect(() => { searchRef.current?.focus(); }, []);

  const handleSaved = useCallback(() => {
    setFormMode(null);
    fetchContacts();
    globalMutate("/api/rolodex/count");
  }, [fetchContacts, globalMutate]);

  const handleDelete = useCallback(async (contact: Contact) => {
    setSelected(null);
    if (data) {
      setData({ ...data, contacts: data.contacts.filter(c => c.id !== contact.id), total: data.total - 1 });
    }
    try {
      await fetch(`/api/rolodex/${contact.id}`, { method: "DELETE" });
    } catch {
      fetchContacts();
    }
    globalMutate("/api/rolodex/count");
  }, [data, fetchContacts, globalMutate]);

  const handleEdit = useCallback((contact: Contact) => {
    setSelected(null);
    setFormMode(contact);
  }, []);

  const contacts = data?.contacts ?? [];
  const allTags = data?.tags ?? [];
  const trustCounts: Record<string, number> = {};
  for (const c of contacts) {
    const t = c.trustStatus ?? "unknown";
    trustCounts[t] = (trustCounts[t] ?? 0) + 1;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* Rolodex sub-header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 16px", borderBottom: "1px solid #27272a", flexShrink: 0 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#71717a" }}>
          {data ? `${data.total} contact${data.total !== 1 ? "s" : ""}` : "…"}
        </span>
        {activeTag && <span style={{ fontSize: 11, color: "#a1a1aa" }}>tag: <b>{activeTag}</b></span>}
        {activeTrust && <span style={{ fontSize: 11, color: "#a1a1aa" }}>trust: <b>{activeTrust}</b></span>}
        <button className="btn-new" style={{ marginLeft: "auto" }} onClick={() => setFormMode("new")}>
          + New Contact
        </button>
      </div>

      {/* Main layout */}
      <div className="rolodex-main">
        {/* Filter sidebar */}
        <div className={`filter-panel${mobileFiltersOpen ? " mobile-open" : ""}`}>
          <div className="filter-panel-label">Trust</div>
          <button className={`filter-btn ${!activeTrust ? "active" : ""}`} onClick={() => setActiveTrust(null)}>All</button>
          {TRUST_LEVELS.map(level => (
            <button
              key={level}
              className={`filter-btn ${activeTrust === level ? "active" : ""}`}
              onClick={() => setActiveTrust(activeTrust === level ? null : level)}
            >
              {level}
              {trustCounts[level] != null && <span className="filter-count">{trustCounts[level]}</span>}
            </button>
          ))}

          {allTags.length > 0 && (
            <>
              <div className="filter-panel-label">Tags</div>
              <button className={`filter-btn ${!activeTag ? "active" : ""}`} onClick={() => setActiveTag(null)}>All</button>
              {allTags.map(tag => (
                <button
                  key={tag}
                  className={`filter-btn ${activeTag === tag ? "active" : ""}`}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                >
                  {tag}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Contact list panel */}
        <div className="contact-list-panel">
          <div className="search-bar">
            <button
              className={`filter-toggle-btn${(activeTag || activeTrust) ? " filter-toggle-btn--active" : ""}`}
              onClick={() => setMobileFiltersOpen(v => !v)}
              aria-label="Toggle filters"
            >
              {mobileFiltersOpen ? "Hide" : "Filter"}
              {(activeTag || activeTrust) && <span className="filter-active-pip" />}
            </button>
            <input
              ref={searchRef}
              type="search"
              className="search-input"
              placeholder="Search contacts…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search contacts"
            />
            {!loading && <span className="search-count">{contacts.length} result{contacts.length !== 1 ? "s" : ""}</span>}
          </div>

          <div className="contact-list" role="list">
            {loading && contacts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">⌛</div>
                <div>Loading…</div>
              </div>
            ) : contacts.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <div>No contacts found</div>
                <button className="btn-new" style={{ marginTop: 12 }} onClick={() => setFormMode("new")}>
                  + Add Contact
                </button>
              </div>
            ) : (
              contacts.map(c => (
                <div
                  key={c.id}
                  className={`contact-row ${selected?.id === c.id ? "selected" : ""}`}
                  role="listitem"
                  tabIndex={0}
                  onClick={() => setSelected(c)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setSelected(c); }}
                >
                  <div className="contact-avatar">{initials(c.name)}</div>
                  <div className="contact-info">
                    <div className="contact-name">{c.name}</div>
                    <div className="contact-sub">
                      {(c.emails?.[0] ?? c.domains?.[0]) ? (
                        <CopyableValue value={c.emails?.[0] ?? c.domains?.[0] ?? ""} stopProp />
                      ) : ""}
                    </div>
                  </div>
                  <div className="contact-right">
                    <span className={trustClass(c.trustStatus)}>{trustLabel(c.trustStatus)}</span>
                    {(c.tags?.length ?? 0) > 0 && (
                      <div className="contact-tags">
                        {c.tags!.slice(0, 2).map(t => <span key={t} className="tag">{t}</span>)}
                        {c.tags!.length > 2 && <span className="tag">+{c.tags!.length - 2}</span>}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* View modal */}
      <ContactModal contact={selected} onClose={() => setSelected(null)} onEdit={handleEdit} onDelete={handleDelete} />

      {/* Create/Edit form modal */}
      <ContactFormModal editing={formMode} onClose={() => setFormMode(null)} onSaved={handleSaved} />
    </div>
  );
}
