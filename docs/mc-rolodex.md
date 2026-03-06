# mc-rolodex — Contact Browser and Search Reference

mc-rolodex is the social cortex for Mini Claw. It stores contacts with email addresses, phone numbers, and tags, and provides both a command-line interface and an interactive terminal UI (TUI) for browsing and searching them. It is the canonical lookup layer when routing messages or resolving identities.

---

## Architecture Overview

```
mc-rolodex <command>              ← CLI entry point (commander)
       │
       ├── src/cli/index.ts       ← All subcommands: search, browse, list, show, add, delete
       ├── src/search/engine.ts   ← SearchEngine — in-memory index, fuzzy matching, CRUD
       ├── src/search/types.ts    ← Contact, SearchResult, SearchQuery, ContactStore interfaces
       └── src/tui/browser.ts     ← ContactBrowser — blessed-based terminal UI
```

**Storage:** Single JSON file at `~/.miniclaw/rolodex/contacts.json`. The file is loaded into memory at startup and written back on every mutation. No database dependency.

---

## Contact Schema

Contacts are stored as JSON objects conforming to the `Contact` interface:

```typescript
interface Contact {
  id: string;                                              // unique identifier (e.g. "contact_1712345678")
  name: string;                                            // display name — required
  emails?: string[];                                       // one or more email addresses
  phones?: string[];                                       // one or more phone numbers (any format)
  domains?: string[];                                      // associated domains (e.g. company domains)
  tags?: string[];                                         // free-form labels (lowercase by convention)
  trustStatus?: 'verified' | 'untrusted' | 'pending' | 'unknown';
  lastVerified?: Date;                                     // when trust status was last confirmed
  notes?: string;                                          // freeform text notes
}
```

### Field Notes

| Field | Required | Description |
|---|---|---|
| `id` | Yes | Unique string. The CLI auto-generates `contact_<timestamp>` if omitted at add time. |
| `name` | Yes | Used as the primary display label and the first search target in multi-mode. |
| `emails` | No | Array of strings. Email-based searches also extract the domain for domain-mode search. |
| `phones` | No | Any format accepted (e.g. `"+1 555-867-5309"`, `"5558675309"`). Non-digit characters are stripped before comparison. |
| `domains` | No | Supplementary domain list (stored but not currently indexed by the search engine — email domains are extracted directly from `emails`). |
| `tags` | No | Lowercase strings. Used for grouping/filtering. Tag search is exact-match against the stored values. |
| `trustStatus` | No | Trust level for security-sensitive workflows. Displayed color-coded in both TUI and CLI output. |
| `lastVerified` | No | ISO date string. Set manually — not updated automatically. |
| `notes` | No | Freeform text. Stored on the contact but not printed by the `show` command. |

### Example Contact (JSON)

```json
{
  "id": "contact_1712345678",
  "name": "Alice Chen",
  "emails": ["alice@example.com", "alice.chen@work.example.com"],
  "phones": ["+1 555-867-5309"],
  "tags": ["engineer", "trusted"],
  "trustStatus": "verified",
  "notes": "Primary contact for infra questions."
}
```

---

## Storage

Contacts are persisted to:

```
~/.miniclaw/rolodex/contacts.json
```

The directory is created automatically on first write. The file contains a JSON array of `Contact` objects, pretty-printed with 2-space indentation. All mutations (add, update, delete) write the full array back to disk synchronously.

> **Note:** The storage path uses `~/.miniclaw/` (not `$OPENCLAW_STATE_DIR`). This is the plugin's native path and is separate from the openclaw state directory.

---

## Search Engine

The `SearchEngine` class holds all contacts in a `Map<id, Contact>` for O(1) lookup by ID and linear scan for searches.

### Search Types

| Type | Behavior |
|---|---|
| `name` | Fuzzy match against `contact.name` |
| `email` | Substring match against any address in `contact.emails` |
| `phone` | Digit-only substring match (strips non-digits from both query and stored values). **Requires at least 3 digits** — queries with fewer than 3 digits return no results silently. |
| `domain` | Matches if any email's domain exactly equals the query, or if the domain starts with `<query>.` (subdomain match). e.g. query `"example"` matches `"example.com"` and `"example.org"` but not `"examples.com"`. |
| `tag` | Exact match against any value in `contact.tags` |
| `multi` | Default. Tries fields in priority order: name → email → tag → domain → phone. Returns results from the first field that has any matches. |

### Scoring (name and email searches)

| Match type | Score |
|---|---|
| Exact match | 100 |
| Prefix match | 85 (email) / 80 (name) |
| Substring / contains | 60–70 (email non-prefix: 70) |
| Fuzzy character sequence | 40+ |
| No match | 0 (excluded from results) |

Phone, domain, and tag searches always return score 100 — they are exact/substring matches with no fuzzy component.

### `SearchQuery` Interface

```typescript
interface SearchQuery {
  text: string;                    // the search string
  type?: 'name' | 'email' | 'phone' | 'domain' | 'tag' | 'multi';
  limit?: number;                  // default: 50
}
```

---

## CLI Reference

All commands use `mc-rolodex <subcommand>`. Run `mc-rolodex --help` to see the full list.

---

### `search <query>`

Search contacts across all fields (or a specific field with `--type`).

```
mc-rolodex search <query> [options]

Options:
  -t, --type <type>     name | email | phone | domain | tag | multi  (default: multi)
  -l, --limit <number>  Max results to return  (default: 50)

Examples:
  mc-rolodex search "alice"
  mc-rolodex search "example.com" --type domain
  mc-rolodex search "5309" --type phone
  mc-rolodex search "engineer" --type tag
  mc-rolodex search "alice" --type name --limit 5
```

Output shows name, matched emails, phones, and tags for each result, plus a relevance score.

---

### `list`

List all contacts, optionally filtered by tag.

```
mc-rolodex list [options]

Options:
  -t, --tag <tag>    Filter to contacts that have this tag

Examples:
  mc-rolodex list
  mc-rolodex list --tag trusted
  mc-rolodex list --tag engineer
```

Output shows the name and all email addresses for each contact.

---

### `show <id>`

Display full details for a single contact by ID.

```
mc-rolodex show <id>

Example:
  mc-rolodex show contact_1712345678
```

Output includes: name, ID, emails, phones, tags, and trust status. The `notes`, `lastVerified`, and `domains` fields are stored on the contact but are not printed by this command.

---

### `add <data>`

Add a new contact. Accepts either a JSON string or a path to a JSON file.

```
mc-rolodex add <json-string-or-file>

Examples:
  # Inline JSON
  mc-rolodex add '{"name":"Bob Smith","emails":["bob@example.com"],"tags":["vendor"]}'

  # From file
  mc-rolodex add /tmp/new-contact.json
```

If the JSON object does not include an `id` field, one is auto-generated as `contact_<timestamp>`. The contact is saved immediately.

---

### `delete <id>`

Delete a contact permanently.

```
mc-rolodex delete <id>

Example:
  mc-rolodex delete contact_1712345678
```

Prints an error if the ID is not found. Deletion is immediate and permanent — there is no archive or undo.

---

### `browse`

Open the interactive TUI browser (see [TUI Browser](#tui-browser) below).

```
mc-rolodex browse
```

Requires at least one contact to exist. If the rolodex is empty, the command exits with an error and a hint to use `add`.

---

## TUI Browser

The TUI is built with [blessed](https://github.com/chjj/blessed) and runs directly in the terminal. It loads all contacts on start and supports keyboard navigation with vi-style bindings.

### Layout

```
┌──────────────────────────────────────────────────────┐
│  MiniClaw Contact Browser                            │
│  Type 'q' to quit, arrow keys to navigate, enter    │
│  to view details                                     │
└──────────────────────────────────────────────────────┘
  > Alice Chen
    alice@example.com

    Bob Smith
    bob@example.com
    ...
```

The currently selected contact is highlighted with a `>` prefix and blue background.

### Keybindings

| Key | Action |
|---|---|
| `↑` / `↓` | Move selection up/down through the results list |
| `Enter` | Open a detail modal for the selected contact |
| `q` / `Escape` / `Ctrl+C` | Exit the browser (or close the detail modal) |

Mouse clicks are also enabled (blessed mouse mode).

### Detail Modal

Pressing `Enter` on a contact opens a centered modal showing:

- Name and ID
- All email addresses
- All phone numbers
- Tags
- Trust status (color-coded: green = verified, yellow = other)

Press `q` or `Escape` to close the modal and return to the list.

### Notes

- The TUI opens with all contacts shown (empty-string search = show all).
- There is no in-TUI search box — use `mc-rolodex search` to find specific contacts, then `browse` to interactively scroll the full list.
- The browser does not support editing contacts. Use the CLI `add`/`delete` commands for mutations.

---

## Web UI

mc-rolodex ships a Next.js web application on **port 4221**. It provides a full browser-based interface for browsing, searching, filtering, and editing contacts — separate from the terminal TUI.

### Starting the Web UI

```bash
# Development (hot reload)
cd plugins/mc-rolodex/web
npm run dev        # starts on http://localhost:4221

# Production
npm run build
npm run start      # starts on http://localhost:4221
```

The web app is also deployed via `web/deploy.sh` as part of the plugin lifecycle.

### Storage

The web UI reads and writes the same `~/.miniclaw/rolodex/contacts.json` file as the CLI. The storage path can be overridden with the `ROLODEX_STORAGE_PATH` environment variable.

### Layout

The app has a three-region layout:

```
┌──────────────────────────────────────────────────────────────┐
│  Top bar: "Rolodex" brand · stat pills · "+ New Contact"    │
├───────────┬──────────────────────────────────────────────────┤
│  Filter   │  Search bar                                      │
│  sidebar  │  ────────────────────────────────────────────    │
│           │  Contact list (scrollable)                       │
│  Trust ▾  │    Avatar · Name · primary email/domain          │
│  Tags ▾   │    Trust badge · tags (up to 2, then "+N")       │
└───────────┴──────────────────────────────────────────────────┘
│  Footer: "mc-rolodex · port 4221"                            │
└──────────────────────────────────────────────────────────────┘
```

### Search

The search bar at the top of the contact list panel accepts free-text queries. Search is **debounced at 150 ms** — results update automatically as you type without requiring a form submit. The result count is shown to the right of the input.

Search uses the same scoring logic as the CLI's `multi` mode, implemented in the web's `data.ts` layer:

| Field | Match type | Score |
|---|---|---|
| Name exact | exact | 100 |
| Phone digits | substring (≥3 digits) | 90 |
| Email prefix | prefix | 85 |
| Name prefix | prefix | 80 |
| Tag contains | substring | 75 |
| Email contains | substring | 70 |
| Domain contains | substring | 65 |
| Name contains | substring | 60 |

Results are sorted descending by score. The stat pill in the top bar shows the total count of matched contacts.

### Filter Sidebar

The left panel filters the contact list. Filters are applied server-side (API query parameters) and combine with the search query.

**Trust filter** — buttons for each level:

| Button | Filters to |
|---|---|
| All | No trust filter (default) |
| verified | `trustStatus === "verified"` |
| pending | `trustStatus === "pending"` |
| untrusted | `trustStatus === "untrusted"` |
| unknown | `trustStatus === "unknown"` |

Each trust button shows a count of matching contacts in the current result set. Clicking an active filter deactivates it (toggles).

**Tags filter** — appears below Trust when tags exist in the dataset. One button per unique tag across all contacts. Clicking a tag filters to contacts that have that tag. Clicking the active tag deactivates it.

Active filters are reflected as stat pills in the top bar (e.g. `tag: engineer`, `trust: verified`).

### Contact List

Each row shows:

- **Initials avatar** — first letters of the first two name words, uppercased (e.g. "Alice Chen" → "AC")
- **Name** — primary display label
- **Subtitle** — first email address, or first domain if no emails
- **Trust badge** — color-coded label (verified / pending / untrusted / unknown)
- **Tags** — up to 2 tags shown inline; additional tags collapsed to `+N`

Clicking a row opens the **detail modal**. Keyboard navigation is supported: `Tab` to focus a row, `Enter` or `Space` to open.

### Detail Modal

Clicking a contact opens a modal showing all stored fields:

| Section | Contents |
|---|---|
| Header avatar | Initials (same as list row) |
| Name | Contact's full name |
| Trust badge | Colored trust status label |
| Tags | All tags as chips |
| Email | All email addresses (bulleted list) — omitted if empty |
| Phone | All phone numbers (bulleted list) — omitted if empty |
| Domains | All associated domains (bulleted list) — omitted if empty |
| Notes | Freeform notes text — shown if non-empty |
| Last Verified | Formatted date (e.g. "March 5, 2026") — shown if set |
| Footer | Contact ID |

The modal has two actions:

- **Edit (✎ icon)** — opens the create/edit form modal pre-populated with the contact's data.
- **Delete** — shows an inline confirmation prompt ("Delete this contact? / Yes, delete / Cancel"). Deletion is optimistic: the contact is removed from the list immediately, then confirmed via API.

Close by clicking `×`, clicking the backdrop, or pressing `Escape`.

### Create / Edit Form Modal

The `+ New Contact` button in the top bar (or the edit icon in the detail modal) opens a form modal. Auto-focuses the Name field on open. Press `Escape` to cancel without saving.

Fields:

| Field | Input type | Notes |
|---|---|---|
| Name | Text input | Required — cannot submit without a value |
| Emails | Chip input | Press `Enter` or `,` to add an entry; `Backspace` on empty input removes the last chip |
| Phones | Chip input | Same chip controls |
| Domains | Chip input | Same chip controls |
| Tags | Chip input | Same chip controls |
| Trust Status | `<select>` dropdown | Options: verified / pending / untrusted / unknown (default: unknown) |
| Notes | Textarea (3 rows) | Optional freeform text |

The submit button reads "Create Contact" for new contacts and "Save Changes" for edits. After a successful save the modal closes and the contact list refreshes.

### REST API

The web UI is backed by Next.js API routes that read/write `contacts.json` directly:

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/contacts` | List/search contacts. Query params: `q` (search text), `tag` (filter by tag), `trust` (filter by trust level). Returns `{ contacts, tags, total }`. |
| `POST` | `/api/contacts` | Create a contact. Body: `{ name, emails?, phones?, domains?, tags?, trustStatus?, notes? }`. Returns the created contact (201). |
| `GET` | `/api/contacts/:id` | Get a single contact by ID. Returns 404 if not found. |
| `PATCH` | `/api/contacts/:id` | Update a contact (partial). Same fields as POST. Returns updated contact. |
| `DELETE` | `/api/contacts/:id` | Delete a contact. Returns `{ ok: true }` on success, 404 if not found. |

---

## Communication History

mc-rolodex does not currently track per-contact communication history. The `notes` field on a contact is the only freeform text storage. Communication routing decisions (e.g. "send via Telegram vs email") are made by the caller based on the `emails`, `phones`, and `tags` fields — the rolodex provides the lookup, not the routing logic.

---

## Programmatic API

The plugin exports its core types and classes for use by other plugins:

```typescript
import { SearchEngine, ContactBrowser } from '@miniclaw/mc-rolodex';
import type { Contact, SearchQuery, SearchResult, ContactStore } from '@miniclaw/mc-rolodex';

// Initialize engine (uses default storage path)
const engine = new SearchEngine();

// Add a contact
engine.add({ id: 'contact_001', name: 'Alice', emails: ['alice@example.com'] });

// Search
const results = engine.search({ text: 'alice', type: 'name', limit: 10 });

// Look up by ID
const contact = engine.getById('contact_001');

// Get all
const all = engine.getAll();

// Update (partial — only provided fields are changed)
engine.update('contact_001', { trustStatus: 'verified' });

// Delete
engine.delete('contact_001');
```

The `ContactStore` interface defines the contract:

```typescript
interface ContactStore {
  getAll(): Contact[];
  getById(id: string): Contact | null;
  add(contact: Contact): void;
  update(id: string, contact: Partial<Contact>): void;
  delete(id: string): void;
  search(query: SearchQuery): SearchResult[];
}
```

Every mutating call (`add`, `update`, `delete`) writes the full contacts array to disk before returning.
