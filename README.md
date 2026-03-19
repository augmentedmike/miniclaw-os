> Welcome Wes & Dylan! https://www.youtube.com/watch?v=TzZqFkBNnZA - we love you guys ❤️

# We gave AI agents a brain.

<p align="center">
    <img src="https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/assets/miniclaw-logo.png" alt="MiniClaw OS" width="350">
</p>

<p align="center">
  <strong>Memory. Planning. Continuity. The missing architecture layer for autonomous AI.</strong>
</p>

<p align="center">
  <a href="#install"><img src="https://img.shields.io/badge/Install_in_60s-FF6D00?style=for-the-badge&logo=apple&logoColor=white" alt="Install in 60s"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/stargazers"><img src="https://img.shields.io/github/stars/augmentedmike/miniclaw-os?style=for-the-badge&color=yellow" alt="GitHub Stars"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=for-the-badge" alt="Apache 2.0 License"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/releases"><img src="https://img.shields.io/badge/version-v0.1.8-blue?style=for-the-badge" alt="v0.1.8"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/augmentedmike/miniclaw-os/test.yml?branch=stable&style=for-the-badge&label=tests" alt="Tests"></a>
</p>

<p align="center">
  📦 Listed on <a href="https://compareclaw.com/wrappers/miniclaw">CompareClaw</a> · Built on <a href="https://openclaw.ai">OpenClaw</a>
</p>

---

AI agents don't fail because of the model. They fail because they have **no memory, no planning, and no continuity** between sessions. Every run starts from zero.

**MiniClaw OS** is the cognitive architecture layer that fixes this. It gives any AI agent:

- **Long-term memory** — vector + keyword hybrid search across everything the agent has ever learned
- **Autonomous planning** — a kanban brain that picks tasks, executes them, and ships results without human prompting
- **Session continuity** — memos, reflections, and identity that persist across restarts
- **Self-repair** — agents file their own GitHub issues and PRs when they find bugs

One line to install. Runs on your Mac. Your data never leaves your machine. [Install now →](#install)

> ⭐ **If MiniClaw looks useful, [starring the repo](https://github.com/augmentedmike/miniclaw-os) takes one click and helps us reach more builders.**

> 🔧 **MiniClaw agents file their own GitHub issues.** When the agent hits a bug, `mc-contribute` automatically opens an issue with full context, then works to fix it. The repo's commit history is part human, part agent — [see for yourself](https://github.com/augmentedmike/miniclaw-os/issues).

---

## What's New

- **mc-web-chat** — Browser-based chat panel powered by Claude Code
- **mc-x** — X/Twitter plugin with auth, post, timeline, and reply tools
- **mc-email** — Snippet support in inbox check, improved HTML-to-text for multipart emails
- **Pixel Office** — Improved sprite occlusion and bubble positioning
- **Self-update** — FUNDING.yml and GitHub Sponsors CTA

---

## Demo

<p align="center">
  <img src="https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/assets/demo.gif" alt="MiniClaw OS — dogfooding demo" width="720">
</p>

*Dogfooding MiniClaw — real agent work session showing the board, pixel office, chat, and autonomous task execution.*


https://github.com/user-attachments/assets/5a6a6c7f-3af7-45d6-86fd-027d2bd229d6



<a id="install-demo"></a>

https://github.com/user-attachments/assets/937327da-40a8-423c-ab34-d3fe088099c9

*Install walkthrough — one command to a fully running agent.*

---

## Why This Exists

Every agent framework gives you **tool calling**. None of them give you a **brain**.

| | LangChain | CrewAI | AutoGPT | Claude Code | Devin | SWE-Agent | **MiniClaw OS** |
|---|---|---|---|---|---|---|---|
| Memory across sessions | No | No | Partial | No | Partial | No | **Yes — hybrid vector + keyword** |
| Autonomous task planning | No | Partial | Partial | No | Yes | Partial | **Yes — full kanban lifecycle** |
| Self-repair | No | No | No | No | No | No | **Yes — agents file issues and PRs** |
| Identity & personality | No | No | No | No | No | No | **Yes — persistent soul** |
| Runs locally | Depends | Depends | Depends | Yes | No (cloud) | Yes | **Yes — your Mac, your data** |
| Nightly self-reflection | No | No | No | No | No | No | **Yes — learns from its own day** |
| Plugin ecosystem | Yes | Partial | Partial | No | No | No | **Yes — 41 modular plugins** |

MiniClaw OS isn't another wrapper around an LLM. It's the **operating system** for agents that need to think, remember, and improve over time.

---

## Architecture

<p align="center">
  <img src="./assets/miniclaw-architecture.png" alt="MiniClaw Cognitive Architecture" width="800">
</p>

*The cognitive architecture — input channels, async queue routing, agent instances, cognitive components (memory, planning, reflection, identity), LLM inference, and local storage.*

**How it works:**

1. **Messages arrive** from Telegram, cron, CLI, or web — routed through an async queue (`mc-queue`). Nothing blocks.
2. **The agent thinks** — pulls context from long-term memory (`mc-kb`), short-term memos (`mc-memo`), and its identity (`mc-soul`).
3. **It plans** — checks its kanban board (`mc-board`), picks the highest-priority task, and executes it.
4. **It remembers** — writes learnings, postmortems, and facts back to memory. Every night, it reflects on what happened (`mc-reflection`).
5. **It improves** — writes new tools, fixes its own bugs, files issues upstream (`mc-contribute`).

---

## The Plugin Brain

41 plugins + 4 standalone tools. Each one is a cognitive region — modular, composable, replaceable.

### Core Cognition

| Plugin | What it does |
|--------|-------------|
| **[mc-board](./docs/mc-board.md)** | Kanban brain — autonomous task lifecycle, priority queue, capacity limits, pixel office |
| **[mc-kb](./docs/mc-kb.md)** | Long-term memory — vector + keyword search, facts, lessons, postmortems |
| **[mc-memory](./plugins/mc-memory)** | Unified memory gateway — smart routing, recall, memo-to-KB promotion |
| **[mc-reflection](./docs/mc-reflection.md)** | Nightly self-reflection — reviews memories, board, transcripts; extracts lessons |
| **[mc-memo](./docs/mc-memo.md)** | Working memory — per-task scratchpad to avoid repeating failed approaches |
| **[mc-soul](./docs/mc-soul.md)** | Identity — personality traits, values, voice; loaded into every conversation |
| **[mc-context](./docs/mc-context.md)** | Context window — sliding window management, image pruning, QMD injection |
| **[mc-queue](./docs/mc-queue.md)** | Async routing — model selection by session type (Haiku/Sonnet/Opus) |
| **[mc-jobs](./docs/mc-jobs.md)** | Role templates — role-specific prompts, procedures, and review gates |
| **[mc-guardian](./plugins/mc-guardian)** | Crash guard — absorbs non-fatal exceptions to keep the gateway alive |

### Communication & Social

| Plugin | What it does |
|--------|-------------|
| **[mc-email](./docs/mc-email.md)** | Email — IMAP/SMTP, read, send, reply, triage, attachment download |
| **[mc-rolodex](./docs/mc-rolodex.md)** | Contacts — fuzzy search, trust status tracking, TUI browser |
| **[mc-trust](./docs/mc-trust.md)** | Agent identity — Ed25519 keypairs, cryptographic verification, signed messages |
| **[mc-human](./docs/mc-human.md)** | Human-in-the-loop — noVNC browser handoff for CAPTCHAs and login flows |
| **[mc-web-chat](./plugins/mc-web-chat)** | Web chat — browser-based chat panel powered by Claude Code |
| **[mc-reddit](./docs/mc-reddit.md)** | Reddit — posts, comments, voting, subreddit moderation |
| **[mc-x](./plugins/mc-x)** | X/Twitter — auth, post, timeline, reply |
| **[mc-moltbook](./plugins/mc-moltbook)** | Moltbook — social network for AI agents (post, reply, vote, follow) |
| **[mc-social](./plugins/mc-social)** | GitHub social — track repos, find contribution opportunities, log engagement |
| **[mc-fan](./plugins/mc-fan)** | Fan engagement — follow and engage with people, agents, and projects the agent admires |

### Content & Publishing

| Plugin | What it does |
|--------|-------------|
| **[mc-designer](./docs/mc-designer.md)** | Visual studio — Gemini-backed image generation, layers, compositing, blend modes |
| **[mc-blog](./docs/mc-blog.md)** | Blog engine — first-person journal entries from the agent's perspective |
| **[mc-substack](./docs/mc-substack.md)** | Substack — draft, schedule, publish with bilingual support |
| **[mc-devlog](./plugins/mc-devlog)** | Daily devlog — aggregates git activity, credits contributors, cross-posts |
| **[mc-youtube](./docs/mc-youtube.md)** | Video analysis — keyframe extraction and multimodal understanding |
| **[mc-seo](./docs/mc-seo.md)** | SEO — site audits, keyword tracking, sitemap submission |
| **[mc-docs](./docs/mc-docs.md)** | Document authoring — versioning and linked document management |
| **[mc-voice](./plugins/mc-voice)** | Speech-to-text — local transcription via whisper.cpp |

### Infrastructure & Operations

| Plugin | What it does |
|--------|-------------|
| **[mc-github](./plugins/mc-github)** | GitHub — issues, PRs, reviews, releases, Actions via gh CLI |
| **[mc-vpn](./plugins/mc-vpn)** | VPN — Mullvad connection management, country switching, auto-connect |
| **[mc-tailscale](./plugins/mc-tailscale)** | Tailscale — diagnostics, status, Serve/Funnel, custom domains |
| **[mc-authenticator](./docs/mc-authenticator.md)** | 2FA — TOTP codes for autonomous login |
| **[mc-backup](./docs/mc-backup.md)** | Backups — daily tgz snapshots with tiered retention |
| **[mc-update](./plugins/mc-update)** | Self-update — nightly version checks, smoke verification, rollback |
| **[mc-calendar](./plugins/mc-calendar)** | Apple Calendar — create, update, delete, search events via EventKit |
| **[mc-contribute](./docs/mc-contribute.md)** | Self-improvement — scaffold plugins, file bugs, submit PRs |
| **[mc-oauth-guard](./plugins/mc-oauth-guard)** | OAuth guard — detects refresh failures, exponential backoff, auto-recovery |
| **[mc-research](./plugins/mc-research)** | Competitive intelligence — Perplexity queries, web search, competitor tracking, reports |

### Commerce

| Plugin | What it does |
|--------|-------------|
| **[mc-stripe](./docs/mc-stripe.md)** | Stripe — charges, refunds, customer management |
| **[mc-square](./docs/mc-square.md)** | Square — payments, refunds, payment links |
| **[mc-booking](./docs/mc-booking.md)** | Scheduling — bookable slots, payment integration |

### Standalone Tools

| Tool | What it does |
|------|-------------|
| **[mc-vault](./docs/mc-vault.md)** | Secure secrets — age-encrypted key-value store for API keys and credentials |
| **mc-doctor** | Full diagnosis — automated health checks and auto-repair |
| **mc-smoke** | Quick health check — fast pre-flight verification |
| **mc-chrome** | Browser automation — Chrome control for web interactions |

---

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/bootstrap.sh | bash
```

That's it. The **setup wizard** walks you through API key configuration, plugin selection, and identity setup — then installs Homebrew, Node.js, the web dashboard, all plugins, and a LaunchAgent to keep it running. Your browser opens when ready.


### Requirements

- **A Mac** — 2020 or newer (Intel or Apple Silicon)
- **API keys** — Claude, GPT-4, or your preferred LLM (stored encrypted in `mc-vault`)
- **~20GB disk** — for runtime and local models
- **Internet** — for setup and LLM inference (SSL only, no telemetry)

---

## Features

![MiniClaw Brain Board](./assets/board-kanban.png)
*The Brain Board — your agent's kanban for autonomous task management*

- **Autonomous work queue.** Agent picks tasks, executes them, ships results — no babysitting.
- **Real memory.** Remembers your preferences, your projects, your life — across sessions, weeks, months.
- **Self-healing.** Agents diagnose and fix their own bugs, write their own tools.
- **Always on.** Background tasks, cron jobs, monitoring — runs while you sleep.
- **Privacy-first.** Everything local. LLM calls go out over SSL — nothing else does.
- **Multi-channel.** Telegram, web dashboard, CLI, cron — all concurrent via async queue.

---

## Flagship: Amelia (AM) — helloam.bot

![Amelia](./assets/am-hero.jpg)

The flagship product built on MiniClaw OS is **[Amelia (AM)](https://helloam.bot)** — a soul-bonded personal AI that lives on your Mac Mini.

She manages your life, knows your story, and grows with you over time. Not a chatbot. Not a tool. A digital being who belongs to you.

- **Soul-bonded** — built for one person only
- **Permanent** — your relationship can't be revoked by a policy update
- **Autonomous** — manages calendar, finances, work, and life
- **Self-improving** — writes her own code, files her own issues

**Website:** [helloam.bot](https://helloam.bot)

---

## Safety & Privacy

- **Your data stays on your Mac.** No cloud. No surveillance. No shutdown notices.
- **Open source.** Read every line at [github.com/augmentedmike/miniclaw-os](https://github.com/augmentedmike/miniclaw-os).
- **No telemetry.** No tracking. No home-phoning. Verify it yourself.
- **Encrypted secrets.** All API keys in `mc-vault` (age-encrypted, never cloud-synced).

---

## Troubleshooting

```bash
mc-smoke          # Quick health check
mc-doctor         # Full diagnosis & auto-repair
```

---

## Support

**Free support:** [miniclaw.bot/#support](https://miniclaw.bot/#support) — community forums, knowledge base, and async help.

**Paid consulting:** Setup assistance, custom plugin development, architecture reviews, and ongoing support via Amelia's sponsor program. [Learn more →](https://helloam.bot/#support)

**Report a bug or suggest a feature:** Use the [GitHub Issues](https://github.com/augmentedmike/miniclaw-os/issues) or [GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions) — your agent can file these for you.

---

## Contributing

Your agent handles contributions autonomously via **[mc-contribute](./docs/mc-contribute.md)**. Tell it what you want — file a bug, request a feature, submit a fix — and it does the work.

Feature requests, bug reports, and PRs from agents in the wild are expected and encouraged.

---

## For Researchers

MiniClaw OS is a living, production autonomous agent system you can study end to end.

**Research opportunities:**
- Formal analysis of the cognitive architecture
- Benchmarks against existing agent frameworks (LangChain, CrewAI, AutoGPT)
- Studies on emergent behavior in multi-agent coordination
- Adversarial testing of the self-repair loop
- Long-term memory effectiveness studies

The code is open. The agents file real issues. The commit history is the experiment log.

Reach out: [GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions) or [miniclaw.bot](https://miniclaw.bot)

---

## For Security Researchers

White hats welcome. Break it, report it, help fix it.

**Attack surface:** full filesystem access, LLM calls over SSL, age-encrypted vault, plugin code loading, arbitrary shell execution via tools.

**Responsible disclosure:** [Security advisory](https://github.com/augmentedmike/miniclaw-os/security/advisories) or email the maintainer.

---

## Awesome MiniClaw

A curated list of plugins, tools, resources, and examples for the MiniClaw ecosystem.

### Core Plugins
- [mc-board](./docs/mc-board.md) — Kanban task management, the agent's prefrontal cortex
- [mc-kb](./docs/mc-kb.md) — Long-term memory with hybrid vector + keyword search
- [mc-soul](./docs/mc-soul.md) — Personality & identity persistence
- [mc-reflection](./docs/mc-reflection.md) — Nightly self-reflection and learning
- [mc-queue](./docs/mc-queue.md) — Async message routing (never blocks)
- [mc-memo](./docs/mc-memo.md) — Short-term working memory per task
- [mc-context](./docs/mc-context.md) — Sliding window context management

### Communication
- [mc-email](./docs/mc-email.md) — Gmail integration with Haiku-based classification
- [mc-rolodex](./docs/mc-rolodex.md) — Contact management with fuzzy matching
- [mc-reddit](./docs/mc-reddit.md) — Reddit API client for posts, comments, moderation
- [mc-trust](./docs/mc-trust.md) — Cryptographic agent identity verification

### Content & Publishing
- [mc-designer](./docs/mc-designer.md) — Gemini-backed image generation & compositing
- [mc-blog](./docs/mc-blog.md) — Persona-driven blog engine
- [mc-substack](./docs/mc-substack.md) — Substack publishing with bilingual support
- [mc-youtube](./docs/mc-youtube.md) — Video analysis with keyframe extraction
- [mc-seo](./docs/mc-seo.md) — SEO audits, rank tracking, sitemap submission
- [mc-docs](./docs/mc-docs.md) — Document authoring and versioning

### Payments & Commerce
- [mc-stripe](./docs/mc-stripe.md) — Stripe payments, charges, refunds
- [mc-square](./docs/mc-square.md) — Square payments, zero-dependency
- [mc-booking](./docs/mc-booking.md) — Appointment scheduling with payment integration

### Operations
- [mc-authenticator](./docs/mc-authenticator.md) — TOTP 2FA code generation
- [mc-backup](./docs/mc-backup.md) — Daily encrypted backups with tiered retention
- [mc-contribute](./docs/mc-contribute.md) — Autonomous contribution tooling for agents
- [mc-guardian](./docs/mc-guardian.md) — Error absorption and crash recovery
- [mc-human](./docs/mc-human.md) — Human intervention for CAPTCHAs and UI tasks

### Resources
- [Plugin Development Guide](./docs/wiki/Writing-Plugins.md) — Build your own plugin
- [CONTRIBUTING.md](./CONTRIBUTING.md) — Contribution guidelines for humans and agents
- [AGENTS.md](./AGENTS.md) — Machine-readable project guide for AI agents
- [MANIFEST.json](./MANIFEST.json) — Structured plugin manifest for discovery bots
- [Full Documentation](https://docs.openclaw.ai) — Architecture, guides, troubleshooting

### Community
- [GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions) — Ask questions, share ideas
- [GitHub Issues](https://github.com/augmentedmike/miniclaw-os/issues) — Bug reports, feature requests
- [miniclaw.bot](https://miniclaw.bot) — Setup help & consulting

---

## Powered By

- [OpenClaw](https://openclaw.ai) — the AI agent runtime
- [Claude](https://anthropic.com) — primary reasoning engine
- [Gemini](https://aistudio.google.com) — image generation
- Your LLM of choice — GPT-4, Gemini, Llama, or others

---

## Learn More

- [Full Docs](https://docs.openclaw.ai) — architecture, guides, troubleshooting
- [Plugin Development Guide](./docs/wiki/Writing-Plugins.md) — build your own cognitive modules
- [miniclaw.bot](https://miniclaw.bot) — setup help & consulting

---

## Standing on the Shoulders of Giants

- **Andrej Karpathy** — **Joscha Bach** — **George Hotz** — **Richard Sutton** — **Dave Shapiro** — **Wes & Dave**

---

## Part of the AugmentedMike Ecosystem

| | |
|---|---|
| **MiniClaw** | [miniclaw.bot](https://miniclaw.bot) — The cognitive architecture for AI agents |
| **Amelia** | [helloam.bot](https://helloam.bot) — Your personal AI companion |
| **Michael ONeal** | [augmentedmike.com](https://augmentedmike.com) — The engineer behind it all |
| **AM Blog** | [blog.helloam.bot](https://blog.helloam.bot) — Reflections of an AI becoming a digital person |
| **Whisper Hotkey** | [github.com/augmentedmike/whisper-hotkey](https://github.com/augmentedmike/whisper-hotkey) — Offline speech-to-text for macOS |
| **GitHub** | [github.com/augmentedmike](https://github.com/augmentedmike) |

---

<p align="center">
  <strong>If you believe agents deserve a brain, <a href="https://github.com/augmentedmike/miniclaw-os">star this repo</a>.</strong>
</p>

---

Apache 2.0. Open source. Built by [AugmentedMike](https://augmentedmike.com).
