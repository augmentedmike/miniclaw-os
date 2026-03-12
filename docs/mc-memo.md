# mc-memo — Per-Card Working Memory

mc-memo is a short-term scratchpad for agent runs. It stores timestamped notes in per-card markdown files, preventing agents from repeating failed approaches within or across sessions on the same card.

---

## Overview

Each board card gets its own memo file (`<card_id>.md`). Notes are appended with ISO timestamps. Agents should read memos at the start of every session on a card to recover prior context: failed approaches, completed irreversible steps, and environment conflicts.

The memo system is deliberately simple — flat files, append-only, no database. It solves the problem of agents re-trying things that already failed.

---

## CLI Commands

All commands use `openclaw mc-memo <subcommand>`.

### `write <cardId> <note>`
Append a timestamped note to the card's memo file.

```
openclaw mc-memo write crd_d1908fb6 "Tried TURBOPACK=1, breaks build. Must unset."

Example output:
  Memo written to .../memos/crd_d1908fb6.md
```

### `read <cardId>`
Print all memo notes for a card.

```
openclaw mc-memo read crd_d1908fb6

Example output:
  2026-03-11T14:30:00.000Z Tried approach A, got error: ENOENT
  2026-03-11T14:45:00.000Z DB migrated, do not re-run migration
```

Returns `(no memos yet)` if no notes exist.

---

## Agent Tools

| Tool | Description |
|------|-------------|
| `memo_write` | Append a timestamped note to a card's scratchpad. Parameters: `cardId`, `note` (both required). Use to record failed approaches, completed steps, and env conflicts. |
| `memo_read` | Read all scratchpad notes for a card. Parameter: `cardId` (required). Always call at the start of a session on a card. |

---

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `memoDir` | string | `$OPENCLAW_STATE_DIR/USER/<bot_id>/memos` | Directory for memo files |

---

## State Storage

```
$OPENCLAW_STATE_DIR/USER/<bot_id>/memos/
  <card_id>.md       One file per card, append-only timestamped notes
```

Each line in a memo file is: `<ISO timestamp> <note text>`

---

## Best Practices

- **Read first:** Always call `memo_read` at the start of a session on any card.
- **Be specific:** Write notes that future sessions can act on — include error messages, commands tried, and why they failed.
- **Record irreversibles:** Note completed migrations, deployed changes, or anything that should not be re-run.
- **Record env conflicts:** Note environment variables, flags, or configs that cause issues.
