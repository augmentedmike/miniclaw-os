# mc-board — Architecture, State Machine, and CLI Reference

mc-board is the kanban board plugin for Mini Claw. It is the agent's prefrontal cortex: the canonical store of what work exists, who is doing it, and what state it is in. It backs both the `openclaw mc-board` CLI and the web UI.

---

## Architecture Overview

```
openclaw mc-board <command>           ← CLI entry point
       │
       ├── cli/commands.ts            ← registerBrainCommands() — all subcommands
       │
       ├── src/store.ts               ← CardStore — card CRUD, SQLite backend
       ├── src/project-store.ts       ← ProjectStore — project CRUD
       ├── src/active-work.ts         ← ActiveWorkStore — live worker state
       ├── src/state.ts               ← State machine: columns, gates, transitions
       ├── src/card.ts                ← Card type, serializer, parser
       ├── src/db.ts                  ← SQLite schema and openDb()
       ├── src/board.ts               ← Rendering helpers (renderFullBoard, etc.)
       ├── src/archive.ts             ← ArchiveStore — gzip JSONL archives
       └── src/dedup.ts               ← Title conflict detection
```

**Database:** Single SQLite file at `$OPENCLAW_STATE_DIR/board.db`. WAL mode is enabled for concurrent reads from the web UI while the CLI writes. `better-sqlite3` is used for synchronous access — no async complexity.

---

## Column Flow

Cards move through four columns in strict order. No skipping, no going back.

```
backlog ──(pickup)──► in-progress ──(submit)──► in-review ──(approve)──► shipped
                                                     │
                                             [verify failed — system only]
                                                     │
                                                     ▼
                                               in-progress
```

- **backlog** — card exists, not yet started
- **in-progress** — agent is actively working on this
- **in-review** — work submitted, awaiting critic/audit
- **shipped** — approved and done

The `verify failed` path is a system-only transition (not available via `mc-board move`). It fires automatically when a `verify`-type card is shipped with unchecked criteria — it archives the verify card and resurfaces the linked work card back to `in-progress`.

---

## Gate Rules

Every column transition has a gate. The gate must pass before the move is allowed. Use `--force` to bypass (recovery only).

| Transition | Gate | What is checked |
|---|---|---|
| `backlog → in-progress` | `gatePickup` | `title`, `problem_description`, `implementation_plan`, `acceptance_criteria` must all be non-empty |
| `in-progress → in-review` | `gateSubmit` | All `- [ ]` checkboxes in `acceptance_criteria` must be checked (`- [x]`) |
| `in-review → shipped` | `gateApprove` | `review_notes` must be non-empty |
| `in-review → in-progress` | `gateNone` | No gate (system-triggered verify failure) |

**Gate failure example:**

```
GATE VIOLATION: backlog → in-progress

Unmet conditions:
  ✗ implementation_plan  required before starting work
  ✗ acceptance_criteria  required before starting work

Fix with:
  miniclaw brain update CARD_ID \
    --plan "..." \
    --criteria "- [ ] ..."
  miniclaw brain move CARD_ID in-progress
```

### Card Sort Order

Within any column, cards are sorted:
1. **focus tag** — cards tagged `focus` appear first
2. **active** — cards currently in the active-work table
3. **priority** — `critical` → `high` → `medium` → `low`
4. **age** — oldest cards first within the same priority

---

## Card Data Model

A card is stored as a row in the `cards` table. Key fields:

| Field | Type | Description |
|---|---|---|
| `id` | `TEXT PK` | `crd_<8 hex chars>` — generated with `crypto.randomBytes(4)` |
| `title` | `TEXT` | Short description of the work |
| `col` | `TEXT` | Current column: `backlog`, `in-progress`, `in-review`, `shipped` |
| `priority` | `TEXT` | `critical`, `high`, `medium`, `low` (default: `medium`) |
| `tags` | `TEXT` | JSON array of strings, e.g. `["focus", "bug"]` |
| `project_id` | `TEXT` | Optional FK to `projects.id` (`prj_<hex>`) |
| `work_type` | `TEXT` | Optional: `work` or `verify` |
| `linked_card_id` | `TEXT` | For verify cards: the source work card's ID |
| `created_at` | `TEXT` | ISO timestamp |
| `updated_at` | `TEXT` | ISO timestamp |
| `problem_description` | `TEXT` | Why this work is needed |
| `implementation_plan` | `TEXT` | How to solve it |
| `acceptance_criteria` | `TEXT` | Markdown checklist (`- [ ]` / `- [x]`) |
| `notes` | `TEXT` | Freeform notes / outcome |
| `review_notes` | `TEXT` | Critic/audit pass notes — required to ship |
| `research` | `TEXT` | Pre-work context, findings, links |
| `verify_url` | `TEXT` | URL to check during review (used by review agent) |
| `work_log` | `TEXT` | JSON array of `{at, worker, note, links?}` entries |

### Reserved Tags

| Tag | Meaning |
|---|---|
| `focus` | Pins card to top of its column |
| `on-hold` | Excludes card from triage/context when `--skip-hold` is passed |

---

## DB Schema

```sql
CREATE TABLE cards (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  col              TEXT NOT NULL DEFAULT 'backlog',
  priority         TEXT NOT NULL DEFAULT 'medium',
  tags             TEXT NOT NULL DEFAULT '[]',
  project_id       TEXT,
  work_type        TEXT,
  linked_card_id   TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  problem_description  TEXT NOT NULL DEFAULT '',
  implementation_plan  TEXT NOT NULL DEFAULT '',
  acceptance_criteria  TEXT NOT NULL DEFAULT '',
  notes            TEXT NOT NULL DEFAULT '',
  review_notes     TEXT NOT NULL DEFAULT '',
  research         TEXT NOT NULL DEFAULT '',
  verify_url       TEXT NOT NULL DEFAULT '',
  work_log         TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE card_history (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id  TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  col      TEXT NOT NULL,
  moved_at TEXT NOT NULL
);

CREATE TABLE projects (
  id          TEXT PRIMARY KEY,        -- prj_<hex>
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'active',
  work_dir    TEXT NOT NULL DEFAULT '', -- local git repo path
  github_repo TEXT NOT NULL DEFAULT '', -- e.g. owner/repo
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE active_work (
  card_id      TEXT PRIMARY KEY,
  project_id   TEXT,
  title        TEXT NOT NULL,
  worker       TEXT NOT NULL,
  col          TEXT NOT NULL,
  picked_up_at TEXT NOT NULL
);

CREATE TABLE pickup_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id    TEXT NOT NULL,
  project_id TEXT,
  title      TEXT NOT NULL DEFAULT '',
  worker     TEXT NOT NULL,
  col        TEXT NOT NULL DEFAULT '',
  action     TEXT NOT NULL,   -- 'pickup' or 'release'
  at         TEXT NOT NULL
);
```

Indexes: `idx_cards_col`, `idx_cards_project`, `idx_history_card`, `idx_pickup_log_at`.

---

## CLI Reference

All commands use `openclaw mc-board <subcommand>`. The alias `miniclaw brain` also works in live installs.

### Card Commands

#### `create`
Create a new card in backlog.

```
openclaw mc-board create --title <title> [options]

Required:
  --title <title>       Card title

Optional:
  --priority <p>        critical, high, medium, low  (default: medium)
  --tags <tags>         Comma-separated tags
  --project <id>        Link to project by ID (prj_<hex>)
  --work-type <type>    work | verify
  --linked-card-id <id> For verify cards: the source work card ID
  --problem <text>      Problem description
  --plan <text>         Implementation plan
  --criteria <text>     Acceptance criteria as markdown checklist
  --notes <text>        Notes / context
  --research <text>     Research notes
  --verify-url <url>    URL to check during review

Examples:
  openclaw mc-board create --title "Fix login bug" --priority high
  openclaw mc-board create --title "Add dark mode" --tags ui,miniclaw --problem "Users want dark mode"
  openclaw mc-board create --title "VERIFY: login fix" --work-type verify --linked-card-id crd_abc123
```

Duplicate title detection runs at create time (scoped to active, non-shipped cards within the same project if `--project` is specified).

---

#### `list`
List cards.

```
openclaw mc-board list [options]

Options:
  --column <col>    Filter by column: backlog, in-progress, in-review, shipped
  --project <id>    Filter by project ID
  --skip-hold       Exclude cards tagged 'on-hold'

Examples:
  openclaw mc-board list
  openclaw mc-board list --column backlog
  openclaw mc-board list --column in-progress --skip-hold
  openclaw mc-board list --project prj_a1b2c3d4
```

---

#### `show <id>`
Show full card detail — all fields, history, criteria progress.

```
openclaw mc-board show crd_abc123
```

---

#### `update <id>`
Update one or more fields. At least one option required.

```
openclaw mc-board update <id> [options]

Options:
  --title <title>
  --priority <p>           critical, high, medium, low
  --tags <tags>            REPLACES all existing tags
  --add-tags <tags>        Add tags without removing others
  --remove-tags <tags>     Remove specific tags
  --problem <text>
  --plan <text>
  --criteria <text>        Replaces acceptance criteria
  --notes <text>
  --review <text>          Review notes (required to ship)
  --research <text>
  --verify-url <url>
  --log <note>             Append a timestamped work log entry
  --link <url>             Add a PR/commit URL to the latest log entry
  --worker <id>            Worker ID for log entry (default: $OPENCLAW_AGENT_ID or 'agent')
  --project <id>           Link to project, or 'none' to unlink
  --work-type <type>       work | verify | none
  --linked-card-id <id>    Source work card ID for verify cards, or 'none'

Examples:
  openclaw mc-board update crd_abc123 --problem "Users can't log in via OAuth"
  openclaw mc-board update crd_abc123 --criteria "- [x] tests pass\n- [x] deployed"
  openclaw mc-board update crd_abc123 --review "Audit passed. Logic correct."
  openclaw mc-board update crd_abc123 --log "Implemented token refresh" --worker board-worker
```

The work log is **append-only** — `--log` never overwrites existing entries.

---

#### `move <id> <column>`
Advance a card to the next column. Gates are enforced.

```
openclaw mc-board move <id> <column> [--force]

Options:
  --force    Bypass gate checks (recovery only)

Examples:
  openclaw mc-board move crd_abc123 in-progress
  openclaw mc-board move crd_abc123 in-review
  openclaw mc-board move crd_abc123 shipped
  openclaw mc-board move crd_abc123 backlog --force   # recovery: reset stuck card
```

A duplicate title check also runs when moving to `in-progress` (catches duplication that slipped through at create time).

---

#### `delete <id>`
Delete a card permanently. Requires `--force`.

```
openclaw mc-board delete <id> --force
```

For shipped cards, use `archive` instead — it preserves the data.

---

#### `search <query>`
Search active cards by title, tags, problem description, or plan.

```
openclaw mc-board search <query> [--column <col>] [--project <id>]

Examples:
  openclaw mc-board search "login"
  openclaw mc-board search "sqlite" --column backlog
```

---

### Board Views

#### `board`
Show the full board — all cards grouped by column with priority and criteria progress.

```
openclaw mc-board board
```

#### `context --column <col>`
Dump all cards in a column as a rich LLM-ready block for triage or agent consumption.

```
openclaw mc-board context --column <col> [--skip-hold] [--tags <tags>]

Options:
  --column <col>    Required. backlog, in-progress, in-review, shipped
  --skip-hold       Exclude on-hold cards
  --tags <tags>     Comma-separated. Returns cards matching ANY of these tags

Examples:
  openclaw mc-board context --column backlog
  openclaw mc-board context --column backlog --skip-hold
  openclaw mc-board context --column in-progress --tags focus
```

#### `next`
Suggest the highest-priority actionable card.

```
openclaw mc-board next
```

Scoring: in-progress > in-review > backlog, then priority descending.

---

### Active Work Tracking

Board worker crons use `pickup` / `release` to record which card they are currently processing. This powers the live activity view in the web UI and the `active` command.

#### `pickup <id>`
```
openclaw mc-board pickup <id> --worker <name> [--column <col>]

Example:
  openclaw mc-board pickup crd_abc123 --worker board-worker-backlog
```

#### `release <id>`
```
openclaw mc-board release <id> --worker <name>

Example:
  openclaw mc-board release crd_abc123 --worker board-worker-backlog
```

#### `active`
Show all cards currently being worked by agent loops.

```
openclaw mc-board active
```

#### `pickup-log`
Show recent pickup/release history.

```
openclaw mc-board pickup-log [--limit <n>]
```

The pickup log is capped at 200 entries (oldest are trimmed automatically).

---

### Archive Commands

Shipped cards can be archived to keep the active board clean. Archives are gzip-compressed JSONL files that rotate at 5 MB.

Archive location: `$OPENCLAW_STATE_DIR/USER/brain/archive/`

#### `archive <id>`
Move a shipped card out of the board and into archive.

```
openclaw mc-board archive crd_abc123
```

Only `shipped` cards can be archived.

#### `archive-list`
List archive files with card count and size.

```
openclaw mc-board archive-list
```

#### `archive-search <query>`
Search archived cards by title or ID (case-insensitive substring).

```
openclaw mc-board archive-search "login"
openclaw mc-board archive-search crd_abc123
```

#### `archive-show <id>`
Show full detail of an archived card.

```
openclaw mc-board archive-show crd_abc123
```

---

### Project Commands

Projects are optional containers for cards, useful for grouping related work.

#### `project create`
```
openclaw mc-board project create --name <name> [--description <desc>] [--work-dir <path>] [--github-repo <repo>]

Example:
  openclaw mc-board project create --name "Telegram Overhaul" --work-dir ~/.openclaw/projects/openclaw --github-repo owner/repo
```

#### `project list`
```
openclaw mc-board project list [--all]
```

#### `project show <id>`
Show a project's board — all cards grouped by column.

```
openclaw mc-board project show prj_a1b2c3d4
```

#### `project update <id>`
```
openclaw mc-board project update <id> [--name] [--description] [--work-dir] [--github-repo]
```

#### `project archive <id>`
Hides the project from the default list. Cards are preserved.

```
openclaw mc-board project archive prj_a1b2c3d4
```

---

## Triage Agent Integration

The `triage` command runs Claude Haiku in a sandboxed subprocess to enrich a backlog card and optionally move it to `in-progress`.

```
openclaw mc-board triage <cardId> [options]

Options:
  --prompt <path>    Custom prompt file (uses built-in default if not found)
  --worker <name>    Worker ID for pickup/release/work_log (default: board-worker-triage)
  --log <path>       Path for log file (auto-generated if not specified)
  --no-move          Skip auto-move even if Haiku signals readiness

Example:
  openclaw mc-board triage crd_abc123
  openclaw mc-board triage crd_abc123 --worker cron-backlog --no-move
```

**How it works:**

1. Card is fetched and formatted as a markdown block
2. Haiku is invoked with `claude -p <prompt> --model claude-haiku-4-5-20251001 --output-format stream-json`
3. The prompt instructs Haiku to: fill in `research`, note gaps in `notes`, assess readiness, and append a `work_log` entry
4. Haiku responds with an `---APPLY---` JSON block containing fields to update
5. The CLI applies the updates, appends the work log, and optionally moves the card to `in-progress` if Haiku sets `move_to: "in-progress"` and the gate passes
6. If the gate fails on auto-move, the error is written to `card.notes` instead of crashing

The default prompt path is `$OPENCLAW_STATE_DIR/USER/brain/prompts/backlog-process.txt`. If not found, the built-in default is used.

The triage command calls `pickup` before running and `release` after — this makes the triage run visible in `mc-board active` while it is in-flight.

---

## Review / Verify Flow

mc-board supports a two-card pattern for work that needs external verification (e.g. checking a live URL):

1. A **work card** (`work_type: work`) is created for the implementation
2. After shipping the work card, a **verify card** (`work_type: verify`, `linked_card_id: <work_card_id>`) is created to confirm the deployment

The `--verify-url` field on a card is used by the review agent to load and inspect the live result.

**Auto-resurfacing on failure:** When a verify card is shipped and still has unchecked criteria (`- [ ]`), the system:
- Archives the verify card
- Resets all `[x]` criteria on the linked work card back to `[ ]`
- Moves the work card back to `in-progress` via the `verify failed` system transition

This is triggered automatically inside `mc-board move <verify-card-id> shipped`.

---

## Priority Shorthand

The `--priority` flag accepts both full names and single-letter aliases:

| Input | Resolved Priority |
|---|---|
| `critical`, `c` | `critical` |
| `high`, `h` | `high` |
| `medium`, `med`, `m` | `medium` |
| `low`, `l` | `low` |
