/**
 * SearchEngine unit tests
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SearchEngine } from './engine.js';
import type { Contact } from './types.js';

let tmpDir: string;
let storagePath: string;
let engine: SearchEngine;

const alice: Contact = {
  id: 'c_alice',
  name: 'Alice Johnson',
  emails: ['alice@example.com', 'alice.j@work.com'],
  phones: ['+1 512 555 1000'],
  tags: ['work', 'engineering'],
  domains: ['example.com'],
  trustStatus: 'verified',
};

const bob: Contact = {
  id: 'c_bob',
  name: 'Bob Smith',
  emails: ['bob@acme.org'],
  phones: ['+1 415 555 2000'],
  tags: ['partner', 'sales'],
  trustStatus: 'pending',
};

const carol: Contact = {
  id: 'c_carol',
  name: 'Carol White',
  emails: ['carol@example.com'],
  tags: ['work'],
  trustStatus: 'unknown',
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rolodex-test-'));
  storagePath = path.join(tmpDir, 'contacts.json');
  engine = new SearchEngine(storagePath);
  engine.add(alice);
  engine.add(bob);
  engine.add(carol);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---- getAll / getById ----

describe('getAll', () => {
  it('returns all contacts', () => {
    expect(engine.getAll()).toHaveLength(3);
  });
});

describe('getById', () => {
  it('returns contact by id', () => {
    const contact = engine.getById('c_alice');
    expect(contact?.name).toBe('Alice Johnson');
  });

  it('returns null for unknown id', () => {
    expect(engine.getById('c_nobody')).toBeNull();
  });
});

// ---- search by name ----

describe('search by name', () => {
  it('exact match returns high score', () => {
    const results = engine.search({ text: 'Alice Johnson', type: 'name' });
    expect(results).toHaveLength(1);
    expect(results[0]!.contact.id).toBe('c_alice');
    expect(results[0]!.score).toBe(100);
  });

  it('partial name match returns results', () => {
    const results = engine.search({ text: 'Alice', type: 'name' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.contact.id).toBe('c_alice');
  });

  it('no name match returns empty', () => {
    const results = engine.search({ text: 'Zara', type: 'name' });
    expect(results).toHaveLength(0);
  });
});

// ---- search by email ----

describe('search by email', () => {
  it('finds contact by email substring', () => {
    const results = engine.search({ text: 'alice@example.com', type: 'email' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.contact.id).toBe('c_alice');
  });

  it('finds by partial email', () => {
    const results = engine.search({ text: 'bob@acme', type: 'email' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.contact.id).toBe('c_bob');
  });

  it('returns empty for no match', () => {
    const results = engine.search({ text: 'nobody@nowhere.com', type: 'email' });
    expect(results).toHaveLength(0);
  });
});

// ---- search by tag ----

describe('search by tag', () => {
  it('finds all contacts with a given tag', () => {
    const results = engine.search({ text: 'work', type: 'tag' });
    expect(results).toHaveLength(2);
    const ids = results.map(r => r.contact.id);
    expect(ids).toContain('c_alice');
    expect(ids).toContain('c_carol');
  });

  it('returns empty for unknown tag', () => {
    const results = engine.search({ text: 'vip', type: 'tag' });
    expect(results).toHaveLength(0);
  });
});

// ---- search by domain ----

describe('search by domain', () => {
  it('finds contacts whose email matches domain', () => {
    const results = engine.search({ text: 'example.com', type: 'domain' });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map(r => r.contact.id);
    expect(ids).toContain('c_alice');
    expect(ids).toContain('c_carol');
  });

  it('returns empty for unknown domain', () => {
    const results = engine.search({ text: 'nowhere.io', type: 'domain' });
    expect(results).toHaveLength(0);
  });
});

// ---- multi search ----

describe('multi search', () => {
  it('finds by name in multi mode', () => {
    const results = engine.search({ text: 'Bob' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.contact.id).toBe('c_bob');
  });
});

// ---- limit ----

describe('limit', () => {
  it('respects limit option', () => {
    const results = engine.search({ text: 'work', type: 'tag', limit: 1 });
    expect(results).toHaveLength(1);
  });
});

// ---- persistence ----

describe('persistence', () => {
  it('saves and reloads contacts', () => {
    const engine2 = new SearchEngine(storagePath);
    expect(engine2.getAll()).toHaveLength(3);
    expect(engine2.getById('c_alice')?.name).toBe('Alice Johnson');
  });
});

// ---- update / delete ----

describe('update', () => {
  it('updates contact fields', () => {
    engine.update('c_alice', { notes: 'CTO' });
    expect(engine.getById('c_alice')?.notes).toBe('CTO');
  });
});

describe('delete', () => {
  it('removes contact', () => {
    engine.delete('c_bob');
    expect(engine.getById('c_bob')).toBeNull();
    expect(engine.getAll()).toHaveLength(2);
  });
});

// ---- concurrent access ----

describe('concurrent-safe add', () => {
  it('two engines adding to the same file preserves both contacts', () => {
    // Simulate two separate CLI processes with separate SearchEngine instances
    const engine1 = new SearchEngine(storagePath);
    const engine2 = new SearchEngine(storagePath);

    const dave: Contact = {
      id: 'c_dave',
      name: 'Dave Brown',
      emails: ['dave@example.com'],
      tags: ['friend'],
      trustStatus: 'unknown',
    };

    const eve: Contact = {
      id: 'c_eve',
      name: 'Eve Green',
      emails: ['eve@example.com'],
      tags: ['work'],
      trustStatus: 'pending',
    };

    // engine1 adds dave, writes to disk
    engine1.add(dave);

    // engine2 adds eve — must reload from disk first to see dave
    engine2.add(eve);

    // Verify: a fresh engine should see all 5 contacts (alice, bob, carol + dave + eve)
    const engine3 = new SearchEngine(storagePath);
    const all = engine3.getAll();
    expect(all).toHaveLength(5);
    const ids = all.map(c => c.id);
    expect(ids).toContain('c_dave');
    expect(ids).toContain('c_eve');
  });
});
