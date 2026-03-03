# BACKUPS.md — Backup & Snapshot Guide

## oc-soul backup

`oc-soul backup <name>` is the soul backup tool. Use it after any meaningful change.

**What it backs up (hardcoded in `/Users/augmentedmike/.local/bin/oc-soul`):**
```
workspace/SOUL.md
workspace/IDENTITY.md
workspace/USER.md
workspace/AGENTS.md
workspace/HEARTBEAT.md
workspace/TOOLS.md
openclaw.json
```

Snapshots land in `~/.openclaw/soul-backups/<name>/`.

---

## What oc-soul does NOT back up

Everything else — including:

- `~/.openclaw/miniclaw/` — **plugin code lives here, not in soul backups**
- `~/.openclaw/projects/openclaw/` — the fork
- `~/.openclaw/workspace/BOND.md`, `memory/`, etc.
- Any other workspace files not in the list above

---

## How to backup plugin code

The miniclaw plugin directory is tracked in the **outer `.openclaw` git repo**:

```bash
cd ~/.openclaw
git add -A
git commit -m "your message"
git log --oneline -5   # get commit hash
```

After significant plugin work, do both:
1. `oc-soul backup <name>` — soul files + config
2. `cd ~/.openclaw && git add -A && git commit -m "..."` — everything else

---

## Expanding oc-soul (if needed)

To add more files to `oc-soul`, edit `/Users/augmentedmike/.local/bin/oc-soul` and add entries to the `SOUL_FILES` array:

```bash
SOUL_FILES=(
  "workspace/SOUL.md"
  ...
  "miniclaw/plugins/smart-context/index.ts"   # example addition
)
```

Or point it at a whole directory with a loop — the script is plain bash, easy to extend.
