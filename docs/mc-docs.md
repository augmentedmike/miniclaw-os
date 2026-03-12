# mc-docs — Document Authoring, Versioning, and Linking

mc-docs is a lightweight document management plugin for MiniClaw. It handles long-form authored documents with immutable version history, markdown storage, and links to mc-board cards.

---

## Documents vs KB Entries

mc-docs and mc-kb both store text, but serve different purposes:

| | mc-docs | mc-kb |
|---|---|---|
| **Purpose** | Authored documents (specs, posts, reports) | Structured knowledge (errors, workflows, facts) |
| **Schema** | Free-form markdown body + versioned history | Typed entries (fact, error, workflow, guide…) |
| **Retrieval** | By ID, tag, or linked card | Hybrid vector + keyword search |
| **Agent use** | Explicit fetch by ID | Auto-injected into agent context |
| **Versioning** | Yes — full immutable history per document | No — entries are updated in place |
| **Board links** | Yes — `linked_card_id` field | No |
| **Storage** | One JSON file per document | SQLite + markdown mirror |

**Use mc-docs when** you need a versioned, editable artifact — a requirements doc, a blog draft, a design spec, a project write-up.

**Use mc-kb when** you need a fact or workflow to be automatically recalled during agent conversations.

---

## Document Model

Each document is stored as a single JSON file: `$OPENCLAW_STATE_DIR/USER/docs/<doc_id>.json`

### Schema

```typescript
interface Document {
  metadata: {
    id: string;           // doc_<random>  e.g. doc_k3x9ab1c2
    name: string;         // Human-readable title
    author: string;       // Who created or last edited
    created: string;      // ISO-8601 creation timestamp
    updated: string;      // ISO-8601 last-updated timestamp
    version: number;      // Current version number (starts at 1)
    tags: string[];       // Optional tags for filtering
    linked_card_id?: string; // Link to an mc-board card (e.g. crd_abc123)
  };
  body: string;           // Full markdown content
  history: DocumentVersion[];
}

interface DocumentVersion {
  version: number;
  timestamp: string;  // ISO-8601
  author: string;
  message?: string;   // Optional changelog note
  hash: string;       // SHA-256 of body content
}
```

### Example document file

```json
{
  "metadata": {
    "id": "doc_k3x9ab1c2",
    "name": "Requirements: Notification System",
    "author": "augmentedmike",
    "created": "2026-03-05T06:00:00Z",
    "updated": "2026-03-05T08:30:00Z",
    "version": 3,
    "tags": ["requirements", "notifications"],
    "linked_card_id": "crd_abc123"
  },
  "body": "# Requirements: Notification System\n\n...",
  "history": [
    {
      "version": 1,
      "timestamp": "2026-03-05T06:00:00Z",
      "author": "augmentedmike",
      "message": "Initial creation",
      "hash": "e3b0c44298fc..."
    },
    {
      "version": 2,
      "timestamp": "2026-03-05T07:00:00Z",
      "author": "augmentedmike",
      "message": "Added section on delivery channels",
      "hash": "a87ff679a2f3..."
    },
    {
      "version": 3,
      "timestamp": "2026-03-05T08:30:00Z",
      "author": "augmentedmike",
      "message": "Clarified retry logic",
      "hash": "eccbc87e4b5c..."
    }
  ]
}
```

---

## Versioning Strategy

mc-docs uses **content-hash versioning**: a new version is only created when the body content actually changes.

- **ID format:** `doc_<9 random alphanumeric chars>`
- **Version numbers:** start at `1`, increment by `1` per meaningful change
- **Hash:** SHA-256 of the body string — used to deduplicate edits (saving the same content twice creates no new version)
- **History is append-only:** past versions are never removed; the `history` array grows with each change
- **Current body:** always reflects the latest version — previous body content is not stored, only the hash

This means version history tracks *who changed what and when*, but does not store full content snapshots for each version. To see what the document looked like at version N, you'd need the hash to compare against a known copy — diffs are not built in.

**What each version record contains:**

| Field | Description |
|-------|-------------|
| `version` | Sequential version number |
| `timestamp` | When this version was saved |
| `author` | Who made the change |
| `message` | Optional changelog entry |
| `hash` | SHA-256 of body at that point |

---

## Link/Graph Relationship Between Documents and Cards

mc-docs connects to **mc-board** via the `linked_card_id` field on a document's metadata.

- One document can be linked to **one board card** (`linked_card_id` is a single optional string)
- One card can have **multiple documents** linked to it (by querying `mc-docs list --card-id <id>`)
- The relationship is stored on the document side — mc-board cards have no back-reference field
- Links can be set at creation time or updated via the `linkCard()` API method

**Practical pattern:**

```
crd_abc123 (board card: "Build notification system")
  └── doc_k3x9ab1c2  "Requirements: Notification System"
  └── doc_m7p2wq4r1  "Design Notes: Notification Channels"
```

To find all documents for a card:
```bash
mc-docs list --card-id crd_abc123
```

There is no multi-document graph or inter-document linking at this time. Documents link to cards; they do not link to each other.

---

## CLI Reference

The CLI is invoked as `mc-docs <command>`. All commands are registered under the openclaw plugin system.

### `mc-docs create <name>`

Create a new document with an empty body.

```
mc-docs create <name> [options]

Options:
  --author <name>    Document author (defaults to $USER)
  --tags <tags>      Comma-separated tags
  --card-id <id>     Link to a board card
```

**Examples:**
```bash
mc-docs create "Requirements Doc"
mc-docs create "Sprint Retrospective" --author augmentedmike --tags "retro,sprint-12"
mc-docs create "Design Notes" --card-id crd_abc123
```

Output:
```
✓ Created document: doc_k3x9ab1c2
  Name: Design Notes
  Author: augmentedmike
  Linked to card: crd_abc123
```

### `mc-docs edit <id> [content]`

Update a document's body. Creates a new version only if content changed.

```
mc-docs edit <id> [content] [options]

Arguments:
  content            New body content (inline string)

Options:
  --author <name>    Author of the change (defaults to $USER)
  --message <msg>    Version changelog message
  --file <path>      Read content from a file instead of inline
```

**Examples:**
```bash
# Inline content
mc-docs edit doc_k3x9ab1c2 "# Design Notes\n\nSection 1..." --message "Added section 1"

# From file
mc-docs edit doc_k3x9ab1c2 --file ./notes.md --author augmentedmike --message "Full rewrite"
```

Output:
```
✓ Updated document: doc_k3x9ab1c2
  Name: Design Notes
  Version: 2
  Updated: 2026-03-05T09:00:00.000Z
```

### `mc-docs show <id>`

Display document content and metadata.

```
mc-docs show <id> [options]

Options:
  --raw    Output body only (suitable for piping)
```

**Examples:**
```bash
mc-docs show doc_k3x9ab1c2
mc-docs show doc_k3x9ab1c2 --raw | pandoc -f markdown -t html
```

Default output format:
```
# Design Notes
Author: augmentedmike
Version: 2
Updated: 2026-03-05T09:00:00Z
Tags: design, architecture
Card: crd_abc123
---

<body content>
```

### `mc-docs list`

List all documents, sorted by most recently updated.

```
mc-docs list [options]

Options:
  --tag <tag>        Filter by tag
  --card-id <id>     Filter by linked card
```

**Examples:**
```bash
mc-docs list
mc-docs list --tag requirements
mc-docs list --card-id crd_abc123
```

Output:
```
ID              Name                           Author          Updated
--------------------------------------------------------------------------------
doc_k3x9ab1c2  Design Notes                   augmentedmike   2026-03-05
doc_m7p2wq4r1  Requirements Doc               augmentedmike   2026-03-04

Total: 2 document(s)
```

### `mc-docs versions <id>`

Show the full version history for a document.

```
mc-docs versions <id>
```

**Example:**
```bash
mc-docs versions doc_k3x9ab1c2
```

Output:
```
Version History for doc_k3x9ab1c2:
Ver  Author          Timestamp           Message
----------------------------------------------------------------------
1    augmentedmike   2026-03-05          Initial creation
2    augmentedmike   2026-03-05          Added section 1
3    augmentedmike   2026-03-05          Full rewrite
```

---

## Storage Location

Documents are stored as individual JSON files. The path resolves in priority order:

1. **Explicit `basePath`** passed to `DocumentStore` constructor (programmatic use only)
2. **`$OPENCLAW_STATE_DIR/USER/docs/`** — if the environment variable is set
3. **`~/.openclaw/USER/docs/`** — hardcoded fallback

The effective path is:

```
~/.openclaw/USER/docs/
  doc_k3x9ab1c2.json
  doc_m7p2wq4r1.json
  ...
```

Each document is one JSON file. No database.

---

## Programmatic API

```typescript
import { DocumentStore } from '@miniclaw/mc-docs';

const store = new DocumentStore();
// Custom path: new DocumentStore({ basePath: '/path/to/docs' });

// Create
const doc = store.create('My Doc', 'augmentedmike', '# Hello', ['tag1'], 'crd_abc');

// Read
const doc = store.get('doc_k3x9ab1c2');  // null if not found

// Update (new version only if body changed)
const updated = store.update('doc_k3x9ab1c2', '# Updated', 'augmentedmike', 'Fixed intro');

// List (optionally filtered)
const all = store.list();
const byTag = store.list({ tag: 'requirements' });
const byCard = store.list({ card_id: 'crd_abc123' });

// Version history
const history = store.getVersions('doc_k3x9ab1c2');

// Link to a board card (post-creation)
store.linkCard('doc_k3x9ab1c2', 'crd_abc123');

// Delete
store.delete('doc_k3x9ab1c2');
```

---

## No Web UI

mc-docs has no web UI at this time. All interaction is via the CLI or the programmatic TypeScript API. A web UI is listed as a future enhancement in the plugin's README.

---

## Future Enhancements (Tracked)

- Full-text search across document bodies
- Diff viewer between versions (currently only hashes are stored)
- Document templates
- Export to HTML/PDF
- Web UI for browsing documents
- `mc-docs link-card <doc_id> <card_id>` CLI command (currently only settable via API or at create time)
