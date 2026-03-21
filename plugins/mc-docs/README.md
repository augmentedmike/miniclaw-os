# mc-docs — Document Authoring & Versioning Plugin

Lightweight document management system for MiniClaw with built-in versioning, metadata tracking, and integration with the mc-board card system.

## Features

- **Document Creation** — Create new documents with metadata (author, tags, linked cards)
- **Versioning** — Immutable version history with SHA-256 content hashing
- **Markdown Support** — Native markdown body storage and editing
- **Card Integration** — Link documents to mc-board cards for traceability
- **JSON Storage** — Simple filesystem-based storage at `~/.openclaw/miniclaw/USER/docs/`
- **CLI Commands** — Full command-line interface for all operations
- **Filtering** — List documents by tag or linked card ID

## Installation

```bash
cd ~/.openclaw/projects/miniclaw-os/plugins/mc-docs
npm install
npm run build
```

## Usage

### Create a Document

```bash
mc-docs create "My Blog Post" --author "John Doe" --tags "blog,draft" --card-id crd_12345
```

Creates a new document with ID `doc_<random>` and empty body.

### Edit a Document

```bash
mc-docs edit doc_abc123 "New content here" --author "John Doe" --message "Added introduction section"
```

Or from a file:

```bash
mc-docs edit doc_abc123 --file ./my-content.md --author "John Doe" --message "Updated from markdown"
```

### List Documents

```bash
# All documents
mc-docs list

# By tag
mc-docs list --tag "blog"

# By linked card
mc-docs list --card-id crd_12345
```

### Show Document

```bash
mc-docs show doc_abc123

# Raw output (body only)
mc-docs show doc_abc123 --raw
```

### View Version History

```bash
mc-docs versions doc_abc123
```

Shows all versions with author, timestamp, and changelog message.

## Document Schema

Each document is stored as a single JSON file with this structure:

```json
{
  "metadata": {
    "id": "doc_abc123",
    "name": "My Blog Post",
    "author": "John Doe",
    "created": "2026-03-05T06:00:00Z",
    "updated": "2026-03-05T07:30:00Z",
    "version": 3,
    "tags": ["blog", "draft"],
    "linked_card_id": "crd_12345"
  },
  "body": "# My Blog Post\n\nContent in markdown...",
  "history": [
    {
      "version": 1,
      "timestamp": "2026-03-05T06:00:00Z",
      "author": "John Doe",
      "message": "Initial creation",
      "hash": "abc123def456..."
    },
    {
      "version": 2,
      "timestamp": "2026-03-05T06:30:00Z",
      "author": "John Doe",
      "message": "Added introduction",
      "hash": "def456abc789..."
    }
  ]
}
```

## Programmatic API

```typescript
import { DocumentStore } from '@miniclaw/mc-docs';

const store = new DocumentStore();

// Create
const doc = store.create('My Doc', 'author@example.com', '# Hello', ['tag1']);

// Read
const loaded = store.get('doc_abc123');

// Update
const updated = store.update('doc_abc123', '# Updated content', 'author@example.com', 'Fixed typo');

// List
const all = store.list();
const byTag = store.list({ tag: 'blog' });
const byCard = store.list({ card_id: 'crd_12345' });

// Versions
const history = store.getVersions('doc_abc123');

// Link to card
store.linkCard('doc_abc123', 'crd_99999');
```

## Storage Location

Documents are stored at:
```
~/.openclaw/miniclaw/USER/docs/
```

Each document is a single JSON file named `<doc_id>.json`.

## Version Tracking

Versions are created automatically when content changes. Each version includes:
- **version** — incremental version number
- **timestamp** — ISO 8601 creation time
- **author** — who made the change
- **message** — optional changelog message
- **hash** — SHA-256 of body content for diff tracking

No actual diffs are stored; the hash allows determining if content changed without storing multiple copies.

## Integration with mc-board

Link documents to board cards using the `--card-id` flag:

```bash
mc-docs create "Requirements Doc" --card-id crd_abc123
```

Or link after creation:

```bash
# (Future enhancement: mc-docs link-card doc_id card_id)
```

This allows tracking documents alongside their related work items.

## Development

```bash
# Build
npm run build

# Watch for changes
npm run dev

# Run tests
npm run test

# CLI locally
node dist/cli.js create "Test"
```

## Future Enhancements

- [ ] Full-text search across document bodies
- [ ] Diff viewer between versions
- [ ] Document templates
- [ ] Markdown syntax validation
- [ ] Export to HTML/PDF
- [ ] Web UI for browsing documents
- [ ] Real-time collaborative editing (future)
