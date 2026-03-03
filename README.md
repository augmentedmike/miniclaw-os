# miniclaw-os

The miniclaw plugin ecosystem for [OpenClaw](https://openclaw.ai).

A collection of plugins and CLI tools that extend OpenClaw into a full personal AI operating system — each piece modeled on a region of the brain.

---

## The Brain Map

| Plugin | Brain Region | What it does |
|--------|-------------|--------------|
| `miniclaw-board` | Prefrontal cortex | Kanban board — tracks work from backlog → shipped with enforced state gates |
| `miniclaw-designer` | Occipital lobe (generative) | Visual creation studio — layered image generation and compositing via Gemini |
| `miniclaw-trust` | — | Cross-agent trust and identity — cryptographic handshakes between AI agents |
| `smart-context` | Hippocampus | Engineered context windows — time-based retention, image pruning, memory injection |

CLI tools:

| Tool | What it does |
|------|-------------|
| `miniclaw-vault` | Age-encrypted secret store — store API keys, tokens, and private notes on disk |
| `miniclaw` | Thin CLI wrapper around the openclaw binary |
| `miniclaw-smoke-test` | Verifies the full miniclaw stack is installed and working |

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
miniclaw-smoke-test
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
openclaw plugins install -l ./plugins/miniclaw-board
openclaw plugins install -l ./plugins/miniclaw-designer
openclaw plugins install -l ./plugins/smart-context
openclaw plugins install -l ./plugins/miniclaw-trust

# Or install directly without cloning (when published to npm)
openclaw plugins install @augmentedmike/miniclaw-board
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

### miniclaw-designer — Gemini API key

miniclaw-designer requires a Google Gemini API key for image generation.

See **[plugins/miniclaw-designer/docs/SETUP.md](plugins/miniclaw-designer/docs/SETUP.md)** for a step-by-step guide (normie-friendly).

Quick version:
1. Get a free key at `https://aistudio.google.com/app/apikey`
2. Set it: `openclaw config set plugins.entries.miniclaw-designer.config.apiKey "YOUR_KEY"`

### miniclaw-vault — initial setup

```bash
miniclaw-vault list          # list stored secrets
miniclaw-vault set my-key    # store a new secret (prompts for value)
miniclaw-vault get my-key    # retrieve a secret
```

---

## Usage

### miniclaw-board — kanban board

```bash
miniclaw brain create --title "Fix login bug" --priority high
miniclaw brain list
miniclaw brain board
miniclaw brain move <id> in-progress
miniclaw brain move <id> in-review
miniclaw brain move <id> shipped
miniclaw brain archive <id>
```

Column flow: `backlog → in-progress → in-review → shipped`

### miniclaw-designer — visual creation

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

### miniclaw-vault — secrets

```bash
miniclaw-vault set gh-token           # store (prompts for value)
miniclaw-vault get gh-token           # retrieve
miniclaw-vault export gh-token        # raw output for eval/piping
miniclaw-vault list                   # list all keys with notes
miniclaw-vault memo set private-note  # encrypted private note
```

### smart-context

No manual interaction needed — runs automatically on every agent prompt build. Manages the context window for channel sessions: time-based message retention, image pruning, and memory injection.

---

## Repository structure

```
miniclaw-os/
├── install.sh                        # Full installer (idempotent)
├── README.md
├── plugins/
│   ├── miniclaw-board/               # Prefrontal cortex — kanban board
│   │   ├── openclaw.plugin.json
│   │   ├── index.ts
│   │   ├── core/                     # Card store, board renderer, state machine
│   │   ├── cli/                      # CLI commands
│   │   ├── tools/                    # Agent tool definitions
│   │   └── web/                      # Web debug view (port 4220)
│   ├── miniclaw-designer/            # Occipital lobe — image creation
│   │   ├── openclaw.plugin.json
│   │   ├── index.ts
│   │   ├── PLAN.md                   # Full roadmap incl. future Photoshop filters
│   │   ├── src/                      # Gemini client, canvas store, compositor
│   │   ├── cli/                      # CLI commands
│   │   └── docs/
│   │       └── SETUP.md              # API key setup guide
│   ├── miniclaw-trust/               # Cross-agent trust and identity
│   │   ├── openclaw.plugin.json
│   │   ├── index.ts
│   │   ├── core/                     # Key management, handshake protocol
│   │   ├── cli/
│   │   └── tools/
│   └── smart-context/                # Hippocampus — context management
│       ├── openclaw.plugin.json
│       ├── index.ts
│       └── PLAN.md
└── system/
    └── bin/
        ├── miniclaw                  # CLI wrapper
        ├── miniclaw-vault            # Age-encrypted secret store
        └── miniclaw-smoke-test       # System health checker
```

---

## License

Private. Part of the AugmentedMike / miniclaw ecosystem.
