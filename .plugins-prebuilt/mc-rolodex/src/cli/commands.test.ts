/**
 * CLI smoke tests for mc-rolodex commands
 *
 * Strategy: build a real commander program + SearchEngine in a tmp dir,
 * drive commands via program.parseAsync, capture stdout/stderr with spies.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Command } from 'commander';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { registerRolodexCommands } from './commands.js';
import { SearchEngine } from '../search/engine.js';

// ---- Test harness ----

let tmpDir: string;
let storagePath: string;
let engine: SearchEngine;
let program: Command;
let stdoutSpy: MockInstance;
let stderrSpy: MockInstance;
let exitSpy: MockInstance;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rolodex-cli-test-'));
  storagePath = path.join(tmpDir, 'contacts.json');
  engine = new SearchEngine(storagePath);

  program = new Command();
  program.exitOverride();
  registerRolodexCommands(
    {
      program,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    },
    engine,
  );

  stdoutSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  exitSpy = vi.spyOn(process, 'exit').mockImplementation((_code?: number) => {
    throw new Error(`process.exit(${_code})`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function run(...args: string[]): Promise<void> {
  await program.parseAsync(['node', 'cli', ...args]);
}

function allOut(): string {
  return stdoutSpy.mock.calls.map(c => String(c[0])).join('\n');
}

function allErr(): string {
  return stderrSpy.mock.calls.map(c => String(c[0])).join('\n');
}

// ---- add ----

describe('mc-rolodex add', () => {
  it('adds a contact via JSON string', async () => {
    await run('mc-rolodex', 'add', '{"id":"c1","name":"Alice","emails":["alice@example.com"],"tags":["work"]}');
    expect(allOut()).toMatch(/Added: Alice/);
    expect(engine.getById('c1')?.name).toBe('Alice');
  });

  it('auto-assigns id if missing', async () => {
    await run('mc-rolodex', 'add', '{"name":"Bob","emails":["bob@test.com"]}');
    expect(allOut()).toMatch(/Added: Bob/);
    const all = engine.getAll();
    expect(all.some(c => c.name === 'Bob')).toBe(true);
  });

  it('errors on missing name', async () => {
    await expect(run('mc-rolodex', 'add', '{"id":"c2"}')).rejects.toThrow();
    expect(allErr()).toMatch(/name/);
  });

  it('errors on invalid JSON', async () => {
    await expect(run('mc-rolodex', 'add', 'not-json')).rejects.toThrow();
    expect(allErr()).toMatch(/Error/);
  });
});

// ---- search ----

describe('mc-rolodex search (smoke: add then search)', () => {
  beforeEach(async () => {
    await run('mc-rolodex', 'add', '{"id":"c_alice","name":"Alice","emails":["alice@example.com"],"tags":["work"]}');
    await run('mc-rolodex', 'add', '{"id":"c_bob","name":"Bob Smith","emails":["bob@acme.org"],"tags":["partner"]}');
    stdoutSpy.mockClear();
  });

  it('finds contact by name', async () => {
    await run('mc-rolodex', 'search', 'Alice');
    expect(allOut()).toContain('Alice');
  });

  it('finds contact by email', async () => {
    await run('mc-rolodex', 'search', 'bob@acme', '--type', 'email');
    expect(allOut()).toContain('Bob');
  });

  it('finds contact by tag', async () => {
    await run('mc-rolodex', 'search', 'work', '--type', 'tag');
    expect(allOut()).toContain('Alice');
  });

  it('shows no-results message when not found', async () => {
    await run('mc-rolodex', 'search', 'Zara');
    expect(allOut()).toContain('No contacts found');
  });

  it('json output', async () => {
    await run('mc-rolodex', 'search', 'Alice', '--json');
    const out = allOut();
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].contact.name).toBe('Alice');
  });
});

// ---- list ----

describe('mc-rolodex list', () => {
  beforeEach(async () => {
    await run('mc-rolodex', 'add', '{"id":"c1","name":"Alice","tags":["work"]}');
    await run('mc-rolodex', 'add', '{"id":"c2","name":"Bob","tags":["partner"]}');
    stdoutSpy.mockClear();
  });

  it('lists all contacts', async () => {
    await run('mc-rolodex', 'list');
    const out = allOut();
    expect(out).toContain('Alice');
    expect(out).toContain('Bob');
  });

  it('filters by tag', async () => {
    await run('mc-rolodex', 'list', '--tag', 'work');
    const out = allOut();
    expect(out).toContain('Alice');
    expect(out).not.toContain('Bob');
  });

  it('shows empty message when no contacts', async () => {
    engine.delete('c1');
    engine.delete('c2');
    stdoutSpy.mockClear();
    await run('mc-rolodex', 'list');
    expect(allOut()).toContain('No contacts found');
  });
});

// ---- show ----

describe('mc-rolodex show', () => {
  beforeEach(async () => {
    await run('mc-rolodex', 'add', '{"id":"c_alice","name":"Alice","emails":["alice@example.com"],"trustStatus":"verified"}');
    stdoutSpy.mockClear();
  });

  it('shows contact details', async () => {
    await run('mc-rolodex', 'show', 'c_alice');
    const out = allOut();
    expect(out).toContain('Alice');
    expect(out).toContain('alice@example.com');
  });

  it('errors on unknown id', async () => {
    await expect(run('mc-rolodex', 'show', 'c_nobody')).rejects.toThrow();
    expect(allErr()).toMatch(/not found/i);
  });
});

// ---- delete ----

describe('mc-rolodex delete', () => {
  beforeEach(async () => {
    await run('mc-rolodex', 'add', '{"id":"c1","name":"Alice"}');
    stdoutSpy.mockClear();
  });

  it('deletes a contact', async () => {
    await run('mc-rolodex', 'delete', 'c1');
    expect(allOut()).toMatch(/Deleted: Alice/);
    expect(engine.getById('c1')).toBeNull();
  });

  it('errors on unknown id', async () => {
    await expect(run('mc-rolodex', 'delete', 'c_nobody')).rejects.toThrow();
    expect(allErr()).toMatch(/not found/i);
  });
});
