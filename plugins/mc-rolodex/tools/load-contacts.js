#!/usr/bin/env node

/**
 * Load sample contacts from workspace identity files into mc-rolodex
 * Usage: node tools/load-contacts.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const STATE_DIR = process.env.OPENCLAW_STATE_DIR || path.join(process.env.HOME, '.openclaw');
const CONTACTS_DIR = path.join(STATE_DIR, 'USER', 'rolodex');
const CONTACTS_DB = path.join(CONTACTS_DIR, 'contacts.db');

// Sample contacts — replace with your own
// Real contacts should be loaded from your local rolodex, not committed to git
const sampleContacts = [
  {
    id: 'example-owner',
    name: 'Jane Doe',
    emails: ['jane@example.com'],
    phones: [],
    domains: ['example.com'],
    tags: ['founder', 'personal', 'primary'],
    trustStatus: 'verified',
    lastVerified: new Date().toISOString(),
    notes: 'Agent owner — replace with your info'
  },
  {
    id: 'example-collaborator',
    name: 'Agent Collaborator',
    emails: ['collab@agentmail.to'],
    phones: [],
    domains: ['agentmail.to'],
    tags: ['collaborator', 'digital-persona', 'work'],
    trustStatus: 'verified',
    lastVerified: new Date().toISOString(),
    notes: 'Digital companion — replace with your agent peers'
  }
];

function loadContacts() {
  // Create directory if it doesn't exist
  if (!fs.existsSync(CONTACTS_DIR)) {
    fs.mkdirSync(CONTACTS_DIR, { recursive: true });
    console.log(`Created ${CONTACTS_DIR}`);
  }

  const db = new Database(CONTACTS_DB);
  db.pragma('journal_mode = WAL');

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

  // Count existing
  const existingCount = db.prepare('SELECT COUNT(*) as cnt FROM contacts').get().cnt;
  console.log(`Loaded ${existingCount} existing contacts`);

  // Upsert sample contacts
  const upsert = db.prepare(`
    INSERT OR REPLACE INTO contacts (id, name, emails, phones, domains, tags, trust_status, last_verified, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const c of sampleContacts) {
    upsert.run(
      c.id,
      c.name,
      JSON.stringify(c.emails || []),
      JSON.stringify(c.phones || []),
      JSON.stringify(c.domains || []),
      JSON.stringify(c.tags || []),
      c.trustStatus || 'unknown',
      c.lastVerified || null,
      c.notes || ''
    );
  }

  const totalCount = db.prepare('SELECT COUNT(*) as cnt FROM contacts').get().cnt;
  console.log(`Wrote ${totalCount} contacts to ${CONTACTS_DB}`);

  // Show sample
  const all = db.prepare('SELECT * FROM contacts').all();
  console.log('\nSample contacts loaded:');
  for (const row of all) {
    const emails = JSON.parse(row.emails || '[]').join(', ') || '(none)';
    console.log(`  - ${row.name} <${emails}> [${row.trust_status}]`);
  }

  console.log('\nTry: npx mc-rolodex search michael');

  db.close();
}

loadContacts();
