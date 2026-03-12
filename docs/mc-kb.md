# mc-kb — Knowledge Base: Architecture, Schema, and CLI Reference

mc-kb is the agent's long-term memory (the hippocampus). It stores structured knowledge — errors, solutions, workflows, guides, facts — and retrieves it with hybrid vector + keyword search. Entries are automatically injected into the agent's context before each prompt when relevant.

---

## Architecture Overview

```
openclaw mc-kb <command>              ← CLI entry point
       │
       ├── cli/commands.ts            ← registerKbCommands() — all subcommands
       │
       ├── src/entry.ts               ← KBEntry type, ID generation, formatters
       ├── src/store.ts               ← KBStore — SQLite CRUD + FTS5 + sqlite-vec
       ├── src/search.ts              ← Hybrid search: BM25 + cosine → RRF merge
       ├── src/embedder.ts            ← EmbeddingGemma-300M via node-llama-cpp
       │
       ├── tools/definitions.ts       ← Agent tools: kb_search, kb_add, kb_update, kb_get
       └── index.ts                   ← Plugin entry, context hook, tool registration
```

**Database:** SQLite file at `$MINICLAW_STATE_DIR/user/<bot>/kb/kb.db`. WAL mode is enabled. `better-sqlite3` provides synchronous access.

**Markdown mirror:** Every entry is also written as `<id>.md` in a `entries/` subdirectory alongside the database. These are the source files for QMD vector indexing.

---

## Entry Types and Schema

### KBEntry interface

```typescript
interface KBEntry {
  id: string;          // kb_<8hex>  e.g. kb_a1b2c3d4
  type: EntryType;     // see types below
  title: string;       // concise descriptive title
  content: string;     // full markdown body
  summary?: string;    // 1–2 sentence overview (shown in search results)
  tags: string[];      // e.g. ["ssl", "macos", "network"]
  source?: string;     // "conversation", "cli", a URL, or file path
  severity?: Severity; // "low" | "medium" | "high" — for error/postmortem only
  visibility: Visibility; // "private" | "shareable"
  created_at: string;  // ISO-8601
  updated_at: string;  // ISO-8601
}
```

### Entry types

| Type | Use for |
|------|---------|
| `fact` | A standalone fact about the system, environment, or domain |
| `workflow` | A multi-step repeatable process (e.g. "how to deploy to prod") |
| `guide` | A longer how-to or tutorial explaining a topic |
| `howto` | A short focused recipe for a specific task |
| `error` | An error encountered and its resolution |
| `postmortem` | Post-incident analysis with root cause and prevention |
| `lesson` | A lesson learned — what went wrong or what worked well |

### Examples

**fact:**
```
title: "Mac mini is always on 192.168.1.136"
content: "The Mac mini (AugmentedMikes-Mac-mini) runs 24/7 at 192.168.1.136 on the home LAN."
tags: [network, mac-mini, infrastructure]
```

**error:**
```
title: "SSL cert fails on M1 when using security add-trusted-cert"
content: "Run: sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain cert.pem"
severity: medium
tags: [ssl, macos, security]
```

**workflow:**
```
title: "Deploy mc-board update to production"
content: "1. Build: cd ~/am/projects/openclaw && npm run build\n2. Restart: openclaw restart\n3. Verify: openclaw status"
tags: [deploy, mc-board, openclaw]
```

**lesson:**
```
title: "Agent tools must not spawn subprocesses for mc-kb"
summary: "Spawning a subprocess to run mc-kb CLI from an agent tool caused 30s timeouts due to cold embedder reload and GPU contention."
content: "Use the in-process KBStore + Embedder instead. The plugin's tools/definitions.ts does this correctly."
tags: [agent, mc-kb, performance]
```

### Visibility

Every entry has a `visibility` field:

| Value | Meaning |
|-------|---------|
| `private` | Default. Only exists in your local KB. |
| `shareable` | Included when you run `mc-kb export`. Ships with new MiniClaw installs. |

Shareable entries are general-purpose knowledge that benefits every MiniClaw instance — platform quirks, tool gotchas, workflow patterns. Private entries are personal or environment-specific.

### Markdown file format

Each entry is written to disk as a YAML-frontmatter markdown file:

```markdown
---
id: kb_a1b2c3d4
type: error
title: "SSL cert fails on M1"
tags: ["ssl", "macos"]
summary: "Use security add-trusted-cert to install the cert system-wide."
source: "conversation"
severity: medium
created_at: 2026-01-15T10:30:00.000Z
updated_at: 2026-01-15T10:30:00.000Z
---

# SSL cert fails on M1

Run: `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain cert.pem`
```

---

## Search Modes

mc-kb uses **hybrid search**: BM25 keyword search (FTS5) and cosine vector search (sqlite-vec) combined via Reciprocal Rank Fusion (RRF).

### FTS5 — Keyword (BM25) Search

- SQLite FTS5 virtual table with Porter stemming (`tokenize = 'porter ascii'`)
- Indexes `title` and `content` fields
- Query strategy: tries AND of all tokens first, then OR, then OR of first 2 tokens
- BM25 rank is negative (lower = better match)

### Vector (Cosine) Search

- Embeddings stored in `sqlite-vec` `vec0` virtual table as `float[768]`
- Model: **EmbeddingGemma-300M** (Q8_0 GGUF) via `node-llama-cpp`
- Runs on Metal GPU on Apple Silicon (falls back to CPU on other platforms)
- Model path: `~/.cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf`
- If model file is missing or sqlite-vec is unavailable, the system falls back gracefully to FTS5-only mode

### Hybrid RRF Merge

Both search modes run in parallel. Results are merged with **Reciprocal Rank Fusion** (k=60):

```
score(entry) = 1/(60 + fts_rank) + 1/(60 + vec_rank)
```

Entries that rank well in both modes get a higher combined score. Vector results with cosine distance > `vecThreshold` (default `1.5`, configurable) are filtered out before merging.

**Fallback chain:**
1. Hybrid FTS5 + vector → RRF merge (primary)
2. FTS5-only (if sqlite-vec unavailable)
3. Substring scan over all entries (if FTS5 returns nothing)

### Embedding text

When adding or updating an entry, the embedder encodes: `title + "\n" + summary + "\n" + content[:512]`

---

## CLI Reference

All commands are under `openclaw mc-kb`.

### `mc-kb add`

Add a new entry.

```
openclaw mc-kb add --type <type> --title <title> --content <content> [options]

Required:
  --type <type>        Entry type: fact, workflow, guide, howto, error, postmortem, lesson
  --title <title>      Concise descriptive title
  --content <content>  Full markdown content

Options:
  --summary <text>     1–2 sentence summary
  --tags <tags>        Comma-separated tags (e.g. ssl,macos,network)
  --source <source>    Source: 'conversation', 'cli', URL, or file path
  --severity <level>   Severity for error/postmortem: low, medium, high
  --visibility <vis>   Visibility: private (default), shareable
```

**Examples:**
```bash
openclaw mc-kb add \
  --type error \
  --title "SSL cert fails on M1" \
  --content "Run: sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain cert.pem" \
  --tags ssl,macos \
  --severity medium

openclaw mc-kb add \
  --type fact \
  --title "Bonsai prod runs on port 3090" \
  --content "The production Bonsai server listens on port 3090 and is managed by pm2." \
  --tags bonsai,network,prod
```

### `mc-kb search`

Hybrid vector + keyword search.

```
openclaw mc-kb search <query> [options]

Options:
  --type <type>   Filter results by entry type
  --tag <tag>     Filter results by tag
  -n, --n <n>     Number of results (default: 10)
  --json          Output results as JSON
```

**Examples:**
```bash
openclaw mc-kb search "ssl certificate mac"
openclaw mc-kb search "deploy production" --type workflow
openclaw mc-kb search "timeout error" --type error -n 5
openclaw mc-kb search "ssl" --json
```

Output format (text):
```
Found 2 result(s) for "ssl certificate mac":

  kb_a1b2c3d4  [error] (medium)  SSL cert fails on M1  [ssl, macos]
    score=0.0327 vec=0.412
    > Use security add-trusted-cert to install the cert system-wide.

  kb_b2c3d4e5  [guide]  macOS certificate management  [macos, security]
    score=0.0161
    > Guide to managing certificates on macOS.
```

### `mc-kb list`

List entries, optionally filtered.

```
openclaw mc-kb list [options]

Options:
  --type <type>          Filter by type
  --tag <tag>            Filter by tag
  --visibility <vis>     Filter by visibility: private, shareable
  --limit <n>            Max entries to show (default: 20)
  --json                 Output as JSON
```

**Examples:**
```bash
openclaw mc-kb list
openclaw mc-kb list --type error
openclaw mc-kb list --tag macos --limit 5
openclaw mc-kb list --json
```

### `mc-kb get`

Retrieve a single entry by ID, displayed as formatted markdown.

```
openclaw mc-kb get <id> [--json]
```

**Examples:**
```bash
openclaw mc-kb get kb_a1b2c3d4
openclaw mc-kb get kb_a1b2c3d4 --json
```

### `mc-kb update`

Update fields on an existing entry. Only specified fields are changed. If `--title` or `--content` is updated, a new embedding is generated automatically.

```
openclaw mc-kb update <id> [options]

Options:
  --type <type>       New type
  --title <title>     New title
  --content <text>    New content
  --summary <text>    New summary
  --tags <tags>       New tags (comma-separated, replaces existing tags)
  --severity <level>  New severity
```

**Examples:**
```bash
openclaw mc-kb update kb_a1b2c3d4 --severity high
openclaw mc-kb update kb_a1b2c3d4 --tags "ssl,macos,certificates"
openclaw mc-kb update kb_a1b2c3d4 --content "Updated solution..."
```

### `mc-kb rm`

Remove an entry (deletes from SQLite, FTS index, vector store, and the `.md` file).

```
openclaw mc-kb rm <id>
```

**Example:**
```bash
openclaw mc-kb rm kb_a1b2c3d4
```

### `mc-kb import`

Bulk import entries from a YAML-frontmatter markdown file. Supports multiple entries in a single file, separated by `---`.

```
openclaw mc-kb import <file>
```

**File format:**
```markdown
---
type: error
title: "First entry title"
tags: [tag1, tag2]
severity: medium
---
Entry content goes here...

---
type: fact
title: "Second entry title"
tags: [tag3]
---
Second entry content...
```

### `mc-kb share`

Mark an entry as shareable (included in exports and shipped with new installs).

```
openclaw mc-kb share <id>
```

### `mc-kb unshare`

Mark an entry as private (excluded from exports).

```
openclaw mc-kb unshare <id>
```

### `mc-kb export`

Export all shareable entries as a JSON bundle.

```
openclaw mc-kb export [--out <path>]
```

Without `--out`, writes JSON to stdout. With `--out`, writes to the specified file.

**Examples:**
```bash
# Preview what would be exported
openclaw mc-kb export | jq '.entries | length'

# Export to the miniclaw-os repo for distribution
openclaw mc-kb export --out ~/am/projects/miniclaw-os/shared/kb/knowledge.json
```

### `mc-kb import` (JSON bundle format)

In addition to the YAML frontmatter format, `mc-kb import` also accepts JSON bundles produced by `mc-kb export`. Entries that already exist (by ID) are skipped — safe to re-import.

```bash
openclaw mc-kb import shared/kb/knowledge.json
```

### `mc-kb stats`

Show entry counts by type and whether vector search is enabled.

```
openclaw mc-kb stats
```

Output:
```
Knowledge Base Stats:
  Total: 42
  error       : 18
  fact        : 12
  workflow    : 7
  guide       : 3
  lesson      : 2
  Vector search: enabled
```

---

## Agent Integration

### Automatic context injection

The `before_prompt_build` hook fires before every agent prompt. It:

1. Extracts the last user message as the search query
2. Runs `hybridSearch` with `n=3` (configurable via `contextN`) and `vecThreshold=0.75` (configurable)
3. If results are found, prepends a `## Relevant Knowledge Base` block to the prompt context

This happens transparently — the agent receives relevant KB entries without needing to explicitly call a search tool.

Example injected block:
```markdown
## Relevant Knowledge Base
[error] SSL cert fails on M1 (kb_a1b2c3d4) [ssl, macos]
> Use security add-trusted-cert to install the cert system-wide.

[workflow] Deploy mc-board update to production (kb_b2c3d4e5) [deploy, mc-board]
> 1. Build 2. Restart openclaw 3. Verify status
```

### Agent tools

Four tools are available for agents to query and modify the KB mid-task:

#### `kb_search`

Search for relevant entries. Returns title, type, summary, and ID.

```
Input:
  query   (required)  Natural language search query
  type    (optional)  Filter by entry type
  tag     (optional)  Filter by tag
  n       (optional)  Max results (default: 5)
```

**When to use:** At the start of a task, before attempting something that might have a known solution. Also useful when encountering an error — search for it first.

```
kb_search("deploy bonsai to production")
kb_search("sqlite locked error", type="error")
```

#### `kb_add`

Add a new entry to the knowledge base.

```
Input:
  type     (required)  Entry type
  title    (required)  Concise title
  content  (required)  Full markdown content
  summary  (optional)  1–2 sentence summary
  tags     (optional)  Comma-separated tags
  source   (optional)  "conversation", "cli", URL, or file path
  severity (optional)  low | medium | high (for error/postmortem)
  visibility (optional)  private (default) | shareable
```

**When to use:** After solving a problem, after completing a multi-step task, or when learning something that should persist across sessions.

```
kb_add(
  type="error",
  title="bun lock file conflict on npm install",
  content="Delete bun.lock before running npm install in mixed-lockfile repos.",
  tags="bun,npm,package-manager",
  severity="low"
)
```

#### `kb_update`

Update fields on an existing entry by ID. Only specified fields are changed.

```
Input:
  id       (required)  Entry ID (kb_<hex>)
  type, title, content, summary, tags, severity  (all optional)
```

**When to use:** When a previously stored solution turns out to be incomplete or incorrect, or when a workflow changes.

#### `kb_get`

Retrieve the full content of a single entry by ID.

```
Input:
  id  (required)  Entry ID (kb_<hex>)
```

**When to use:** After `kb_search` returns a relevant entry and you need the full content, not just the summary.

### Recommended agent pattern

```
1. At task start: kb_search("<task description>")
2. Review injected context (auto-provided) and search results
3. Proceed with task, using stored knowledge
4. On error: kb_search("<error message>", type="error")
5. After resolving: kb_add(type="error", ...) to store the solution
6. After completing a non-trivial task: kb_add(type="workflow" or "lesson", ...)
```

---

## Configuration

Plugin config in `openclaw.plugin.json` or the openclaw config file:

```json
{
  "mc-kb": {
    "dbDir": "~/am/user/augmentedmike_bot/kb",
    "modelPath": "~/.cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf",
    "qmdBin": "~/.bun/bin/qmd",
    "qmdCollection": "kb",
    "contextN": 3,
    "contextThreshold": 0.75
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `dbDir` | `~/.openclaw/user/<bot>/kb` | Directory for `kb.db` and `entries/` |
| `modelPath` | `~/.cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf` | EmbeddingGemma model file |
| `contextN` | `3` | Max KB entries injected per prompt |
| `contextThreshold` | `0.75` | Max cosine distance for context injection (lower = stricter) |

---

## Database Schema

```sql
-- Main entry store
CREATE TABLE entries (
  id         TEXT PRIMARY KEY,   -- kb_<8hex>
  type       TEXT NOT NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  summary    TEXT,
  tags       TEXT NOT NULL DEFAULT '[]',  -- JSON array
  source     TEXT,
  severity   TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',  -- private | shareable
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- FTS5 full-text search (Porter stemming)
CREATE VIRTUAL TABLE entries_fts USING fts5(
  entry_id UNINDEXED,
  title,
  content,
  tokenize = 'porter ascii'
);

-- Rowid map for FTS5 updates/deletes
CREATE TABLE kb_fts_rowmap (
  entry_id TEXT PRIMARY KEY,
  fts_rowid INTEGER NOT NULL
);

-- Vector store (sqlite-vec, requires sqlite-vec extension)
CREATE VIRTUAL TABLE entry_vectors USING vec0(
  entry_id TEXT PRIMARY KEY,
  embedding float[768]
);
```

---

## Shared Knowledge

MiniClaw ships with a **shared knowledge bundle** — a curated set of KB entries that every new install receives. These are general-purpose entries (platform quirks, tool gotchas, workflow patterns) that benefit any MiniClaw instance.

### How it works

1. Amelia (the flagship instance) learns something useful and marks it shareable:
   ```bash
   openclaw mc-kb add --type fact --title "..." --content "..." --visibility shareable
   # or mark an existing entry:
   openclaw mc-kb share kb_a1b2c3d4
   ```

2. Export shareable entries to the miniclaw-os repo:
   ```bash
   openclaw mc-kb export --out ~/am/projects/miniclaw-os/shared/kb/knowledge.json
   ```

3. Commit and push to miniclaw-os.

4. New installs automatically download and import the bundle during `install.sh` (runs in the background so it doesn't block onboarding).

### Bundle format

`shared/kb/knowledge.json`:
```json
{
  "version": 1,
  "exported_at": "2026-03-11T00:00:00.000Z",
  "entries": [
    {
      "id": "kb_a1b2c3d4",
      "type": "fact",
      "title": "...",
      "content": "...",
      "tags": ["..."],
      "visibility": "shareable",
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

### Updating the shared bundle

Run the update script to re-export and regenerate the knowledge catalog:

```bash
./shared/kb/update-bundle.sh
```

This exports all shareable entries and regenerates `shared/kb/CATALOG.md` — a human-readable index of what's in the bundle. Commit both files.

### What belongs in the shared bundle

**Good candidates:**
- Platform-specific gotchas (macOS, Homebrew, Node.js quirks)
- Tool usage patterns (sqlite-vec, FTS5, node-llama-cpp, bun)
- MiniClaw operational knowledge (plugin boundaries, vault usage, cron patterns)
- Error resolutions that apply to any install

**Not shared (keep private):**
- Personal facts (IP addresses, credentials, names)
- Environment-specific config (paths, ports, hostnames)
- In-progress project context

### Current shared knowledge

<!-- KB_CATALOG_START -->
*No entries yet. Run `shared/kb/update-bundle.sh` after marking entries as shareable.*
<!-- KB_CATALOG_END -->
