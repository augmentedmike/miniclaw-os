/**
 * data.ts — contact data access layer for mc-rolodex web UI.
 * Reads and writes contacts.db (SQLite).
 */

import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export interface Contact {
  id: string;
  name: string;
  emails?: string[];
  phones?: string[];
  domains?: string[];
  tags?: string[];
  trustStatus?: "verified" | "untrusted" | "pending" | "unknown";
  lastVerified?: string;
  notes?: string;
}

function resolveStoragePath(): string {
  if (process.env.ROLODEX_STORAGE_PATH) return process.env.ROLODEX_STORAGE_PATH;
  const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(os.homedir(), ".openclaw");
  return path.join(stateDir, "USER", "rolodex", "contacts.db");
}

function openDb(): Database.Database {
  const p = resolveStoragePath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(p);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      emails TEXT NOT NULL DEFAULT '[]',
      phones TEXT NOT NULL DEFAULT '[]',
      domains TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      trust_status TEXT NOT NULL DEFAULT 'unknown',
      last_verified TEXT,
      notes TEXT NOT NULL DEFAULT ''
    )
  `);
  return db;
}

function rowToContact(row: Record<string, unknown>): Contact {
  return {
    id: row.id as string,
    name: row.name as string,
    emails: JSON.parse((row.emails as string) || "[]"),
    phones: JSON.parse((row.phones as string) || "[]"),
    domains: JSON.parse((row.domains as string) || "[]"),
    tags: JSON.parse((row.tags as string) || "[]"),
    trustStatus: (row.trust_status as Contact["trustStatus"]) || "unknown",
    lastVerified: (row.last_verified as string) || undefined,
    notes: (row.notes as string) || undefined,
  };
}

export function getAllContacts(): Contact[] {
  const db = openDb();
  try {
    const rows = db.prepare("SELECT * FROM contacts").all() as Record<string, unknown>[];
    return rows.map(rowToContact);
  } finally {
    db.close();
  }
}

export function getContactById(id: string): Contact | null {
  const db = openDb();
  try {
    const row = db.prepare("SELECT * FROM contacts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? rowToContact(row) : null;
  } finally {
    db.close();
  }
}

export function createContact(data: Omit<Contact, "id">): Contact {
  const contact: Contact = { ...data, id: crypto.randomUUID() };
  const db = openDb();
  try {
    db.prepare(`
      INSERT INTO contacts (id, name, emails, phones, domains, tags, trust_status, last_verified, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      contact.id,
      contact.name,
      JSON.stringify(contact.emails || []),
      JSON.stringify(contact.phones || []),
      JSON.stringify(contact.domains || []),
      JSON.stringify(contact.tags || []),
      contact.trustStatus || "unknown",
      contact.lastVerified || null,
      contact.notes || "",
    );
    return contact;
  } finally {
    db.close();
  }
}

export function updateContact(id: string, data: Partial<Omit<Contact, "id">>): Contact | null {
  const db = openDb();
  try {
    const existing = db.prepare("SELECT * FROM contacts WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!existing) return null;
    const current = rowToContact(existing);
    const updated = { ...current, ...data };
    db.prepare(`
      UPDATE contacts SET name=?, emails=?, phones=?, domains=?, tags=?, trust_status=?, last_verified=?, notes=?
      WHERE id=?
    `).run(
      updated.name,
      JSON.stringify(updated.emails || []),
      JSON.stringify(updated.phones || []),
      JSON.stringify(updated.domains || []),
      JSON.stringify(updated.tags || []),
      updated.trustStatus || "unknown",
      updated.lastVerified || null,
      updated.notes || "",
      id,
    );
    return updated;
  } finally {
    db.close();
  }
}

export function deleteContact(id: string): boolean {
  const db = openDb();
  try {
    const result = db.prepare("DELETE FROM contacts WHERE id = ?").run(id);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

export function searchContacts(q: string): Contact[] {
  if (!q.trim()) return getAllContacts();
  const query = q.toLowerCase();
  const contacts = getAllContacts();

  const scored: { contact: Contact; score: number }[] = [];

  for (const c of contacts) {
    let score = 0;

    // Name match
    const nameLower = c.name.toLowerCase();
    if (nameLower === query) score = Math.max(score, 100);
    else if (nameLower.startsWith(query)) score = Math.max(score, 80);
    else if (nameLower.includes(query)) score = Math.max(score, 60);

    // Email match
    for (const e of c.emails ?? []) {
      const el = e.toLowerCase();
      if (el.includes(query)) score = Math.max(score, el.startsWith(query) ? 85 : 70);
    }

    // Tag match
    for (const t of c.tags ?? []) {
      if (t.toLowerCase().includes(query)) score = Math.max(score, 75);
    }

    // Domain match
    for (const d of c.domains ?? []) {
      if (d.toLowerCase().includes(query)) score = Math.max(score, 65);
    }

    // Phone match (digits only)
    const digits = query.replace(/\D/g, "");
    if (digits.length >= 3) {
      for (const p of c.phones ?? []) {
        if (p.replace(/\D/g, "").includes(digits)) score = Math.max(score, 90);
      }
    }

    if (score > 0) scored.push({ contact: c, score });
  }

  return scored.sort((a, b) => b.score - a.score).map(s => s.contact);
}

export function getAllTags(): string[] {
  const contacts = getAllContacts();
  const tags = new Set<string>();
  for (const c of contacts) {
    for (const t of c.tags ?? []) tags.add(t);
  }
  return Array.from(tags).sort();
}
