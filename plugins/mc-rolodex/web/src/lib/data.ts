/**
 * data.ts — contact data access layer for mc-rolodex web UI.
 * Reads and writes contacts.json on disk.
 */

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
  return path.join(stateDir, "rolodex", "contacts.json");
}

function loadContacts(): Contact[] {
  const p = resolveStoragePath();
  if (!fs.existsSync(p)) return [];
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as Contact[];
  } catch {
    return [];
  }
}

function saveContacts(contacts: Contact[]): void {
  const p = resolveStoragePath();
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(contacts, null, 2), "utf8");
}

export function getAllContacts(): Contact[] {
  return loadContacts();
}

export function getContactById(id: string): Contact | null {
  return loadContacts().find(c => c.id === id) ?? null;
}

export function createContact(data: Omit<Contact, "id">): Contact {
  const contacts = loadContacts();
  const contact: Contact = { ...data, id: crypto.randomUUID() };
  contacts.push(contact);
  saveContacts(contacts);
  return contact;
}

export function updateContact(id: string, data: Partial<Omit<Contact, "id">>): Contact | null {
  const contacts = loadContacts();
  const idx = contacts.findIndex(c => c.id === id);
  if (idx === -1) return null;
  contacts[idx] = { ...contacts[idx], ...data };
  saveContacts(contacts);
  return contacts[idx];
}

export function deleteContact(id: string): boolean {
  const contacts = loadContacts();
  const idx = contacts.findIndex(c => c.id === id);
  if (idx === -1) return false;
  contacts.splice(idx, 1);
  saveContacts(contacts);
  return true;
}

export function searchContacts(q: string): Contact[] {
  if (!q.trim()) return loadContacts();
  const query = q.toLowerCase();
  const contacts = loadContacts();

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
  const contacts = loadContacts();
  const tags = new Set<string>();
  for (const c of contacts) {
    for (const t of c.tags ?? []) tags.add(t);
  }
  return Array.from(tags).sort();
}
