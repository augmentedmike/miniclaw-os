#!/usr/bin/env node
/**
 * Migrate contacts from contacts.json (contactMethods format) into SQLite DB.
 * Handles both the top-level user contacts.json and the rolodex/contacts.json.
 */
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const STATE = process.env.MINICLAW_STATE_DIR ?? process.env.OPENCLAW_STATE_DIR ?? join(homedir(), ".miniclaw");
const DB_PATH = join(STATE, "user/augmentedmike_bot/rolodex/contacts.db");

// Source files to try (in priority order)
const SOURCES = [
  join(STATE, "user/augmentedmike_bot/contacts.json"),
  join(STATE, "user/augmentedmike_bot/rolodex/contacts.json"),
];

mkdirSync(join(STATE, "user/augmentedmike_bot/rolodex"), { recursive: true });

const db = new Database(DB_PATH);
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

const insert = db.prepare(`
  INSERT OR REPLACE INTO contacts (id, name, emails, phones, domains, tags, trust_status, last_verified, notes)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let totalMigrated = 0;

for (const src of SOURCES) {
  if (!existsSync(src)) {
    console.log(`Skipping (not found): ${src}`);
    continue;
  }
  const raw = readFileSync(src, "utf8");
  let data;
  try { data = JSON.parse(raw); } catch { console.log(`Skipping (invalid JSON): ${src}`); continue; }

  // Support both formats: array of contacts, or {contacts: [...]}
  const contacts = Array.isArray(data) ? data : (Array.isArray(data.contacts) ? data.contacts : []);
  if (contacts.length === 0) { console.log(`Skipping (no contacts): ${src}`); continue; }

  console.log(`Migrating ${contacts.length} contacts from ${src}`);

  const insertMany = db.transaction((rows) => {
    for (const c of rows) {
      // Extract emails, phones, domains from contactMethods if present
      const emails = [];
      const phones = [];
      const domains = [];

      if (Array.isArray(c.contactMethods)) {
        for (const m of c.contactMethods) {
          if (m.type === "email") emails.push(m.value);
          else if (m.type === "phone" || m.type === "telegram") phones.push(m.value);
          else if (m.type === "domain") domains.push(m.value);
        }
      }
      // Also handle direct arrays
      if (Array.isArray(c.emails)) emails.push(...c.emails.filter(e => !emails.includes(e)));
      if (Array.isArray(c.phones)) phones.push(...c.phones.filter(p => !phones.includes(p)));
      if (Array.isArray(c.domains)) domains.push(...c.domains.filter(d => !domains.includes(d)));

      const trustStatus = c.trustStatus || c.verificationStatus || "unknown";
      const lastVerified = c.lastVerified || c.verifiedTimestamp || null;
      const tags = Array.isArray(c.tags) ? c.tags : [];

      insert.run(
        c.id || Math.random().toString(36).slice(2),
        c.name || "Unknown",
        JSON.stringify(emails),
        JSON.stringify(phones),
        JSON.stringify(domains),
        JSON.stringify(tags),
        trustStatus,
        lastVerified,
        c.notes || "",
      );
    }
  });

  insertMany(contacts);
  totalMigrated += contacts.length;
  console.log(`  Done.`);
}

const count = db.prepare("SELECT COUNT(*) as n FROM contacts").get();
console.log(`\nMigration complete. DB now has ${count.n} contacts (migrated ${totalMigrated} this run).`);
db.close();
