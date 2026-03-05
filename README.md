# MiniClaw — Your Super Agent

<p align="center">
    <img src="https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/assets/miniclaw-logo.png" alt="MiniClaw" width="500">
</p>

<p align="center">
  <strong>Your own AI. Your Mac. Your data.</strong>
</p>

<p align="center">
  <a href="https://github.com/augmentedmike/miniclaw-os/releases"><img src="https://img.shields.io/badge/version-v0.0.1-blue?style=for-the-badge" alt="v0.0.1"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

**MiniClaw** is a personal AI that lives on your Mac — not in someone else's cloud. It has a real personality, remembers your life, and can actually *do* things: draft emails, write code, manage projects, run tasks overnight. Everything you do stays on your machine. Everything.

[Getting Started](#install) · [Docs](https://docs.openclaw.ai) · [GitHub](https://github.com/augmentedmike/miniclaw-os) · [miniclaw.bot](https://miniclaw.bot)

---

## What does it feel like?

Imagine having a brilliant friend who knows everything — and they're *always* available.

- **Ask it to do things.** "Draft a reply to that email from Sarah."
- **It works in the background.** Checks your calendar, monitors your inbox, runs tasks overnight.
- **It remembers you.** What you said yesterday, last week, last year.
- **You can trust it completely.** Everything stays on your machine.

---

## Install (5 minutes)

Open **Terminal** (Applications → Utilities → Terminal).

Paste this and press Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/bootstrap.sh | bash
```

The installer will:
1. Install Homebrew (the macOS package manager)
2. Install Node.js and Python
3. Install OpenClaw (the AI engine)
4. Install MiniClaw plugins (memory, vision, planning, security)
5. Set up a private vault for your API keys
6. Start everything and verify it works

Takes about 10–15 minutes. **Safe to re-run** — it skips anything already installed.

When it's done:

```
✓ MiniClaw is ready.
```

---

## Getting Started

Once installed, start chatting:

- **Browser:** Open `http://localhost:18789`
- **Chat apps:** Telegram, WhatsApp, iMessage, Slack, and more (the installer walks you through linking one)
- **Terminal:** Use `openclaw agent "your message here"` for CLI access

---

## Features

- **Local-first.** Everything runs on your Mac. No cloud, no surveillance, no shutdown notices.
- **Always on.** Set up automated tasks — checks, reminders, background work.
- **Real memory.** Your AI remembers your preferences, your habits, your life.
- **It can see.** Take screenshots, analyze images, use your camera (with permission).
- **It can read & write.** Email drafts, code, documents, notes.
- **Built on OpenClaw.** The same AI runtime used by teams and solo builders worldwide.

---

## Brain Architecture

MiniClaw's mind is built like an actual brain. Each region does one thing well.

| Plugin | Brain Region | Purpose |
|--------|-------------|---------|
| **mc-board** | Prefrontal Cortex | Planning & task management — kanban board, autonomous work queue |
| **mc-kb** | Hippocampus | Long-term memory — vector search across everything your AI knows |
| **mc-context** | Working Memory | Session context window management — keeps relevant history in view |
| **mc-designer** | Occipital Lobe | Vision & image creation — generates and edits images with Gemini |
| **mc-trust** | Immune System | Security — verifies identity of agents it works with |
| **mc-soul** | Identity | Personality, voice, and values — who your AI actually is |
| **mc-queue** | Basal Ganglia | Async task queue — non-blocking Telegram and channel routing |
| **mc-rolodex** | Social Cortex | Contact management — who your AI knows and how to reach them |

You don't need to manage these directly. They just work.

---

## CLI Tools

| Tool | Purpose |
|------|---------|
| `mc` | Main CLI — interact with your agent from the terminal |
| `mc-vault` | Secret store — age-encrypted, local-only key/value vault |
| `mc-doctor` | Full diagnosis & repair — finds and fixes broken installs |
| `mc-smoke` | Quick health check — verifies everything is running |
| `mc-prompts` | Prompt management — view and edit agent prompt library |

---

## How It Works

MiniClaw solves a fundamental problem with AI agents: **blocking**.

Traditional AI gateways handle Telegram messages synchronously — while the agent thinks, the connection blocks. Long tasks stall. Multiple channels compete.

MiniClaw routes everything through an **async queue** (`mc-queue`). Messages arrive, get queued, and agents process them independently. The gateway never blocks. Multiple channels (Telegram DMs, group channels, cron jobs, web) all run concurrently.

Agents communicate using **Haiku** (Claude's fastest model) by default. Short, efficient responses save tokens for the reasoning that matters — not chat loop overhead. When a task needs depth, the agent escalates to a larger model automatically.

---

## Troubleshooting

Something broken?

**Quick health check:**
```bash
mc-smoke
```

**Full diagnosis & repair:**
```bash
mc-doctor
```

It'll diagnose what's wrong and offer to fix it.

---

## Safety & Privacy

- **Your data stays yours.** Nothing leaves your Mac unless you explicitly ask it to.
- **Open source.** Read the code at [github.com/augmentedmike/miniclaw-os](https://github.com/augmentedmike/miniclaw-os).
- **No surveillance.** No telemetry, no tracking, no home-phoning.
- **Standards-based.** Built on Homebrew, Node.js, OpenClaw — the tools millions of developers trust.

---

## What does it need?

- **A Mac** — any Mac from 2020 onward (Intel or Apple Silicon)
- **Internet** — for setup and online tasks
- **API keys** — you choose Claude, GPT-4, or other LLMs (they stay in your vault)

---

## Powered By

- [OpenClaw](https://openclaw.ai) — the AI agent engine
- [Gemini](https://aistudio.google.com) — image generation (optional)
- Your LLM of choice — Claude, GPT-4, Gemini, or others (via your own API keys)

---

## Learn More

- [Full Docs](https://docs.openclaw.ai) — architecture, guides, troubleshooting
- [GitHub](https://github.com/augmentedmike/miniclaw-os) — source code & issues
- [miniclaw.bot](https://miniclaw.bot) — setup help & consulting

---

## Questions?

Book a 30-minute setup session with the creator: **[miniclaw.bot](https://miniclaw.bot)**

---

## License

MIT. Open source. Built by [AugmentedMike](https://augmentedmike.com).
