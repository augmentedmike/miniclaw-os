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

// Sample contacts based on IDENTITY.md, TOOLS.md, USER.md
const sampleContacts = [
  {
    id: 'michael-oneal',
    name: 'Michael ONeal',
    emails: ['michael@claimhawk.app'],
    phones: [],
    domains: ['claimhawk.app'],
    tags: ['founder', 'personal', 'primary'],
    trustStatus: 'verified',
    lastVerified: new Date().toISOString(),
    notes: 'Co-founder of MiniClaw, 30-year engineer'
  },
  {
    id: 'monserrat-martinez',
    name: 'Monserrat Martinez',
    emails: ['monse13.glez@gmail.com'],
    phones: [],
    domains: ['gmail.com'],
    tags: ['personal', 'spouse'],
    trustStatus: 'verified',
    lastVerified: new Date().toISOString(),
    notes: 'Michaels wife'
  },
  {
    id: 'augmented-ryan',
    name: 'Augmented Ryan',
    emails: ['augmentedryan@agentmail.to'],
    phones: [],
    domains: ['agentmail.to'],
    tags: ['collaborator', 'digital-persona', 'work'],
    trustStatus: 'verified',
    lastVerified: new Date().toISOString(),
    notes: 'Digital companion collaborating on MiniClaw'
  },
  {
    id: 'ryan-person',
    name: 'Ryan',
    emails: [],
    phones: [],
    domains: [],
    tags: ['collaborator', 'human'],
    trustStatus: 'pending',
    lastVerified: null,
    notes: 'Human collaborator (augmented-ryan@agentmail.to)'
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
