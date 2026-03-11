/**
 * rolodex.ts — contact data layer for mc-board web UI.
 * Stores contacts in SQLite at $OPENCLAW_STATE_DIR/USER/<bot>/rolodex/contacts.db
 * Migrates from contacts.json on first open if DB is empty.
 */

import Database from "better-sqlite3";
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

interface ContactRow {
  id: string;
  name: string;
  emails: string;
  phones: string;
  domains: string;
  tags: string;
  trust_status: string;
  last_verified: string | null;
  notes: string;
}

function resolveDbPath(): string {
  if (process.env.ROLODEX_DB_PATH) return process.env.ROLODEX_DB_PATH;
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".miniclaw");
  return path.join(stateDir, "USER/augmentedmike_bot/rolodex/contacts.db");
}

function resolveJsonPath(): string {
  if (process.env.ROLODEX_STORAGE_PATH) return process.env.ROLODEX_STORAGE_PATH;
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".miniclaw");
  // Check new location first, then fall back to legacy
  const newPath = path.join(stateDir, "USER/augmentedmike_bot/rolodex/contacts.json");
  if (fs.existsSync(newPath)) return newPath;
  return path.join(os.homedir(), ".miniclaw", "rolodex", "contacts.json");
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = resolveDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
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

  // Migrate from JSON if table is empty
  const count = (db.prepare("SELECT COUNT(*) as n FROM contacts").get() as { n: number }).n;
  if (count === 0) {
    migrateFromJson(db);
  }

  _db = db;
  return db;
}

function migrateFromJson(db: Database.Database): void {
  const jsonPath = resolveJsonPath();
  if (!fs.existsSync(jsonPath)) return;
  try {
    const raw = fs.readFileSync(jsonPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    // Support both flat array and nested {version, contacts: [...]} formats
    let rows: Array<Record<string, unknown>>;
    if (Array.isArray(parsed)) {
      rows = parsed as Array<Record<string, unknown>>;
    } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>).contacts)) {
      rows = (parsed as { contacts: Array<Record<string, unknown>> }).contacts;
    } else {
      return;
    }

    if (rows.length === 0) return;

    const insert = db.prepare(`
      INSERT OR IGNORE INTO contacts (id, name, emails, phones, domains, tags, trust_status, last_verified, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((contacts: Array<Record<string, unknown>>) => {
      for (const c of contacts) {
        // Support both flat emails/phones arrays and contactMethods format
        let emails: string[] = [];
        let phones: string[] = [];
        if (Array.isArray(c.emails)) {
          emails = c.emails as string[];
        } else if (Array.isArray(c.contactMethods)) {
          const methods = c.contactMethods as Array<{ type: string; value: string }>;
          emails = methods.filter(m => m.type === "email").map(m => m.value);
          phones = methods.filter(m => m.type === "phone" || m.type === "telegram").map(m => m.value);
        }
        if (Array.isArray(c.phones)) phones = c.phones as string[];

        insert.run(
          (c.id as string) || crypto.randomUUID(),
          (c.name as string) || "Unknown",
          JSON.stringify(emails),
          JSON.stringify(phones),
          JSON.stringify(Array.isArray(c.domains) ? c.domains : []),
          JSON.stringify(Array.isArray(c.tags) ? c.tags : []),
          (c.verificationStatus as string) || (c.trustStatus as string) || "unknown",
          (c.verifiedTimestamp as string) || (c.lastVerified as string) || null,
          (c.notes as string) || "",
        );
      }
    });
    insertMany(rows);
  } catch {
    // migration failure is non-fatal
  }
}

function rowToContact(row: ContactRow): Contact {
  return {
    id: row.id,
    name: row.name,
    emails: JSON.parse(row.emails) as string[],
    phones: JSON.parse(row.phones) as string[],
    domains: JSON.parse(row.domains) as string[],
    tags: JSON.parse(row.tags) as string[],
    trustStatus: (row.trust_status as Contact["trustStatus"]) || "unknown",
    lastVerified: row.last_verified ?? undefined,
    notes: row.notes,
  };
}

export function getAllContacts(): Contact[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM contacts ORDER BY name ASC").all() as ContactRow[];
  return rows.map(rowToContact);
}

export function getContactById(id: string): Contact | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM contacts WHERE id = ?").get(id) as ContactRow | undefined;
  return row ? rowToContact(row) : null;
}

export function createContact(data: Omit<Contact, "id">): Contact {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO contacts (id, name, emails, phones, domains, tags, trust_status, last_verified, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    JSON.stringify(data.emails ?? []),
    JSON.stringify(data.phones ?? []),
    JSON.stringify(data.domains ?? []),
    JSON.stringify(data.tags ?? []),
    data.trustStatus ?? "unknown",
    data.lastVerified ?? null,
    data.notes ?? "",
  );
  return getContactById(id)!;
}

export function updateContact(id: string, data: Partial<Omit<Contact, "id">>): Contact | null {
  const db = getDb();
  const existing = getContactById(id);
  if (!existing) return null;

  const merged = {
    name: data.name ?? existing.name,
    emails: data.emails ?? existing.emails,
    phones: data.phones ?? existing.phones,
    domains: data.domains ?? existing.domains,
    tags: data.tags ?? existing.tags,
    trustStatus: data.trustStatus ?? existing.trustStatus,
    lastVerified: data.lastVerified !== undefined ? data.lastVerified : existing.lastVerified,
    notes: data.notes !== undefined ? data.notes : existing.notes,
  };

  db.prepare(`
    UPDATE contacts SET name=?, emails=?, phones=?, domains=?, tags=?, trust_status=?, last_verified=?, notes=? WHERE id=?
  `).run(
    merged.name,
    JSON.stringify(merged.emails),
    JSON.stringify(merged.phones),
    JSON.stringify(merged.domains),
    JSON.stringify(merged.tags),
    merged.trustStatus,
    merged.lastVerified ?? null,
    merged.notes,
    id,
  );
  return getContactById(id);
}

export function deleteContact(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM contacts WHERE id = ?").run(id);
  return result.changes > 0;
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
  const contacts = getAllContacts();
  const tags = new Set<string>();
  for (const c of contacts) {
    for (const t of c.tags) tags.add(t);
  }
  return Array.from(tags).sort();
}
