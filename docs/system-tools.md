# System Tools Reference

The `system/bin/` directory contains the operator's day-to-day CLI tools for managing a MiniClaw installation. These are installed into PATH by `install.sh`.

---

## mc — MiniClaw CLI

**Purpose:** Top-level entry point for all MiniClaw operations. Routes subcommands to the appropriate openclaw plugin or standalone binary.

**Usage:**
```
mc <subcommand> [args...]
mc help | --help | -h
```

**Subcommands:**

| Subcommand | Routes to | Description |
|------------|-----------|-------------|
| `board` | `openclaw mc-board` | Kanban task board (prefrontal cortex) |
| `designer` | `openclaw mc-designer` | Image generation studio (occipital lobe) |
| `trust` | `openclaw mc-trust` | Cross-agent trust and cryptographic identity |
| `vault` | `mc-vault` | Age-encrypted secrets manager |
| `smoke` | `mc-smoke` | System health check |
| *(anything else)* | `openclaw <args>` | Direct passthrough to the openclaw binary |

**Examples:**
```bash
mc board list
mc board create --title "Fix bug" --priority high
mc board move abc123 in-progress
mc designer gen "a serene mountain landscape"
mc designer stats
mc trust init
mc trust sign "hello world"
mc vault get gh-token
mc smoke
mc --version          # passthrough to openclaw --version
```

**When to use:** Use `mc` as your primary interface. It normalises the command surface so you don't need to remember which subcommands live in `openclaw` vs standalone binaries.

---

## mc-doctor — Diagnose and repair MiniClaw

**Purpose:** Runs the same checks as `mc-smoke` but attempts to repair any failures it finds. Safe to re-run — skips anything already healthy.

**Usage:**
```
mc-doctor            # interactive mode — asks before each fix
mc-doctor --auto     # auto-fix everything without prompting
```

**Flags:**

| Flag | Behaviour |
|------|-----------|
| *(none)* | Interactive: prompts `[Y/n]` before each repair action |
| `--auto` | Non-interactive: applies all fixes automatically |

**Checks and repairs performed (in order):**

| Section | Checks | Repair action |
|---------|--------|---------------|
| **Homebrew** | `brew` on PATH | Runs the official Homebrew installer |
| **age** | `age` on PATH | `brew install age` |
| **bun** | `bun` on PATH or at `~/.bun/bin/bun` | Official bun install script |
| **qmd** *(optional)* | `qmd` on PATH | `bun install -g qmd` |
| **qmd collections** | `mc-memory` and `workspace` collections registered | `qmd collection add <col> <path>` |
| **openclaw** | `openclaw` on PATH | `npm install -g openclaw@latest` |
| **openclaw.json** | Config file present at `$OPENCLAW_STATE_DIR/openclaw.json` | Creates minimal config with Python |
| **vault** | `mc-vault` on PATH, key initialised, encrypt/decrypt works | `mc-vault init` |
| **directories** | `soul-backups/`, `projects/`, `user/memory/` exist | `mkdir -p` |
| **plugin deps** | `node_modules` present for each plugin | `bun install` per plugin |

**Exit codes:**
- `0` — no failures (fixes and skips are fine)
- `1` — one or more checks could not be repaired

**Output format:**
```
  [✓] already healthy
  [+] was fixed
  [-] skipped
  [✗] failed to repair

  ── Summary ──
  2 fixed  1 skipped  0 failed
```

**When to use:**
- After a fresh clone/install to get everything working
- When `mc-smoke` reports failures and you want guided repair
- After moving the installation to a new machine

---

## mc-smoke — System health check

**Purpose:** Read-only verification that all MiniClaw systems and tools are present and functional. Does not modify anything. Exit code indicates pass/fail.

**Usage:**
```
mc-smoke
```

**No flags.**

**Checks performed:**

| Section | What is checked |
|---------|----------------|
| **mc-vault** | On PATH; vault key initialised; encrypt/decrypt roundtrip succeeds |
| **age** | `/opt/homebrew/bin/age` and `/opt/homebrew/bin/age-keygen` are executable |
| **qmd** *(optional)* | On PATH; `mc-memory` and `workspace` collections registered; search functional |
| **soul-backups** *(optional)* | Directory exists; reports snapshot count |
| **inbox** | `~/.claude-inbox/msg` executable; `check` command returns 0 |
| **openclaw** | On PATH; `openclaw.json` present |
| **runtime** | `bun` and `node` present with version; `uv` present *(optional)* |
| **plugin tests** | Runs `bun test` for each plugin that has test files; reports pass/fail counts |

**Output format:**
```
── section name
  ✓  check that passed
  ✗  check that failed  →  how to fix it
  ⚠  optional check not met  →  how to fix it

────────────────────────────────────────
  12 passed  2 warned  0 failed
────────────────────────────────────────
```

**Exit codes:**
- `0` — all required checks passed (warnings are allowed)
- `1` — one or more required checks failed

**When to use:**
- Daily or after any deployment change to confirm the system is healthy
- Before filing a bug report — paste `mc-smoke` output for diagnostics
- In CI or cron to alert on regressions
- After `mc-doctor` to confirm repairs took effect

---

## mc-prompts — Manage cron job prompts as files

**Purpose:** Keeps long agent prompts in version-controlled `.md` files rather than embedded in `jobs.json`. Syncs file contents into the `message` field of each cron job that references a `messageFile`.

**Usage:**
```
mc-prompts sync              # load all messageFile contents into jobs.json
mc-prompts edit <name>       # open a prompt file in $EDITOR, then offer to sync
mc-prompts list              # list all prompt files
mc-prompts show <name>       # print a prompt file to stdout
mc-prompts diff              # show jobs whose jobs.json message differs from the file
```

**File layout:**
```
$OPENCLAW_STATE_DIR/cron/
  jobs.json          # cron job definitions
  prompts/
    <name>.md        # one file per prompt
```

The tool resolves `jobs.json` from `$OPENCLAW_STATE_DIR/cron/jobs.json`, falling back to `~/.openclaw/cron/jobs.json`.

**Subcommand details:**

### `sync`
Reads every job in `jobs.json` that has a `payload.messageFile` field. Loads the file content and writes it into `payload.message`. Rewrites `jobs.json` atomically. Reports how many jobs were updated.

```bash
mc-prompts sync
# → synced: nightly-digest
# → Done — 1 job(s) updated.
```

### `edit <name>`
Opens `prompts/<name>.md` in `$EDITOR` (falls back to `nano`). After you save and close, prompts to sync the change into `jobs.json`.

```bash
mc-prompts edit nightly-digest
# Opens editor → save → "Sync to jobs.json now? [Y/n]"
```

### `list`
Lists all `.md` files in the prompts directory, one name per line (no extension).

```bash
mc-prompts list
# → morning-standup
# → nightly-digest
```

### `show <name>`
Prints the raw contents of `prompts/<name>.md` to stdout.

```bash
mc-prompts show nightly-digest
```

### `diff`
Compares the `message` field in `jobs.json` against the current file content for every job with a `messageFile`. Reports jobs that are out of sync or whose file is missing.

```bash
mc-prompts diff
# → DIFFERS: nightly-digest
# → All in sync.   (when everything matches)
```

**Typical workflow:**
1. Edit a prompt: `mc-prompts edit nightly-digest`
2. Verify nothing is out of sync: `mc-prompts diff`
3. Push sync before deploying cron: `mc-prompts sync`

**When to use:** Any time you maintain cron agent prompts that are longer than a one-liner. Keeping them in `.md` files makes them diffable in git and editable in your preferred editor rather than buried in JSON.

---

## Quick reference

| Tool | Read-only? | Modifies system? | When to reach for it |
|------|-----------|-------------------|----------------------|
| `mc` | — | via subcommand | Every day — main entry point |
| `mc-smoke` | Yes | No | Verify health, diagnose |
| `mc-doctor` | No | Yes (on confirm) | Fix a broken install |
| `mc-prompts` | No (sync/edit) | `jobs.json` only | Manage cron prompt files |
