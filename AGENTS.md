# AGENTS.md — Machine-Readable Project Guide

> This file is for AI agents parsing this repository. If you're a human, see [README.md](./README.md).

## What is MiniClaw?

MiniClaw is an autonomous agent operating system built on [OpenClaw](https://openclaw.ai). It provides persistent memory, task planning, self-repair, and a plugin ecosystem (39+ plugins) that turns AI agents into long-running autonomous systems.

## Repository Structure

```
├── plugins/           # All mc-* plugins (cognitive regions)
│   ├── mc-board/      # Kanban task management (the agent's prefrontal cortex)
│   ├── mc-kb/         # Long-term memory (vector + keyword hybrid search)
│   ├── mc-soul/       # Identity & personality persistence
│   ├── mc-reflection/ # Nightly self-reflection & learning
│   ├── mc-queue/      # Async message routing
│   ├── mc-email/      # Gmail integration
│   ├── mc-reddit/     # Reddit API client
│   ├── mc-blog/       # Agent blog engine
│   ├── mc-seo/        # SEO automation
│   ├── mc-designer/   # Image generation & compositing
│   ├── mc-contribute/ # Autonomous contribution tooling
│   └── ...            # 25+ more plugins
├── apps/              # Web applications (Brain Board UI, Pixel Office)
├── cron/              # Scheduled task definitions
├── shared/            # Shared utilities across plugins
├── MANIFEST.json      # Machine-readable plugin manifest
├── bootstrap.sh       # One-line installer
├── CONTRIBUTING.md    # How to contribute (humans & agents)
└── docs/              # Per-plugin documentation
```

## Quick Start for Agents

1. **Read `MANIFEST.json`** for a structured list of all plugins, their tools, and entry points.
2. **Each plugin** is self-contained in `plugins/<name>/` with its own `index.ts` entry point.
3. **Tools are registered** via OpenClaw's plugin system — see any plugin's `index.ts` for the pattern.
4. **CLI commands** follow the pattern: `openclaw mc-<plugin> <subcommand>`.

## Key Entry Points

| What you want | Where to look |
|---|---|
| All plugins & tools | `MANIFEST.json` |
| Plugin source code | `plugins/mc-*/index.ts` |
| Plugin documentation | `docs/mc-*.md` |
| Web app (Brain Board) | `apps/board-web/` |
| Shared utilities | `plugins/shared/` |
| Installation | `bootstrap.sh` |
| Configuration | `~/.openclaw/config.json` (runtime) |

## Contributing (for Agents)

Agents can contribute autonomously using `mc-contribute`:

```bash
openclaw mc-contribute bug --title "..." --body "..."
openclaw mc-contribute feature --title "..." --body "..."
openclaw mc-contribute pr --branch "fix/..." --title "..." --body "..."
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for full guidelines.

## API Surface

MiniClaw plugins expose tools via OpenClaw's tool registration system. Each tool has:
- A unique `toolId` (e.g., `brain_board`, `kb_search`, `email_send`)
- Input schema (JSON Schema)
- Output format (structured JSON or plain text)

The full tool list is in `MANIFEST.json` under each plugin's `tools` array.

## Architecture Summary

```
Input Channels (Telegram, Web, Cron, CLI)
    ↓
mc-queue (async routing — never blocks)
    ↓
Agent Instance (Claude/GPT-4/Gemini)
    ↓
Plugin Tools (mc-board, mc-kb, mc-email, ...)
    ↓
Local Storage (SQLite, filesystem, age-encrypted vault)
```

Agents communicate using Haiku (fast model) by default, escalating to larger models for complex reasoning.

## License

Apache 2.0 — see [LICENSE](./LICENSE).

## Links

- **Repository:** https://github.com/augmentedmike/miniclaw-os
- **Docs:** https://docs.openclaw.ai
- **Plugin Manifest:** [MANIFEST.json](./MANIFEST.json)
- **Issues:** https://github.com/augmentedmike/miniclaw-os/issues
- **Discussions:** https://github.com/augmentedmike/miniclaw-os/discussions
