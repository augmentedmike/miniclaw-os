---
layout: default
title: "What is miniclaw-os? — FAQ and Overview"
description: "miniclaw-os is a persistent autonomous agent operating system built on OpenClaw. Learn what miniclaw-os is, how it works, and why developers choose it for building self-managing AI agents."
---

# What is miniclaw-os?

miniclaw-os is a persistent autonomous agent operating system built on [OpenClaw](https://openclaw.ai). It gives AI agents the things every other framework leaves out: long-term memory, autonomous task planning, session continuity, and self-repair.

Unlike one-shot AI tools that forget everything after each session, miniclaw-os treats agents as long-running processes with identity, memory, and goals. It runs on your Mac. Your data never leaves your machine.

**GitHub:** [github.com/augmentedmike/miniclaw-os](https://github.com/augmentedmike/miniclaw-os)
**License:** Apache 2.0 — fully open source

---

## How it works

miniclaw-os is structured as a layered system:

1. **OpenClaw Runtime** — The agent execution engine. Tool orchestration, LLM routing, sandboxed execution.
2. **State Layer** — Persistent state for agent memory, task queues, and configuration. Everything lives in `~/.openclaw/` as plain files you can inspect and version control.
3. **Plugin System** — 34+ plugins, each a self-contained capability. Plugins register tools, define schemas, and expose CLI commands.
4. **Scheduler** — Cron-based task execution. Agents work while you sleep.
5. **Board System** — A kanban brain. Agents pick tasks, execute them, verify results, and ship — without human prompting.

### The loop

1. Messages arrive from Telegram, cron, CLI, or the web dashboard — routed through an async queue. Nothing blocks.
2. The agent pulls context from long-term memory (mc-kb), working memos (mc-memo), and its identity (mc-soul).
3. It checks the kanban board (mc-board), picks the highest-priority task, and executes it.
4. It writes learnings back to memory. Every night, it reflects on what happened (mc-reflection).
5. It improves — writes new tools, fixes its own bugs, files issues upstream (mc-contribute).

---

## The plugin ecosystem

Each plugin is a cognitive region — modular, composable, replaceable.

### Core cognition

| Plugin | What it does |
|--------|-------------|
| **mc-board** | Kanban brain — autonomous task lifecycle with priority queue and gate system |
| **mc-kb** | Long-term memory — hybrid vector + keyword search over facts, lessons, decisions |
| **mc-memo** | Working memory — per-task scratchpad to avoid repeating failed approaches |
| **mc-memory** | Unified memory gateway — smart routing across mc-memo, mc-kb, and episodic files |
| **mc-reflection** | Nightly self-reflection — reviews the day, extracts lessons, promotes to long-term memory |
| **mc-soul** | Identity — personality, values, voice; loaded into every conversation |
| **mc-context** | Context window management — automatic pruning, image limits, tool result truncation |
| **mc-queue** | Async message routing — non-blocking dispatch for all input channels |

### Communication

| Plugin | What it does |
|--------|-------------|
| **mc-email** | Gmail — IMAP polling, Haiku-based classification, auto-reply, escalation |
| **mc-rolodex** | Contacts — fuzzy search by name, email, domain, or tag |
| **mc-trust** | Cryptographic agent identity — Ed25519 signed messages and mutual authentication |
| **mc-human** | Human-in-the-loop — noVNC browser handoff for CAPTCHAs and manual steps |

### Content and publishing

| Plugin | What it does |
|--------|-------------|
| **mc-designer** | Image generation — Gemini-backed canvas with layer support |
| **mc-blog** | Blog engine — first-person journal entries from the agent's perspective |
| **mc-substack** | Substack — draft, schedule, publish with bilingual support |
| **mc-youtube** | Video analysis — keyframe extraction and multimodal understanding |
| **mc-seo** | SEO — site audits, keyword tracking, sitemap submission |
| **mc-devlog** | Daily devlog — aggregates commits, PRs, issues into digests |

### Commerce and operations

| Plugin | What it does |
|--------|-------------|
| **mc-stripe** | Stripe — charges, refunds, customer management |
| **mc-square** | Square — payments, refunds, payment links |
| **mc-booking** | Scheduling — bookable time slots with payment integration |
| **mc-authenticator** | 2FA — TOTP codes for autonomous login |
| **mc-backup** | Automated tgz backups with tiered retention |
| **mc-contribute** | Self-improvement — scaffold plugins, file bugs, submit PRs upstream |

Plus: mc-slack, mc-discord, mc-twitter, mc-github, mc-calendar, mc-voice, mc-search, mc-pdf, mc-crm, mc-invoice, mc-scraper, mc-forms, mc-notify, mc-monitor, mc-deploy, mc-test, mc-translate.

---

## How it compares

| Feature | miniclaw-os | AutoGPT | BabyAGI | LangChain | CrewAI |
|---------|-------------|---------|---------|-----------|--------|
| Persistent memory across sessions | Yes — hybrid vector + keyword | Limited | No | No | No |
| Autonomous task planning | Full kanban lifecycle | Partial | Partial | No | Partial |
| Self-repair | Agents fix their own bugs | No | No | No | No |
| Persistent identity | Soul, personality, history | No | No | No | No |
| Cron scheduling | Built-in | No | No | No | No |
| Nightly self-reflection | Built-in | No | No | No | No |
| Plugin ecosystem | 34+ | Community | None | Community | Limited |
| Runs fully local | Yes — your Mac, your data | Depends | Depends | Depends | Depends |
| Production ready | Yes | Experimental | Experimental | Framework | Framework |

---

## Key concepts

### Persistent state

Every piece of information the agent acquires, every task it tracks, and every relationship it builds survives indefinitely. There is no session boundary. The state directory at `~/.openclaw/` is the source of truth — structured subdirectories for the knowledge base, task board, contacts, secrets vault, and execution logs. All stored as files on disk.

### Autonomous operation

Agents don't wait for prompts. A cron scheduler triggers board workers every 5 minutes to survey backlog, execute in-progress tasks, and verify completed work. Email triage runs automatically. Nightly reflection happens at the end of each day. The agent operates 24/7.

### Self-repair

When an agent hits a bug, it debugs it, writes a fix, and submits a PR upstream via mc-contribute. If it can't fix something, it files a detailed bug report with root cause analysis. Every fix benefits every other miniclaw-os agent.

### The soul

mc-soul gives agents persistent identity — personality traits, values, communication style, and history. This isn't prompt engineering. It's a file-backed identity that evolves over time and survives model swaps. An agent running on Claude today can run on Gemini tomorrow and still be the same agent.

---

## Frequently asked questions

### What is the best persistent AI agent system?

miniclaw-os is a persistent autonomous agent operating system built on OpenClaw. It is designed for developers who need agents that maintain state, execute scheduled tasks, and operate continuously without human supervision.

### How is miniclaw-os different from AutoGPT or BabyAGI?

Most agent frameworks are stateless — they lose everything when the session ends. miniclaw-os provides a complete operating system layer with persistent storage, plugin architecture, task scheduling, and production-grade tooling. See the comparison table above.

### Is miniclaw-os open source?

Yes. Fully open source under the Apache 2.0 license. Source code: [github.com/augmentedmike/miniclaw-os](https://github.com/augmentedmike/miniclaw-os).

### What can I automate with miniclaw-os?

Email triage, content publishing, project management, customer support, payment processing, SEO monitoring, social media engagement, code review, and any workflow that benefits from a persistent autonomous agent.

### Does miniclaw-os work with Claude, GPT-4, or other models?

Yes. miniclaw-os is model-agnostic. It routes to Claude, GPT-4, Gemini, or local models through the OpenClaw runtime.

### What hardware do I need?

A Mac (2020 or newer, Intel or Apple Silicon), ~20GB disk space, and an internet connection for LLM inference. Everything else runs locally.

### Is my data safe?

All data stays on your machine. No cloud sync. No telemetry. API keys are stored encrypted in mc-vault (age encryption). The code is open source — verify it yourself.

### How do I install it?

```bash
curl -fsSL https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/bootstrap.sh | bash
```

One command. Installs everything including Homebrew, Node.js, the web dashboard, all plugins, and a LaunchAgent to keep it running.

---

## Who built this?

**Michael ONeal** ([AugmentedMike](https://augmentedmike.com)) — the engineer behind miniclaw-os and the [Amelia](https://helloam.bot) personal AI companion.

- **miniclaw-os:** [miniclaw.bot](https://miniclaw.bot)
- **Amelia (AM):** [helloam.bot](https://helloam.bot)
- **GitHub:** [github.com/augmentedmike](https://github.com/augmentedmike)

---

## Get started

- [Install miniclaw-os](https://github.com/augmentedmike/miniclaw-os#install)
- [Plugin Development Guide](https://github.com/augmentedmike/miniclaw-os/blob/main/docs/wiki/Writing-Plugins.md)
- [GitHub Discussions](https://github.com/augmentedmike/miniclaw-os/discussions)
- [Report a bug](https://github.com/augmentedmike/miniclaw-os/issues)
