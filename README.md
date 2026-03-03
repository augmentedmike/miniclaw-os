# miniclaw-os

The miniclaw plugin ecosystem for [OpenClaw](https://openclaw.ai).

A collection of plugins and CLI tools that extend OpenClaw into a full personal AI operating system — each piece modeled on a region of the brain.

---

## The Brain Map

| Plugin | Brain Region | What it does |
|--------|-------------|--------------|
| `mc-board` | Prefrontal cortex | Kanban board — tracks work from backlog → shipped with enforced state gates |
| `mc-designer` | Occipital lobe (generative) | Visual creation studio — layered image generation and compositing via Gemini |
| `mc-trust` | — | Cross-agent trust and identity — cryptographic handshakes between AI agents |
| `mc-context` | Hippocampus | Engineered context windows — time-based retention, image pruning, memory injection |

CLI tools:

| Tool | What it does |
|------|-------------|
| `mc-vault` | Age-encrypted secret store — store API keys, tokens, and private notes on disk |
| `mc` | Thin CLI wrapper around the openclaw binary |
| `mc-smoke` | Verifies the full miniclaw stack is installed and working |

---

## Requirements

- **OpenClaw** installed at `~/.openclaw` — [openclaw.ai](https://openclaw.ai)
- macOS (arm64) — tested on Apple Silicon
- Python 3 (for the installer's config patcher)
- `rsync` (standard on macOS)

---

## Install

### Option 1 — Full installer (recommended)

Installs everything: all plugins, CLI tools, and patches `openclaw.json` automatically.

```bash
git clone https://github.com/augmentedmike/miniclaw-os.git
cd miniclaw-os
./install.sh
```

Restart OpenClaw to load the plugins:

```bash
openclaw gateway restart
```

Verify everything is working:

```bash
mc-smoke
```

Re-running `install.sh` is safe. Plugins are rsynced (updated), existing `openclaw.json` plugin config is never overwritten.

**Check-only mode** — verify prerequisites without making any changes:

```bash
./install.sh --check
```

---

### Option 2 — Individual plugins via OpenClaw

Install only the plugins you want, one at a time, using OpenClaw's built-in plugin system.

```bash
# Link a single plugin from a local clone
openclaw plugins install -l ./plugins/mc-board
openclaw plugins install -l ./plugins/mc-designer
openclaw plugins install -l ./plugins/mc-context
openclaw plugins install -l ./plugins/mc-trust

# Or install directly without cloning (when published to npm)
openclaw plugins install @augmentedmike/mc-board
```

Each plugin is independently installable — you don't need the full stack.

---

## What the full installer does

1. Verifies OpenClaw is installed and on PATH
2. Rsyncs each plugin from `plugins/` into `~/.openclaw/miniclaw/plugins/`
3. Patches `~/.openclaw/openclaw.json` — adds plugins to allow list, load paths, and sets default config (skipped if already configured)
4. Copies CLI tools from `system/bin/` into `~/.local/bin/`
5. Checks that `~/.local/bin` is on your `$PATH`

---

## Plugin setup

Some plugins need additional configuration after install.

### mc-designer — Gemini API key

mc-designer requires a Google Gemini API key for image generation.

See **[plugins/mc-designer/docs/SETUP.md](plugins/mc-designer/docs/SETUP.md)** for a step-by-step guide (normie-friendly).

Quick version:
1. Get a free key at `https://aistudio.google.com/app/apikey`
2. Set it: `openclaw config set plugins.entries.mc-designer.config.apiKey "YOUR_KEY"`

### mc-vault — initial setup

```bash
mc-vault list          # list stored secrets
mc-vault set my-key    # store a new secret (prompts for value)
mc-vault get my-key    # retrieve a secret
```

---

## Usage

### mc-board — kanban board

```bash
mc brain create --title "Fix login bug" --priority high
mc brain list
mc brain board
mc brain move <id> in-progress
mc brain move <id> in-review
mc brain move <id> shipped
mc brain archive <id>
```

Column flow: `backlog → in-progress → in-review → shipped`

### mc-designer — visual creation

```bash
# Generate an image
openclaw cli designer gen "a minimalist logo on white background"

# Work with canvases and layers
openclaw cli designer canvas new mybrand
openclaw cli designer gen "blue gradient background" --canvas mybrand --layer bg
openclaw cli designer gen "bold sans-serif wordmark" --canvas mybrand --layer text
openclaw cli designer layer opacity mybrand text 90
openclaw cli designer composite mybrand

# Usage and cost
openclaw cli designer stats
openclaw cli designer stats --full
```

### mc-vault — secrets

```bash
mc-vault set gh-token           # store (prompts for value)
mc-vault get gh-token           # retrieve
mc-vault export gh-token        # raw output for eval/piping
mc-vault list                   # list all keys with notes
mc-vault memo set private-note  # encrypted private note
```

### mc-context

No manual interaction needed — runs automatically on every agent prompt build. Manages the context window for channel sessions: time-based message retention, image pruning, and memory injection.

---

## Repository structure

```
miniclaw-os/
├── install.sh                        # Full installer (idempotent)
├── README.md
├── plugins/
│   ├── mc-board/               # Prefrontal cortex — kanban board
│   │   ├── openclaw.plugin.json
│   │   ├── index.ts
│   │   ├── core/                     # Card store, board renderer, state machine
│   │   ├── cli/                      # CLI commands
│   │   ├── tools/                    # Agent tool definitions
│   │   └── web/                      # Web debug view (port 4220)
│   ├── mc-designer/            # Occipital lobe — image creation
│   │   ├── openclaw.plugin.json
│   │   ├── index.ts
│   │   ├── PLAN.md                   # Full roadmap incl. future Photoshop filters
│   │   ├── src/                      # Gemini client, canvas store, compositor
│   │   ├── cli/                      # CLI commands
│   │   └── docs/
│   │       └── SETUP.md              # API key setup guide
│   ├── mc-trust/               # Cross-agent trust and identity
│   │   ├── openclaw.plugin.json
│   │   ├── index.ts
│   │   ├── core/                     # Key management, handshake protocol
│   │   ├── cli/
│   │   └── tools/
│   └── mc-context/                # Hippocampus — context management
│       ├── openclaw.plugin.json
│       ├── index.ts
│       └── PLAN.md
└── system/
    └── bin/
        ├── mc                  # CLI wrapper
        ├── mc-vault            # Age-encrypted secret store
        └── mc-smoke       # System health checker
```

---

## License

Private. Part of the AugmentedMike / miniclaw ecosystem.
