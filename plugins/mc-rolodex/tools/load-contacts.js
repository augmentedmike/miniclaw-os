#!/usr/bin/env node

/**
 * Load sample contacts from workspace identity files into mc-rolodex
 * Usage: node tools/load-contacts.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CONTACTS_DIR = path.join(process.env.HOME, '.miniclaw', 'rolodex');
const CONTACTS_FILE = path.join(CONTACTS_DIR, 'contacts.json');

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
    console.log(`✓ Created ${CONTACTS_DIR}`);
  }

  // Check if contacts file already exists
  let existing = [];
  if (fs.existsSync(CONTACTS_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
      console.log(`✓ Loaded ${existing.length} existing contacts`);
    } catch (err) {
      console.warn(`⚠ Failed to parse existing contacts: ${err.message}`);
    }
  }

  // Merge with sample contacts (deduplicate by id)
  const contactMap = new Map();
  existing.forEach(c => contactMap.set(c.id, c));
  sampleContacts.forEach(c => contactMap.set(c.id, c));

  const merged = Array.from(contactMap.values());

  // Write back
  fs.writeFileSync(CONTACTS_FILE, JSON.stringify(merged, null, 2), 'utf8');
  console.log(`✓ Wrote ${merged.length} contacts to ${CONTACTS_FILE}`);

  // Test search
  console.log('\n📋 Sample contacts loaded:');
  merged.forEach(c => {
    const emails = c.emails?.join(', ') || '(none)';
    console.log(`  - ${c.name} <${emails}> [${c.trustStatus}]`);
  });

  console.log('\n💡 Try: npx mc-rolodex search michael');
}

loadContacts();
