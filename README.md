# miniclaw-os

The miniclaw plugin ecosystem for [OpenClaw](https://openclaw.ai).

A collection of plugins and CLI tools that extend OpenClaw into a full personal AI operating system — each piece modeled on a region of the brain.

---

## The Brain Map

| Plugin | Brain Region | What it does |
|--------|-------------|--------------|
| `mc-board` | Prefrontal cortex | Kanban board — tracks work from backlog → shipped with enforced state gates |
| `mc-designer` | Occipital lobe | Visual creation studio — layered image generation and compositing via Gemini |
| `mc-trust` | Immune system | Cross-agent trust and identity — cryptographic verification between agents |
| `mc-context` | Hippocampus | Engineered context windows — time-based retention, image pruning, memory injection |

CLI tools:

| Tool | What it does |
|------|-------------|
| `mc-vault` | Age-encrypted secret store — store API keys, tokens, and private notes on disk |
| `mc` | Thin CLI wrapper — `mc board`, `mc designer`, `mc trust`, `mc vault`, `mc smoke` |
| `mc-smoke` | Verifies the full miniclaw stack is installed and working |
| `mc-doctor` | Diagnoses and fixes miniclaw issues — interactive or `--auto` |

---

## Platform

**macOS (Apple Silicon)** — currently supported. Linux with full desktop access is in progress.

---

## Install

No other prerequisites needed. The installer handles everything from scratch.

```bash
git clone https://github.com/augmentedmike/miniclaw-os.git
cd miniclaw-os
./install.sh
```

This installs: Homebrew, Node.js, git, Python 3, jq, age, Bun, QMD, OpenClaw, all plugins, and CLI tools.

Restart OpenClaw to load the plugins, then verify:

```bash
mc-smoke
```

Re-running `install.sh` is safe — skips anything already installed, updates what's stale.

**Check-only mode** — verify prerequisites without making any changes:

```bash
./install.sh --check
```

**Fix issues** — run after mc-smoke reports failures:

```bash
mc-doctor          # interactive
mc-doctor --auto   # fix everything without prompting
```

---

## Plugin setup

Some plugins need additional configuration after install.

### mc-designer — Gemini API key

mc-designer requires a Google Gemini API key for image generation.

See **[plugins/mc-designer/docs/SETUP.md](plugins/mc-designer/docs/SETUP.md)** for a step-by-step guide.

Quick version:
1. Get a free key at `https://aistudio.google.com/app/apikey`
2. Set it: `openclaw config set plugins.entries.mc-designer.config.apiKey "YOUR_KEY"`

### mc-vault — initial setup

The installer initialises the vault and prompts for secrets during install. To manage secrets later:

```bash
mc vault list                   # list stored secrets
mc vault set my-key             # store a new secret (prompts for value)
mc vault get my-key             # retrieve a secret
```

---

## Usage

### mc-board — kanban board

```bash
mc board create --title "Fix login bug" --priority high
mc board list
mc board board
mc board move <id> in-progress
mc board move <id> in-review
mc board move <id> shipped
mc board archive <id>
```

Column flow: `backlog → in-progress → in-review → shipped`

### mc-designer — visual creation

```bash
# Generate an image
mc designer gen "a minimalist logo on white background"

# Work with canvases and layers
mc designer canvas create --name mybrand --width 1920 --height 1080
mc designer gen "blue gradient background" --canvas mybrand --layer bg
mc designer gen "bold sans-serif wordmark" --canvas mybrand --layer text
mc designer layer list mybrand
mc designer composite mybrand

# Usage and cost
mc designer stats
mc designer stats --full
```

### mc-trust — identity and verification

```bash
mc trust init                   # generate identity keypair for this agent
mc trust show                   # display this agent's public key
mc trust peer add <id> <key>    # register a peer's public key
mc trust peer list              # list known peers
mc trust revoke <id>            # remove trust for a peer
```

### mc-context

No manual interaction needed — runs automatically on every agent prompt build.

### mc-vault — secrets

```bash
mc vault set gh-token           # store (prompts for value)
mc vault get gh-token           # retrieve
mc vault export gh-token        # raw output for eval/piping
mc vault list                   # list all keys
```

---

## What the installer does

1. Installs Homebrew, Node.js 22, git, Python 3, jq, age
2. Installs Bun and QMD
3. Installs or updates OpenClaw (`npm install -g openclaw@latest`)
4. Creates `~/.openclaw/miniclaw/`, `~/.openclaw/projects/`, `~/.openclaw/soul-backups/`, `~/.openclaw/user/memory/`
5. Rsyncs each plugin into `~/.openclaw/miniclaw/plugins/` and runs `bun install`
6. Patches `~/.openclaw/openclaw.json` — adds plugins to allow list, load paths, and default config
7. Copies CLI tools (`mc`, `mc-vault`, `mc-smoke`, `mc-doctor`) into `~/.local/bin/`
8. Registers the `mc-memory` QMD collection for semantic search
9. Initialises the vault and prompts for secrets interactively

---

## Repository structure

```
miniclaw-os/
├── install.sh                        # Full installer (idempotent)
├── README.md
├── plugins/
│   ├── mc-board/                     # Prefrontal cortex — kanban board
│   │   ├── openclaw.plugin.json
│   │   ├── index.ts
│   │   ├── core/                     # Card store, board renderer, state machine
│   │   ├── cli/                      # CLI commands
│   │   ├── tools/                    # Agent tool definitions
│   │   └── web/                      # Web debug view (port 4220)
│   ├── mc-designer/                  # Occipital lobe — image creation
│   │   ├── openclaw.plugin.json
│   │   ├── index.ts
│   │   ├── src/                      # Gemini client, canvas store, compositor
│   │   ├── cli/                      # CLI commands
│   │   └── docs/
│   │       ├── README.md             # Plugin overview
│   │       └── SETUP.md              # API key setup guide
│   ├── mc-trust/                     # Immune system — cross-agent trust
│   │   ├── openclaw.plugin.json
│   │   ├── index.ts
│   │   ├── src/                      # Key management, signing
│   │   └── cli/
│   └── mc-context/                   # Hippocampus — context management
│       ├── openclaw.plugin.json
│       ├── index.ts
│       └── src/
└── system/
    └── bin/
        ├── mc                        # CLI wrapper
        ├── mc-vault                  # Age-encrypted secret store
        ├── mc-smoke                  # System health checker
        └── mc-doctor                 # Diagnose and fix issues
```

---

## License

Private.
