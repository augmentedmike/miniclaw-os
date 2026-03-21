# Build Your First Plugin

A step-by-step guide to building a custom MiniClaw plugin from scratch. By the end you will have a working plugin with CLI commands, agent tools, persistence, and tests.

We will build **mc-notes** — a plugin that stores timestamped notes per-topic in flat markdown files.

---

## 1. Scaffold the Plugin Directory

Every MiniClaw plugin lives in `~/.openclaw/miniclaw/plugins/`. Create the directory structure:

```
~/.openclaw/miniclaw/plugins/mc-notes/
├── index.ts                  # Plugin entry point
├── package.json              # npm package metadata
├── openclaw.plugin.json      # Plugin manifest
├── vitest.config.ts          # Test configuration
├── smoke.test.ts             # Smoke tests
├── cli/
│   └── commands.ts           # CLI command registration
└── tools/
    └── definitions.ts        # Agent tool definitions
```

Create the directory:

```bash
mkdir -p ~/.openclaw/miniclaw/plugins/mc-notes/{cli,tools}
```

### Required Files

Every plugin needs three files at minimum:

1. **`package.json`** — declares the package as an ES module and points OpenClaw to the entry point
2. **`openclaw.plugin.json`** — the plugin manifest with metadata and config schema
3. **`index.ts`** — the entry point that registers CLI commands and agent tools

---

## 2. Package Configuration

### package.json

```json
{
  "name": "mc-notes",
  "version": "0.1.0",
  "type": "module",
  "main": "index.ts",
  "description": "Per-topic notes plugin — append-only timestamped markdown files",
  "openclaw": {
    "extensions": [
      "./index.ts"
    ]
  }
}
```

Key fields:

| Field | Purpose |
|---|---|
| `"type": "module"` | Required — OpenClaw plugins use ES modules |
| `"main": "index.ts"` | Entry point for the plugin |
| `"openclaw.extensions"` | Array of files OpenClaw will load; must include your entry point |

### openclaw.plugin.json — The Plugin Manifest

This is the plugin's identity and configuration contract. OpenClaw reads this file to discover the plugin.

```json
{
  "id": "mc-notes",
  "name": "Miniclaw Notes",
  "description": "Per-topic timestamped notes — append-only markdown files organized by topic.",
  "version": "0.1.0",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "notesDir": {
        "type": "string",
        "description": "Directory for per-topic note files"
      }
    }
  }
}
```

**Manifest field reference:**

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | **yes** | Unique plugin identifier, conventionally `mc-<name>` |
| `name` | string | **yes** | Human-readable display name |
| `description` | string | **yes** | One-line description of what the plugin does |
| `version` | string | no | Semver version string |
| `configSchema` | object | no | JSON Schema describing the plugin's configuration options |

> **Note:** The manifest file is `openclaw.plugin.json` — not `MANIFEST.json`. Some older references may use the old name; `openclaw.plugin.json` is the correct format.

The `configSchema` allows users to customize your plugin via OpenClaw's configuration system. At runtime, the values are available via `api.pluginConfig`.

---

## 3. Entry Point — index.ts

The entry point must `export default` a `register` function that receives an `OpenClawPluginApi` instance. This is the only contract between your plugin and OpenClaw.

```typescript
/**
 * mc-notes — OpenClaw plugin
 *
 * Per-topic timestamped notes stored as flat markdown files.
 * Notes dir: ~/.openclaw/miniclaw/USER/notes/<topic>.md
 */

import * as path from "node:path";
import * as os from "node:os";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

import { registerNotesCommands } from "./cli/commands.js";
import { createNotesTools } from "./tools/definitions.js";

// ---- Configuration ----

interface NotesConfig {
  notesDir: string;
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveConfig(api: OpenClawPluginApi): NotesConfig {
  const raw = (api.pluginConfig ?? {}) as Partial<NotesConfig>;
  return {
    notesDir: resolvePath(raw.notesDir ?? `~/.openclaw/miniclaw/USER/notes`),
  };
}

// ---- Plugin entry point ----

export default function register(api: OpenClawPluginApi): void {
  const cfg = resolveConfig(api);
  api.logger.info(`mc-notes loading (notesDir=${cfg.notesDir})`);

  // Register CLI commands
  api.registerCli((ctx) => {
    registerNotesCommands(
      { program: ctx.program, logger: api.logger },
      cfg.notesDir,
    );
  });

  // Register agent tools
  for (const tool of createNotesTools(cfg.notesDir, api.logger)) {
    api.registerTool(tool);
  }

  api.logger.info("mc-notes loaded");
}
```

### Key patterns

- **`resolvePath`** — expands `~/` to the user's home directory. Always use this for paths from config.
- **`resolveConfig`** — reads `api.pluginConfig` (populated from `configSchema` defaults and user overrides), merges with sensible defaults.
- **`api.registerCli`** — registers a callback that receives a Commander `program` instance for adding subcommands.
- **`api.registerTool`** — registers an agent tool (an `AnyAgentTool` object) that AI agents can invoke.
- **`api.logger`** — structured logger (Pino) for debug/info/warn/error output.

---

## 4. CLI Commands — cli/commands.ts

CLI commands are how humans (and agents via `spawnSync`) interact with your plugin. Commands are registered using [Commander.js](https://github.com/tj/commander.js/).

```typescript
/**
 * mc-notes — CLI commands
 *
 * openclaw mc-notes add <topic> <note>    Append a timestamped note
 * openclaw mc-notes read <topic>          Print all notes for a topic
 * openclaw mc-notes topics                List all topics
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";

export interface CliContext {
  program: Command;
  logger: {
    info: (m: string) => void;
    warn: (m: string) => void;
    error: (m: string) => void;
  };
}

export function registerNotesCommands(
  ctx: CliContext,
  notesDir: string,
): void {
  const { program } = ctx;

  // Top-level command group
  const notes = program
    .command("mc-notes")
    .description("Per-topic timestamped notes");

  // ---- mc-notes add ----
  notes
    .command("add <topic> <note>")
    .description("Append a timestamped note to a topic")
    .action((topic: string, note: string) => {
      try {
        fs.mkdirSync(notesDir, { recursive: true });
        const filePath = path.join(notesDir, `${topic}.md`);
        const timestamp = new Date().toISOString();
        const line = `${timestamp} ${note}\n`;
        fs.appendFileSync(filePath, line, { encoding: "utf-8", flag: "a" });
        console.log(`Note added to ${filePath}`);
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : err}`,
        );
        process.exit(1);
      }
    });

  // ---- mc-notes read ----
  notes
    .command("read <topic>")
    .description("Print all notes for a topic")
    .action((topic: string) => {
      try {
        const filePath = path.join(notesDir, `${topic}.md`);
        if (!fs.existsSync(filePath)) {
          console.log("(no notes yet)");
          return;
        }
        const content = fs.readFileSync(filePath, "utf-8");
        if (!content.trim()) {
          console.log("(no notes yet)");
          return;
        }
        console.log(content);
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : err}`,
        );
        process.exit(1);
      }
    });

  // ---- mc-notes topics ----
  notes
    .command("topics")
    .description("List all topics with notes")
    .action(() => {
      try {
        if (!fs.existsSync(notesDir)) {
          console.log("(no topics yet)");
          return;
        }
        const files = fs.readdirSync(notesDir).filter((f) =>
          f.endsWith(".md"),
        );
        if (files.length === 0) {
          console.log("(no topics yet)");
          return;
        }
        for (const f of files) {
          console.log(f.replace(/\.md$/, ""));
        }
      } catch (err) {
        console.error(
          `Error: ${err instanceof Error ? err.message : err}`,
        );
        process.exit(1);
      }
    });
}
```

### CLI pattern summary

1. **Create a top-level command group** matching your plugin name: `program.command("mc-notes")`
2. **Add subcommands** with `.command("verb <args>")` — each gets a `.description()` and `.action()` handler
3. **Use `<arg>`** for required arguments, `[arg]` for optional ones
4. **Handle errors** with try/catch — print to stderr and `process.exit(1)` on failure
5. **Accept a context object** with `program` and `logger` — this keeps the commands testable

---

## 5. Agent Tool Definitions — tools/definitions.ts

Agent tools are what AI agents call to interact with your plugin. Each tool is an `AnyAgentTool` object with a name, description, JSON Schema parameters, and an async `execute` function.

```typescript
/**
 * mc-notes — Agent tool definitions
 *
 * Tools can either:
 * (a) Use spawnSync to call the CLI (simple, consistent)
 * (b) Do file I/O directly (faster, no subprocess overhead)
 *
 * This example uses direct file I/O — see the "CLI delegation" pattern below.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { Logger } from "pino";

// ---- Schema helpers ----

function schema(
  props: Record<string, unknown>,
  required?: string[],
): unknown {
  return {
    type: "object",
    properties: props,
    required: required ?? [],
    additionalProperties: false,
  };
}

function str(description: string): unknown {
  return { type: "string", description };
}

// ---- Response helpers ----

function ok(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    details: {},
  };
}

function toolErr(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    isError: true,
    details: {},
  };
}

// ---- Tool definitions ----

export function createNotesTools(
  notesDir: string,
  logger: Logger,
): AnyAgentTool[] {
  return [
    {
      name: "notes_add",
      label: "Notes Add",
      description:
        "Append a timestamped note to a topic. " +
        "Use this to record observations, decisions, or findings " +
        "organized by topic name.",
      parameters: schema(
        {
          topic: str("Topic name (e.g. 'architecture', 'api-design')"),
          note: str("Note content to append"),
        },
        ["topic", "note"],
      ) as never,
      execute: async (
        _toolCallId: string,
        input: { topic: string; note: string },
      ) => {
        logger.debug(`mc-notes/tool notes_add: topic=${input.topic}`);
        try {
          fs.mkdirSync(notesDir, { recursive: true });
          const filePath = path.join(notesDir, `${input.topic}.md`);
          const timestamp = new Date().toISOString();
          const line = `${timestamp} ${input.note}\n`;
          fs.appendFileSync(filePath, line, {
            encoding: "utf-8",
            flag: "a",
          });
          return ok(`Note added: ${timestamp} ${input.note}`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-notes/tool notes_add error: ${msg}`);
          return toolErr(`notes_add failed: ${msg}`);
        }
      },
    },

    {
      name: "notes_read",
      label: "Notes Read",
      description:
        "Read all notes for a topic. " +
        "Returns all timestamped entries, or '(no notes yet)' if empty.",
      parameters: schema(
        {
          topic: str("Topic name to read"),
        },
        ["topic"],
      ) as never,
      execute: async (
        _toolCallId: string,
        input: { topic: string },
      ) => {
        logger.debug(`mc-notes/tool notes_read: topic=${input.topic}`);
        try {
          const filePath = path.join(notesDir, `${input.topic}.md`);
          if (!fs.existsSync(filePath)) return ok("(no notes yet)");
          const content = fs.readFileSync(filePath, "utf-8");
          if (!content.trim()) return ok("(no notes yet)");
          return ok(content);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-notes/tool notes_read error: ${msg}`);
          return toolErr(`notes_read failed: ${msg}`);
        }
      },
    },
  ];
}
```

### Tool definition anatomy

Every `AnyAgentTool` has these fields:

| Field | Type | Description |
|---|---|---|
| `name` | string | Unique tool name — agents use this to invoke the tool |
| `label` | string | Human-readable label shown in tool listings |
| `description` | string | Detailed description — tell the agent *when* and *why* to use this tool |
| `parameters` | JSON Schema | Input parameters as a JSON Schema object |
| `execute` | async function | `(toolCallId: string, input: T) => Promise<ToolResult>` |

### Schema helpers

The helpers `schema()`, `str()`, `ok()`, and `toolErr()` are a lightweight convention used across MiniClaw plugins. You can also use `strEnum()` for constrained string values:

```typescript
function strEnum(values: string[], description: string): unknown {
  return { type: "string", enum: values, description };
}

// Usage in parameters:
priority: strEnum(["high", "medium", "low"], "Priority level")
```

### CLI delegation pattern

For complex tools, you may prefer to delegate to the CLI via `spawnSync` rather than duplicating business logic:

```typescript
import { spawnSync } from "node:child_process";

function runNotes(args: string[]): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  const result = spawnSync("openclaw", ["mc-notes", ...args], {
    encoding: "utf-8",
    timeout: 10000,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  };
}

// Then in an execute function:
execute: async (_toolCallId: string, input: { topic: string }) => {
  const { stdout, stderr, exitCode } = runNotes(["read", input.topic]);
  if (exitCode !== 0) return toolErr(stderr || "read failed");
  return ok(stdout);
},
```

This keeps a single source of truth for business logic in the CLI commands.

---

## 6. Persistence

MiniClaw plugins use two persistence patterns depending on data complexity.

### Pattern A: Flat Files (simple data)

Best for append-only logs, per-entity markdown files, or simple key-value storage. Used by **mc-memo**.

```typescript
import * as fs from "node:fs";
import * as path from "node:path";

// Write
function appendNote(notesDir: string, topic: string, note: string): void {
  fs.mkdirSync(notesDir, { recursive: true });
  const filePath = path.join(notesDir, `${topic}.md`);
  const timestamp = new Date().toISOString();
  fs.appendFileSync(filePath, `${timestamp} ${note}\n`, {
    encoding: "utf-8",
    flag: "a",
  });
}

// Read
function readNotes(notesDir: string, topic: string): string {
  const filePath = path.join(notesDir, `${topic}.md`);
  if (!fs.existsSync(filePath)) return "(no notes yet)";
  const content = fs.readFileSync(filePath, "utf-8");
  return content.trim() || "(no notes yet)";
}
```

**When to use:** Scratchpads, logs, memos, per-card/per-topic append-only data.

### Pattern B: SQLite (structured data)

Best for relational data with queries, filtering, and concurrent access. Used by **mc-board**.

**Step 1 — Define your schema** in `schema.sql`:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS notes (
    id         TEXT PRIMARY KEY,
    topic      TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_topic ON notes(topic);
```

**Step 2 — Create a database module** in `src/db.ts`:

```typescript
import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";

export { Database };

const SCHEMA = /* sql */ `
  CREATE TABLE IF NOT EXISTS notes (
    id         TEXT PRIMARY KEY,
    topic      TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notes_topic ON notes(topic);
`;

export function openDb(stateDir: string): Database {
  fs.mkdirSync(stateDir, { recursive: true });
  const dbPath = path.join(stateDir, "notes.db");
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);

  // Versioned migrations — each runs once
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`,
  );
  const applied = new Set(
    (
      db.prepare(`SELECT version FROM _migrations`).all() as {
        version: number;
      }[]
    ).map((r) => r.version),
  );

  const migrations: [number, string][] = [
    // Add migrations here as your schema evolves:
    // [1, `ALTER TABLE notes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]'`],
  ];

  for (const [version, sql] of migrations) {
    if (applied.has(version)) continue;
    try {
      db.exec(sql);
    } catch {
      // Column may already exist from pre-migration era
    }
    db.prepare(
      `INSERT INTO _migrations (version, applied_at) VALUES (?, ?)`,
    ).run(version, new Date().toISOString());
  }

  return db;
}
```

**Step 3 — Create a store layer** in `src/store.ts`:

```typescript
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface Note {
  id: string;
  topic: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export class NoteStore {
  constructor(private db: Database) {}

  create(topic: string, content: string): Note {
    const id = `note_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO notes (id, topic, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(id, topic, content, now, now);
    return { id, topic, content, created_at: now, updated_at: now };
  }

  listByTopic(topic: string): Note[] {
    return this.db
      .prepare(`SELECT * FROM notes WHERE topic = ? ORDER BY created_at DESC`)
      .all(topic) as Note[];
  }

  get(id: string): Note | undefined {
    return this.db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id) as
      | Note
      | undefined;
  }
}
```

**When to use:** Structured records with relationships, indexed queries, concurrent access from CLI + web UI + agents, or data that needs filtering/sorting.

**Dependencies:** Add `better-sqlite3` to your `package.json`:

```json
{
  "dependencies": {
    "better-sqlite3": "^11.9.0"
  }
}
```

---

## 7. Testing with Vitest

### vitest.config.ts

Every plugin needs a vitest config that resolves the `openclaw/plugin-sdk` import:

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

const openclaw = path.resolve(
  process.env.OPENCLAW_STATE_DIR ??
    require("node:os").homedir() + "/.openclaw",
  "projects/openclaw",
);

export default defineConfig({
  resolve: {
    alias: {
      "openclaw/plugin-sdk": path.join(
        openclaw,
        "dist/plugin-sdk/index.js",
      ),
    },
  },
  test: {
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**"],
  },
});
```

The alias is necessary because `openclaw/plugin-sdk` is not published to npm — it's resolved from the local OpenClaw installation.

### smoke.test.ts

At minimum, verify your plugin exports a register function and your tools are well-formed:

```typescript
import { test, expect } from "vitest";
import register from "./index.js";
import { createNotesTools } from "./tools/definitions.js";

test("register is a default-exported function", () => {
  expect(typeof register).toBe("function");
});

test("createNotesTools returns an array of valid tools", () => {
  const tools = createNotesTools("/tmp/notes-smoke", {
    info() {},
    warn() {},
    error() {},
    debug() {},
  } as any);

  expect(Array.isArray(tools)).toBe(true);
  expect(tools.length).toBeGreaterThan(0);

  for (const t of tools) {
    expect(typeof t.name).toBe("string");
    expect(typeof t.label).toBe("string");
    expect(typeof t.description).toBe("string");
    expect(typeof t.execute).toBe("function");
  }
});
```

### Running tests

```bash
cd ~/.openclaw/miniclaw/plugins/mc-notes
npx vitest run
```

---

## 8. Putting It All Together

Here is the complete file checklist for a working plugin:

```
mc-notes/
├── index.ts                  ← register(api) entry point
├── package.json              ← type: module, openclaw.extensions
├── openclaw.plugin.json      ← id, name, description, configSchema
├── vitest.config.ts          ← openclaw/plugin-sdk alias
├── smoke.test.ts             ← export + tool shape tests
├── cli/
│   └── commands.ts           ← Commander subcommands
└── tools/
    └── definitions.ts        ← AnyAgentTool array
```

### Verification steps

1. **Plugin loads:** `openclaw` starts without errors referencing your plugin
2. **CLI works:** `openclaw mc-notes add test "hello world"` succeeds
3. **CLI reads:** `openclaw mc-notes read test` shows the note
4. **Tests pass:** `cd mc-notes && npx vitest run` — all green
5. **Tools are registered:** Agent sessions can discover and call `notes_add` and `notes_read`

### Context injection (optional)

If your plugin should inject context into every agent prompt (like mc-board injects the kanban board), use the `before_prompt_build` hook:

```typescript
api.on("before_prompt_build", async (_event, _ctx) => {
  try {
    const summary = getSummary(); // your logic here
    return { prependContext: summary };
  } catch (err) {
    api.logger.warn(`mc-notes: context injection error: ${err}`);
    return;
  }
});
```

---

## Reference Plugins

| Plugin | Complexity | Persistence | Best for learning |
|---|---|---|---|
| **mc-memo** | Minimal (~100 LOC) | Flat files | Plugin structure, CLI, tools |
| **mc-docs** | Medium | JSON files | Versioning, CRUD commands |
| **mc-board** | Full-featured | SQLite | DB schema, migrations, web UI, hooks |

All plugins live in `~/.openclaw/miniclaw/plugins/` — read the source for real-world patterns.
