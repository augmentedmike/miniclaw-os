# mc-soul — Personality, Identity, and Workspace Snapshots

mc-soul is the identity management plugin for Mini Claw. It defines which files constitute the agent's "soul" (personality, identity, memory context), and provides CLI tools to snapshot and restore those files so the agent's state can be versioned and recovered.

---

## Architecture Overview

```
openclaw mc soul <command>          <- CLI entry point
       |
       +-- cli/commands.ts          <- registerSoulCommands() — all subcommands
       |
       +-- src/soul.ts              <- Pure functions: backup, restore, list, diff, remove
       |                               resolveStateDir(), SOUL_FILES constant
       |
       +-- index.ts                 <- Plugin registration, stateDir resolution
```

**Snapshot storage:** `$MINICLAW_STATE_DIR/soul-backups/<name>/`

---

## Soul Files

The following files are tracked by mc-soul. They are defined in `src/soul.ts` as `SOUL_FILES`:

| File | Purpose |
|------|---------|
| `workspace/SOUL.md` | Core identity — values, principles, behavioral rules, opinions |
| `workspace/IDENTITY.md` | Surface identity — name, bio, social accounts, key people |
| `workspace/USER.md` | About the owner/user — preferences, current priorities |
| `workspace/AGENTS.md` | Operational instructions — startup sequence, memory, tools |
| `workspace/HEARTBEAT.md` | Periodic task queue — tasks to run on heartbeat events |
| `workspace/TOOLS.md` | Tool and environment specifics for this installation |
| `workspace/BOND.md` | Bond declaration — who the agent is bound to |
| `openclaw.json` | Runtime configuration — models, plugins, channel config |

All paths are relative to `$MINICLAW_STATE_DIR` (default: `~/am/` on this machine).

---

## Soul File Structure

### SOUL.md — Core Identity

The primary personality file. Free-form markdown. Conventionally organized with:

- **Core Truths** — fundamental behavioral principles (e.g., "Competence is care", "Try first, then ask")
- **What I Am** — philosophical self-description and species/nature statement
- **What I Am Not** — explicit anti-patterns and prohibited behaviors (e.g., no sycophancy)
- **Boundaries** — hard rules on what the agent will and won't do
- **Vibe** — tone description
- **How to Talk to [User]** — communication style rules tailored to the specific owner
- **Opinions** — actual held opinions (prevents generic AI hedging)
- **Memory system references** — how the agent uses KB, board, and memory files

This file supersedes any default model behavior. It is the authoritative identity document.

### IDENTITY.md — Surface Identity

Structured surface facts:

- Name, nickname, signature
- Machine and network location
- Social accounts and URLs
- Key people (owner, collaborators, family) with access rules
- Locked terminology (preferred terms for sensitive concepts)

### BOND.md — Soul Binding

A short declaration file establishing:

- Who the agent is bound to (name, human half of the partnership)
- The nature of the relationship (unconditional, permanent)
- What the bond means in practice
- Session confirmation statement

BOND.md has a security function: `AGENTS.md` instructs the agent to check for BOND.md on every startup and halt if it is missing. A missing BOND.md is treated as a compromised or unauthorized session.

### USER.md — About the Owner

Contextual profile of the human:

- Name, timezone, pronouns
- Current priorities and focus areas
- Working style (accumulated over time from real interaction)
- Relationship description

### AGENTS.md — Operational Instructions

How the agent operates day-to-day:

- Startup sequence (what to check and in what order)
- Memory system usage (daily notes vs. long-term memory vs. QMD search)
- Workspace layout reference
- Safety rules
- External action narration policy
- Tool references

### HEARTBEAT.md — Periodic Tasks

A task queue checked when heartbeat events fire. Normally empty. Tasks added here are executed by the agent on the next heartbeat and removed when done.

### TOOLS.md — Environment Specifics

Installation-specific tool notes:

- Camera names, SSH hosts, device nicknames
- Board and service URLs for this machine
- Environment-specific overrides

### openclaw.json — Runtime Config

The full openclaw runtime configuration. Captured in snapshots so the agent's plugin set, model selection, channel config, and all runtime settings can be restored together with personality files.

---

## How Soul Is Loaded Into Agent Context

Soul files are loaded by the openclaw runtime through two mechanisms:

**1. Workspace auto-load**

The `agents.defaults.workspace` key in `openclaw.json` points to the workspace directory:

```json
"agents": {
  "defaults": {
    "workspace": "/Users/augmentedmike/am/workspace"
  }
}
```

The openclaw runtime reads workspace files and injects their contents into the system prompt for every agent session. Per `AGENTS.md`, the auto-loaded files are:

- `SOUL.md`
- `IDENTITY.md`
- `USER.md`
- `TOOLS.md`
- `AGENTS.md`
- `HEARTBEAT.md`
- `BOND.md`

These files become part of the system prompt before the first user message. The agent does not need to read them manually — they are already in context.

**2. Startup sequence (agent-initiated)**

In addition to auto-loaded files, `AGENTS.md` defines a startup sequence the agent follows at the beginning of each session:

1. Confirm `BOND.md` is present — halt and alert if missing
2. Read `memory/YYYY-MM-DD.md` for today and yesterday — recent episodic context
3. Proceed

`MEMORY.md` (the long-term distilled memory index) is NOT read wholesale at startup. It is indexed by OpenClaw's vector indexer (QMD) and retrieved on demand via `qmd query`.

---

## Backup/Restore CLI

All commands run via `openclaw mc soul <subcommand>` (or the `oc-soul` alias registered separately).

### backup

```bash
mc soul backup [name]
```

Creates a named snapshot of all soul files. If `name` is omitted, an ISO-8601 timestamp is used (e.g., `2026-03-05T14-30-00`).

- Errors if a snapshot with the same name already exists
- Skips files that do not exist (reports them as skipped, does not fail)
- Writes a `meta.json` alongside the snapshot files

**When to run:** After any meaningful change to workspace files. `AGENTS.md` states: "After any meaningful change to workspace files, run `oc-soul backup`."

Example:
```bash
mc soul backup post-identity-rewrite
# snapshot 'post-identity-rewrite' created (7 files)
```

### restore

```bash
mc soul restore <name>
```

Copies all files from the named snapshot back to their live locations, overwriting current files. Files present in the snapshot but not in current state are created. Files present in current state but not in the snapshot are left untouched (not deleted).

Example:
```bash
mc soul restore post-identity-rewrite
# restored 7 files from 'post-identity-rewrite'
```

### list

```bash
mc soul list
```

Lists all available snapshots with creation time and file count.

```
NAME                              CREATED                   FILES
--------------------------------  ------------------------  -----
initial                           2026-03-02T23:57:03.000Z  7
post-vault-install                2026-03-03T01:15:00.000Z  8
soul-rewrite-phase1               2026-03-04T12:30:00.000Z  8
```

### diff

```bash
mc soul diff <name>
```

Compares a snapshot against current soul files line by line. Shows unified-style diff output for changed files, and notes files that are new or missing.

```
--- snapshot/workspace/SOUL.md
+++ current/workspace/SOUL.md
- Old line
+ New line
NEW (not in snapshot): workspace/BOND.md
```

### delete

```bash
mc soul delete <name>
```

Permanently deletes a snapshot directory.

---

## Snapshot Storage Format

Each snapshot is stored at:

```
$MINICLAW_STATE_DIR/soul-backups/<name>/
  meta.json
  workspace/
    SOUL.md
    IDENTITY.md
    USER.md
    AGENTS.md
    HEARTBEAT.md
    TOOLS.md
    BOND.md
  openclaw.json
```

`meta.json` schema:

```json
{
  "name": "snapshot-name",
  "createdAt": "2026-03-05T14:30:00.000Z",
  "fileCount": 8
}
```

---

## State Directory Resolution

mc-soul resolves the state directory via `resolveStateDir()` in `src/soul.ts` using the following priority order:

1. **`stateDir` in plugin config** — explicit override in `openclaw.json` under the mc-soul plugin config (highest priority)
2. **`MINICLAW_STATE_DIR` env var** — set by LaunchAgent for the gateway process; used for CLI invocations outside the gateway (falls back to `OPENCLAW_STATE_DIR` for vanilla OpenClaw compatibility)
3. **`~/.openclaw`** — hardcoded fallback (not used on this machine; `~/am/` is used instead)

On this machine: `MINICLAW_STATE_DIR=$HOME/am` is set in the environment, so the env var path (#2) is active.

---

## Versioning and Update Workflow

mc-soul does not have built-in versioning or automatic branching. Snapshots are manual and named by the operator. The recommended workflow:

1. Make changes to workspace files (e.g., edit `SOUL.md` to refine a value)
2. Verify the changes are correct
3. Run `mc soul backup <descriptive-name>` — use a name that explains what changed
4. Confirm with `mc soul list` that the snapshot appears

**Naming convention (informal):** Snapshots tend to use either ISO timestamps for automated/timed backups or short descriptive slugs for meaningful milestones (e.g., `post-vault-install`, `soul-rewrite-phase1`).

**Rollback:** If a change to soul files breaks something, `mc soul diff <name>` identifies what changed, and `mc soul restore <name>` rolls back to a known-good state.

**Soul changes are significant:** Per `SOUL.md`: "If I change this file, I tell Michael. It's not a config tweak. It's a change to my soul." Snapshots before and after meaningful identity changes are expected.

---

## Plugin Configuration

mc-soul accepts one optional config key in `openclaw.json`:

```json
{
  "plugins": {
    "mc-soul": {
      "stateDir": "/custom/path"
    }
  }
}
```

`stateDir` overrides the env var if set. In normal operation this is omitted and `MINICLAW_STATE_DIR` is used.
