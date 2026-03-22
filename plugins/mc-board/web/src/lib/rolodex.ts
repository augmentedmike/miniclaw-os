/**
 * rolodex.ts — contact data layer for mc-board web UI.
 * Reads/writes contacts.json at $OPENCLAW_STATE_DIR/USER/rolodex/contacts.json
 * — the same file used by the CLI (mc-rolodex), ensuring a single source of truth.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import * as crypto from "node:crypto";

export interface Contact {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  domains: string[];
  tags: string[];
  trustStatus: "verified" | "pending" | "untrusted" | "unknown";
  lastVerified?: string;
  notes: string;
}

function resolveJsonPath(): string {
  if (process.env.ROLODEX_STORAGE_PATH) return process.env.ROLODEX_STORAGE_PATH;
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
  const jsonPath = path.join(stateDir, "USER", "rolodex", "contacts.json");
  const dir = path.dirname(jsonPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return jsonPath;
}

/**
 * Load all contacts from disk. Always reads fresh from disk to pick up
 * CLI changes immediately (no caching).
 */
function loadContacts(): Contact[] {
  const jsonPath = resolveJsonPath();
  if (!fs.existsSync(jsonPath)) return [];
  try {
    const raw = fs.readFileSync(jsonPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    let rows: Array<Record<string, unknown>>;
    if (Array.isArray(parsed)) {
      rows = parsed as Array<Record<string, unknown>>;
    } else if (
      parsed &&
      typeof parsed === "object" &&
      Array.isArray((parsed as Record<string, unknown>).contacts)
    ) {
      rows = (parsed as { contacts: Array<Record<string, unknown>> }).contacts;
    } else {
      return [];
    }

    return rows.map(normalizeContact);
  } catch {
    return [];
  }
}

/**
 * Normalize a raw JSON object into the Contact interface,
 * handling optional fields and legacy contactMethods format.
 */
function normalizeContact(raw: Record<string, unknown>): Contact {
  let emails: string[] = [];
  let phones: string[] = [];

  if (Array.isArray(raw.emails)) {
    emails = raw.emails as string[];
  } else if (Array.isArray(raw.contactMethods)) {
    const methods = raw.contactMethods as Array<{ type: string; value: string }>;
    emails = methods.filter(m => m.type === "email").map(m => m.value);
    phones = methods.filter(m => m.type === "phone" || m.type === "telegram").map(m => m.value);
  }
  if (Array.isArray(raw.phones)) phones = raw.phones as string[];

  return {
    id: (raw.id as string) || crypto.randomUUID(),
    name: (raw.name as string) || "Unknown",
    emails,
    phones,
    domains: Array.isArray(raw.domains) ? (raw.domains as string[]) : [],
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    trustStatus:
      ((raw.trustStatus as string) ||
        (raw.verificationStatus as string) ||
        "unknown") as Contact["trustStatus"],
    lastVerified:
      (raw.lastVerified as string) || (raw.verifiedTimestamp as string) || undefined,
    notes: (raw.notes as string) || "",
  };
}

/**
 * Save all contacts to disk as a flat JSON array — the format the CLI expects.
 */
function saveContacts(contacts: Contact[]): void {
  const jsonPath = resolveJsonPath();
  const dir = path.dirname(jsonPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(contacts, null, 2), "utf8");
}

export function getContactCount(): number {
  return loadContacts().length;
}

export function getAllContacts(): Contact[] {
  return loadContacts().sort((a, b) => a.name.localeCompare(b.name));
}

export function getContactById(id: string): Contact | null {
  const contacts = loadContacts();
  return contacts.find(c => c.id === id) ?? null;
}

export function createContact(data: Omit<Contact, "id">): Contact {
  const contacts = loadContacts();
  const contact: Contact = {
    id: crypto.randomUUID(),
    name: data.name,
    emails: data.emails ?? [],
    phones: data.phones ?? [],
    domains: data.domains ?? [],
    tags: data.tags ?? [],
    trustStatus: data.trustStatus ?? "unknown",
    lastVerified: data.lastVerified,
    notes: data.notes ?? "",
  };
  contacts.push(contact);
  saveContacts(contacts);
  return contact;
}

export function updateContact(
  id: string,
  data: Partial<Omit<Contact, "id">>,
): Contact | null {
  const contacts = loadContacts();
  const idx = contacts.findIndex(c => c.id === id);
  if (idx === -1) return null;

  const existing = contacts[idx];
  const merged: Contact = {
    id: existing.id,
    name: data.name ?? existing.name,
    emails: data.emails ?? existing.emails,
    phones: data.phones ?? existing.phones,
    domains: data.domains ?? existing.domains,
    tags: data.tags ?? existing.tags,
    trustStatus: data.trustStatus ?? existing.trustStatus,
    lastVerified:
      data.lastVerified !== undefined ? data.lastVerified : existing.lastVerified,
    notes: data.notes !== undefined ? data.notes : existing.notes,
  };

  contacts[idx] = merged;
  saveContacts(contacts);
  return merged;
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
  if (!q.trim()) return getAllContacts();
  const query = q.toLowerCase();
  const contacts = getAllContacts();
  const scored: { contact: Contact; score: number }[] = [];

  for (const c of contacts) {
    let score = 0;
    const nameLower = c.name.toLowerCase();
    if (nameLower === query) score = Math.max(score, 100);
    else if (nameLower.startsWith(query)) score = Math.max(score, 80);
    else if (nameLower.includes(query)) score = Math.max(score, 60);

    for (const e of c.emails) {
      const el = e.toLowerCase();
      if (el.includes(query)) score = Math.max(score, el.startsWith(query) ? 85 : 70);
    }
    for (const t of c.tags) {
      if (t.toLowerCase().includes(query)) score = Math.max(score, 75);
    }
    for (const d of c.domains) {
      if (d.toLowerCase().includes(query)) score = Math.max(score, 65);
    }
    const digits = query.replace(/\D/g, "");
    if (digits.length >= 3) {
      for (const p of c.phones) {
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
    for (const t of c.tags) tags.add(t);
  }
  return Array.from(tags).sort();
}
