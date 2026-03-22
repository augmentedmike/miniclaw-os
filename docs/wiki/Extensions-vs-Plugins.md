# Extensions vs Plugins — Why They Drift and How to Fix It

## The Two Directories

MiniClaw maintains **two separate copies** of every plugin on disk:

| Directory | Used by | Purpose |
|---|---|---|
| `~/.openclaw/extensions/mc-*` | `openclaw mc-*` commands (OpenClaw plugin loader) | Runtime plugins for the `openclaw` CLI |
| `~/.openclaw/miniclaw/plugins/mc-*` | Standalone CLI wrappers (`mc-board`, `mc-kb`, etc.), `mc-rebuild-web`, board web app (port 4220) | MiniClaw's canonical source copy |

They are **independent filesystem copies** with no symlinks, watchers, or sync mechanism between them.

## Which Copy Is "Live" For What?

| Consumer | Reads from |
|---|---|
| `openclaw mc-board`, `openclaw mc-kb`, etc. | `~/.openclaw/extensions/` |
| `mc-board` (standalone CLI) | `~/.openclaw/miniclaw/plugins/` |
| `mc-kb`, `mc-memo`, `mc-email`, `mc-memory` (standalone) | `~/.openclaw/miniclaw/plugins/` |
| `mc-rebuild-web` (build script) | `~/.openclaw/miniclaw/plugins/mc-board/web/` |
| Board web app (Next.js on :4220) | `~/.openclaw/miniclaw/plugins/mc-board/web/` |
| `mc-smoke` health check | `~/.openclaw/miniclaw/plugins/` |

**This is the critical gotcha:** if you edit a file in `extensions/`, the `openclaw mc-*` commands see it immediately — but `mc-rebuild-web` builds from `miniclaw/plugins/`, so the web app never gets the change. And vice versa.

## How Files Get There

### Initial Install (`install.sh`)

```
repo source plugins/mc-*
  → rsync → ~/.openclaw/miniclaw/plugins/mc-*
    → rsync → ~/.openclaw/extensions/mc-*
```

Both directories start identical.

### Updates (`mc-update`)

```
release zip plugins-prebuilt/mc-*
  → rsync → ~/.openclaw/extensions/mc-*   ← ONLY extensions
```

`mc-update` does **not** update `miniclaw/plugins/`. After an update, `miniclaw/plugins/` still has the install-time version while `extensions/` has the new code.

### Agent/Developer Edits

Edits land wherever the tool or session happens to be working:
- Claude Code sessions with CWD in `extensions/` → edits go to `extensions/`
- Board worker card execution → may edit either copy depending on the card's instructions
- `mc-rebuild-web` builds from `miniclaw/plugins/` → developers sometimes edit there to fix build issues

**There is no mechanism to propagate edits from one copy to the other.**

## Why This Causes Bugs

### Symptom: "Feature was shipped but doesn't appear"

1. Agent builds a feature, edits files in `extensions/mc-board/web/`
2. Card gets marked "shipped"
3. `mc-rebuild-web` runs — builds from `miniclaw/plugins/mc-board/web/` which doesn't have the changes
4. Build either fails (missing imports) or succeeds with old code
5. Feature never appears on the live web app

### Symptom: "Build fails with module not found"

1. A component file exists in `extensions/` but not `miniclaw/plugins/`
2. An import reference gets added to a file in `miniclaw/plugins/` (or vice versa)
3. `mc-rebuild-web` can't resolve the import → build breaks

### Symptom: "Fix was applied but reverted itself"

1. Bug fix goes into `extensions/`
2. `mc-update` runs, rsyncs from release zip → overwrites the fix in `extensions/`
3. Fix was never in `miniclaw/plugins/` either, so it's gone from both

## The Fix: Consolidate to One Copy

The long-term fix is to eliminate the duplication entirely. Options:

### Option A: Symlink (simplest)

Make `~/.openclaw/extensions/mc-*` symlinks to `~/.openclaw/miniclaw/plugins/mc-*`. One copy, both paths work. Update `install.sh` and `mc-update` to only write to `miniclaw/plugins/` and create symlinks.

### Option B: Single source with build output separation

Keep plugin source in `miniclaw/plugins/` only. OpenClaw's plugin loader reads from there. Build artifacts (`.next/`, `node_modules/`) stay where they are.

### Option C: Move everything to extensions (OpenClaw-native)

Make `extensions/` the single source of truth. Update `mc-rebuild-web` and standalone CLI wrappers to read from `extensions/` instead of `miniclaw/plugins/`.

## Interim Workaround

Until the architecture is consolidated, after editing any plugin:

```bash
# Sync extensions → plugins (if you edited in extensions/)
rsync -a --exclude='node_modules' --exclude='.next' --exclude='.git' \
  ~/.openclaw/extensions/mc-board/ ~/.openclaw/miniclaw/plugins/mc-board/

# Sync plugins → extensions (if you edited in plugins/)
rsync -a --exclude='node_modules' --exclude='.next' --exclude='.git' \
  ~/.openclaw/miniclaw/plugins/mc-board/ ~/.openclaw/extensions/mc-board/

# Then rebuild
mc-rebuild-web
```

## The Upstream Path

Per project convention, the canonical development path is:

```
~/.openclaw/miniclaw/USER/projects/miniclaw-os/plugins/mc-*
```

Edits should go there first, then propagate via install/update. In practice this third copy adds another layer of drift — but it's the one that gets committed and released.
