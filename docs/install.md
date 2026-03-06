# MiniClaw Installation Guide

This document explains how to install MiniClaw from scratch, what each step does,
what gets installed where, and how to recover from common failures.

---

## Overview

Installation uses two scripts:

| Script | Role |
|--------|------|
| `bootstrap.sh` | One-liner entry point. Installs system deps, then calls `install.sh`. |
| `install.sh` | Installs MiniClaw plugins, CLI tools, vault, crons, and LaunchAgents. |

Both scripts are **idempotent** — they check before acting and skip anything already
present. Re-running is safe.

---

## Prerequisites

| Requirement | Minimum | Notes |
|-------------|---------|-------|
| macOS | 13 (Ventura) | Checked at runtime; install aborts if older |
| Architecture | Apple Silicon (arm64) or Intel (x86_64) | Auto-detected |
| Disk space | ~20 GB free | Homebrew + Node.js + plugins + local model cache |
| Internet | Required | Downloads Homebrew, Node, npm packages, QMD |
| `sudo` access | Required | Needed by Homebrew installer |
| Terminal | zsh or bash | Shell profile files updated automatically |
| Git Butler | Latest | Required for isolated per-card virtual branches; installed automatically by `install.sh` via `brew install --cask gitbutler` |

---

## Quick Start

### One-liner (stable release)

```bash
curl -fsSL https://raw.githubusercontent.com/augmentedmike/miniclaw-os/v1.0.0/bootstrap.sh | bash
```

### One-liner (latest main)

```bash
curl -fsSL https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/bootstrap.sh | bash
```

### From a local clone

```bash
git clone https://github.com/augmentedmike/miniclaw-os.git
cd miniclaw-os
./bootstrap.sh        # full install
# or
./install.sh          # plugins + vault only (assumes deps already installed)
./install.sh --check  # verify only — no changes made
```

---

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MINICLAW_VERSION` | `v0.0.1` | Tag to clone when installing miniclaw-os repo |
| `OPENCLAW_DIR` | `$HOME/.openclaw` | OpenClaw home (config, state root) |
| `OPENCLAW_STATE_DIR` | `$OPENCLAW_DIR` | Runtime state dir (cards, logs, workspace). Set to `$HOME/am` on AugmentedMike's machine. |
| `LOCAL_BIN` | `$HOME/.local/bin` | Where CLI tools are copied |

Set these before running if you want a non-default location:

```bash
OPENCLAW_STATE_DIR="$HOME/am" ./install.sh
```

---

## bootstrap.sh — Step by Step

The bootstrap is the one-liner entry point. It installs system dependencies,
then hands off to `install.sh`.

### Step 1 — Preflight

- Confirms macOS (Linux is rejected with a clear error).
- Checks macOS version ≥ 13.
- Prompts for `sudo` if not already cached. Keeps sudo alive in the background
  for the duration of the install so you are not re-prompted.
- **Failure**: If `sudo` is denied the install exits immediately.

### Step 2 — Homebrew

- If `brew` is on PATH: runs `brew update --quiet` (non-fatal if it fails).
- If missing: downloads and runs the official Homebrew installer.
- On Apple Silicon, adds `eval "$(brew shellenv)"` to `~/.zprofile` and
  `~/.zshrc` if not already there.
- **Failure**: If Homebrew install fails (network error, Xcode CLT missing),
  the script exits. Fix: install Xcode Command Line Tools first:
  `xcode-select --install`

### Step 3 — Node.js 22 LTS

- Checks if Node.js ≥ 18 is present.
- If older or missing: installs `node@22` via Homebrew and links it.
- Adds the Node.js bin directory to PATH in `~/.zprofile` and `~/.zshrc`.
- Verifies `npm` is available after install.
- **Failure**: If `npm` is not found after install, exit. Fix: run
  `brew link --overwrite node@22` manually.

### Step 4 — Git

- Installs Git via Homebrew if not present.
- macOS ships a stub git that prompts to install Xcode CLT; Homebrew git is
  preferred.

### Step 5 — Python 3

- Installs `python@3` via Homebrew if `python3` is not on PATH.
- Used internally to patch `openclaw.json` (pure stdlib, no pip requirements).

### Step 6 — jq

- Installs `jq` via Homebrew if missing.
- Used by cron registration scripts.

### Step 7 — age

- Installs `age` (file encryption tool) via Homebrew if missing.
- Used by the `mc-vault` CLI for secret storage.

### Step 8 — Bun

- Checks `$HOME/.bun/bin/bun` or PATH.
- If missing: runs the official Bun installer (`curl … | bash`).
- Adds `$HOME/.bun/bin` to PATH in shell profiles.
- **Failure**: Curl must be able to reach bun.sh. On failure, install manually:
  `curl -fsSL https://bun.sh/install | bash`

### Step 9 — QMD

- Installs `qmd` globally via Bun if not present.
- QMD is the vector memory daemon used by `mc-kb` and `mc-board`.
- Non-fatal if it fails — a warning is printed and you can run
  `bun install -g qmd` later.

### Step 10 — OpenClaw

- Checks if `openclaw` is on PATH.
- If missing: installs from the MiniClaw fork via npm:
  `npm install -g github:augmentedmike/openclaw`
- Creates `$OPENCLAW_DIR/openclaw.json` with minimal defaults if it does not
  exist.
- **Failure**: npm network error or GitHub auth issue. Fix: ensure npm can
  reach GitHub. If behind a proxy set `npm config set proxy …`.

### Step 11 — PATH

- Ensures `$HOME/.local/bin` is in PATH (shell profiles updated if needed).
- Prints a warning if a shell restart is needed.

### Step 12 — Clone / update miniclaw-os

- If already running inside a local clone: skips (uses in-place repo).
- If the repo is already cloned at `$OPENCLAW_DIR/projects/miniclaw-os` at the
  right version tag: skips.
- If the repo exists but is at a **different** version tag: runs
  `rm -rf $OPENCLAW_DIR/projects/miniclaw-os` then re-clones at the requested
  tag. **This deletes the entire directory.** Any local modifications to the
  cloned repo will be lost. If you have local changes there, stash or back them
  up before upgrading.
- Otherwise: clones the repo at the requested version tag with `--depth 1`.
- **Failure**: network error or tag not found. Fix: check the
  `MINICLAW_VERSION` variable and ensure the tag exists on GitHub.

### Step 13 — Hand-off

- Calls `exec bash "$MINICLAW_OS_DIR/install.sh"` — replaces the bootstrap
  process with the installer.

---

## install.sh — Step by Step

`install.sh` can be run standalone after the system dependencies are in place.
It is also called automatically at the end of `bootstrap.sh`.

**Check mode**: `./install.sh --check` verifies the current state without
making any changes.

### Step 1 — Homebrew

Same logic as bootstrap Step 2. install.sh is self-contained so it can be
run independently.

### Step 2 — Core dependencies

Installs (via Homebrew) if missing: Node.js 22, Git, Python 3, jq, age, Git Butler.
Each is checked before installing.

Git Butler (`/Applications/GitButler.app/Contents/MacOS/gitbutler-tauri`) is installed
via `brew install --cask gitbutler`. It is required for agents to create isolated virtual
branches per card. If the install fails (network error, Homebrew cask unavailable), a
warning is printed and installation continues — you can install it manually:
```bash
brew install --cask gitbutler
# or download from https://gitbutler.com
```

### Step 3 — Bun + QMD

Same as bootstrap Steps 8–9.

### Step 4 — OpenClaw

Same as bootstrap Step 10. Also creates or confirms `openclaw.json` in
`$OPENCLAW_STATE_DIR`.

### Step 5 — Directories

Creates:
- `$OPENCLAW_DIR/miniclaw/plugins/`
- `$OPENCLAW_DIR/projects/`

### Step 6 — Plugins

For each plugin directory under `plugins/` in the repo:
- Copies it to `$OPENCLAW_DIR/miniclaw/plugins/<name>/` using `rsync`
  (excludes `node_modules` and `.git`).
- Runs `bun install` in the plugin directory to install npm dependencies.
- Prints `Installed` or `Updated` depending on whether the destination existed.

All 10 plugin directories in the repo are copied to disk:
mc-board, mc-context, mc-designer, mc-docs, mc-jobs, mc-kb, mc-queue,
mc-rolodex, mc-soul, mc-trust.

> **Note**: copying a plugin to disk does not register or enable it.
> Registration happens in Step 7 and only covers a subset of these plugins.
> `mc-docs`, `mc-jobs`, and `mc-rolodex` are intentionally copied but left
> unregistered — they have no entry in `plugin_defaults` and will not appear
> in `openclaw.json` unless added manually.

### Step 7 — openclaw.json patch

A Python script reads `$OPENCLAW_STATE_DIR/openclaw.json` and registers each
plugin that has a default config entry:
- Adds the plugin name to `plugins.allow`.
- Adds the plugin path to `plugins.load.paths`.
- Writes a default config block under `plugins.entries.<name>` (only if the
  key is not already present — existing config is preserved).

**What gets configured per plugin**:

| Plugin | Key config |
|--------|-----------|
| mc-board | `cardsDir`, `qmdBin`, `qmdCollection`, `webPort` (4220) |
| mc-context | message window sizes, channel application |
| mc-designer | Gemini model, `mediaDir`, `vaultBin` |
| mc-kb | `dbDir`, embedding model path, QMD settings |
| mc-queue | Claude Haiku model, Telegram bot name |
| mc-soul | (no config) |
| mc-trust | `trustDir`, `vaultBin`, session TTL |

**Registered plugins** (7 of 10): mc-board, mc-context, mc-designer, mc-kb,
mc-queue, mc-soul, mc-trust.

**Copied but not registered** (3): mc-docs, mc-jobs, mc-rolodex — present in
`$OPENCLAW_DIR/miniclaw/plugins/` but absent from `openclaw.json`. They will
not load unless you add them manually.

### Step 8 — CLI tools

Copies every file from `system/bin/` in the repo to `$HOME/.local/bin/` and
sets executable permissions. Warns if `~/.local/bin` is not in PATH.

**Tools installed**: `mc` (primary CLI entrypoint), `mc-doctor`, `mc-prompts`, `mc-smoke`, `mc-vault`, `youtube-video-learning`.

### Step 9 — User directories

Creates:
- `$OPENCLAW_DIR/user/memory/`
- `$OPENCLAW_DIR/soul-backups/`

### Step 10 — QMD collections

Registers a `mc-memory` QMD collection pointing at `$OPENCLAW_DIR/user/memory/`.
Non-fatal if QMD is not installed yet.

### Step 11 — Vault

- Initialises the vault at `$OPENCLAW_DIR/miniclaw/system/vault/` if
  `key.txt` does not exist (`mc-vault init`).
- Prompts for secrets interactively (terminal required):
  - `gh-token` — GitHub personal access token
  - `gmail-app-password` — Gmail app password
  - `gemini-api-key` — Google Gemini API key (optional, for mc-designer)
- Secrets are encrypted with `age` and stored in the vault directory.
- If run non-interactively (piped from curl), secret prompts are skipped with
  a warning. Run `./install.sh` directly afterward to enter secrets, or use:
  ```bash
  mc vault set gh-token
  ```

### Step 12 — Cron workers

Registers three board-worker cron jobs via the OpenClaw API
(`http://127.0.0.1:18789`):

| Cron | Schedule | Purpose |
|------|----------|---------|
| `board-worker-backlog` | every 5 min | Triage backlog → in-progress |
| `board-worker-in-progress` | every 5 min (offset 1) | Work on in-progress cards |
| `board-worker-in-review` | every 5 min (offset 2) | Review → ship cards |

**Failure**: If OpenClaw is not running, registration is skipped with a warning.
Run `./install.sh` again after starting OpenClaw to register the crons.

### Step 13 — Shell environment

Adds `export OPENCLAW_STATE_DIR=<path>` to `~/.zshrc` and `~/.bashrc` if not
already present.

### Step 14 — Board web LaunchAgent

Creates `~/Library/LaunchAgents/com.miniclaw.board-web.plist` to auto-start
the mc-board web server on port 4220 at login. Loads it immediately with
`launchctl load`.

---

## What Gets Installed Where

```
$HOME/
├── .bun/bin/                  # Bun runtime + qmd binary
├── .local/bin/                # MiniClaw CLI tools (mc-vault, mc-smoke, …)
├── .openclaw/                 # OpenClaw home (default; may be $HOME/am on custom setups)
│   ├── openclaw.json          # Main config — agents, plugins, model defaults
│   ├── miniclaw/
│   │   ├── plugins/           # Installed plugin directories
│   │   │   ├── mc-board/
│   │   │   ├── mc-context/
│   │   │   ├── mc-designer/
│   │   │   ├── mc-kb/
│   │   │   ├── mc-queue/
│   │   │   ├── mc-soul/
│   │   │   └── mc-trust/
│   │   └── system/
│   │       └── vault/         # Encrypted secrets (age)
│   ├── projects/
│   │   └── miniclaw-os/       # Cloned repo (if installed via bootstrap one-liner)
│   ├── user/
│   │   └── memory/            # QMD-indexed memory files
│   └── soul-backups/          # Soul/identity backups
├── Library/LaunchAgents/
│   └── com.miniclaw.board-web.plist  # Board web auto-start
```

npm global packages (OpenClaw): installed to the active npm global prefix
(typically `/opt/homebrew/lib/node_modules/` on Apple Silicon).

---

## Re-run Safety (Idempotency)

Both scripts are designed to be re-run safely:

- **`command -v <tool>`** guards every binary install — already-installed tools
  are skipped.
- **`brew update`** is run on Homebrew if present (non-fatal).
- **Plugins** are synced with `rsync` — existing files are updated, new ones
  added. Plugin config in `openclaw.json` is only written if the key is absent.
- **`openclaw.json`** is created only if missing; the patch step uses
  `setdefault` so existing config is never overwritten.
- **Vault**: `mc-vault init` is skipped if `key.txt` already exists.
- **Cron jobs**: checked by name against the OpenClaw API before registering.
- **LaunchAgent**: the plist is only written if it does not already exist.
- **Shell profiles**: each addition is guarded with `grep -q` before appending.

**Safe to run after updates**: `./install.sh` will update plugin files and
register any new cron jobs or CLI tools without touching existing config or
secrets.

---

## Common Failure Modes and Fixes

### Homebrew install fails

**Symptom**: `Homebrew install failed` and exit.
**Cause**: Missing Xcode Command Line Tools, network error, or permission issue.
**Fix**:
```bash
xcode-select --install   # install CLT first
# then re-run bootstrap
```

### Node.js not found after install

**Symptom**: `npm not found after Node.js install`
**Fix**:
```bash
brew link --overwrite node@22
source ~/.zshrc
```

### OpenClaw install fails

**Symptom**: `OpenClaw install failed` and exit.
**Cause**: npm cannot reach GitHub, or a proxy is blocking the request.
**Fix**:
```bash
npm install -g github:augmentedmike/openclaw
```
If behind a corporate proxy:
```bash
npm config set proxy http://proxy.example.com:8080
```

### QMD install fails

**Symptom**: Warning `QMD install failed`
**Cause**: Bun not in PATH, or network issue.
**Fix** (non-fatal, run manually):
```bash
export PATH="$HOME/.bun/bin:$PATH"
bun install -g qmd
```

### Secret prompts skipped (curl | bash)

**Symptom**: Warning `No terminal available — skipping secret prompts`
**Cause**: Stdin is the pipe from curl; interactive prompts cannot be shown.
**Fix**: Run install.sh directly to enter secrets:
```bash
./install.sh
# or set individual secrets:
mc vault set gh-token
mc vault set gmail-app-password
mc vault set gemini-api-key
```

### Cron registration skipped

**Symptom**: Warning `Could not register '<name>' — OpenClaw may not be running`
**Cause**: OpenClaw API is not reachable on port 18789.
**Fix**: Start OpenClaw, then re-run the installer:
```bash
openclaw start
./install.sh
```

### Board web LaunchAgent fails to load

**Symptom**: Warning `LaunchAgent created — run: launchctl load …`
**Fix**:
```bash
launchctl load ~/Library/LaunchAgents/com.miniclaw.board-web.plist
```
Check the log for errors:
```bash
tail -f "$STATE_DIR/logs/miniclaw-board-web.log"
# default: ~/.openclaw/logs/miniclaw-board-web.log
# custom:  ~/am/logs/miniclaw-board-web.log (if OPENCLAW_STATE_DIR=$HOME/am)
```

### Plugin bun install fails

**Symptom**: Warning `bun install failed in <plugin>`
**Fix**: Navigate to the plugin directory and install manually:
```bash
cd ~/.openclaw/miniclaw/plugins/<plugin-name>
bun install
```

### `~/.local/bin` not in PATH

**Symptom**: `mc-vault` or `mc-smoke` not found after install.
**Fix**:
```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

---

## Post-Install Verification

```bash
mc-smoke            # smoke test: checks all tools, plugins, vault
openclaw --version  # confirm OpenClaw is installed
openclaw start      # start the agent server
open http://localhost:4220  # open the board web UI
```

---

## Logs

Both scripts append to `/tmp/miniclaw-install.log`. If something goes wrong,
check this file for the full output:

```bash
cat /tmp/miniclaw-install.log
```
