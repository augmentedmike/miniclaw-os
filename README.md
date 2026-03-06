# MiniClaw — Your Super Agent

<p align="center">
    <img src="https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/assets/miniclaw-logo.png" alt="MiniClaw" width="500">
</p>

<p align="center">
  <strong>Your own AI. Your Mac. Your data.</strong>
</p>

<p align="center">
  <a href="https://github.com/augmentedmike/miniclaw-os/releases"><img src="https://img.shields.io/badge/version-v0.0.1-blue?style=for-the-badge" alt="v0.0.1"></a>
  <a href="https://github.com/augmentedmike/miniclaw-os/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-Apache%202.0-blue.svg?style=for-the-badge" alt="Apache 2.0 License"></a>
</p>

**MiniClaw** is a personal AI that lives on your Mac — not in someone else's cloud. It has a real personality, remembers your life, and can actually *do* things: draft emails, write code, manage projects, run tasks overnight. Everything you do stays on your machine. Everything.

[Getting Started](#install) · [Plugins](#plugins) · [Docs](https://docs.openclaw.ai) · [GitHub](https://github.com/augmentedmike/miniclaw-os) · [miniclaw.bot](https://miniclaw.bot)

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

### Your First Agent

```bash
# Create a simple agent that summarizes news
mc agent create --name "news-brief" --template summarizer

# Chat with it
openclaw agent "Summarize the top 3 tech news stories today"

# Query its memory
mc kb search "tech news"

# Check your task queue
mc board show
```

---

## Features

- **Local-first.** Everything runs on your Mac. No cloud, no surveillance, no shutdown notices.
- **Always on.** Set up automated tasks — checks, reminders, background work.
- **Real memory.** Your AI remembers your preferences, your habits, your life.
- **It can see.** Take screenshots, analyze images, use your camera (with permission).
- **It can read & write.** Email drafts, code, documents, notes.
- **Built on OpenClaw.** The same AI runtime used by teams and solo builders worldwide.

---

## Plugins

MiniClaw is modular. Each plugin handles one job — and handles it well. You can use all of them together or pick the ones you need.

### Core Plugins

#### **mc-board** — Kanban & Work Planning
The brain's **prefrontal cortex**. Manages tasks, projects, and autonomous work queues.

**What it does:**
- Creates and tracks tasks (backlog → in-progress → in-review → shipped)
- Autonomous work queue — agent picks up the next task automatically
- Project organization — group related tasks into initiatives
- Priority management — high/medium/low, with gate rules

**Basic usage:**
```bash
# Create a task
mc board create "Write blog post" --priority high

# Check what's next
mc board next-task

# Move a task forward
mc board move crd_abc123 in-progress

# See full kanban
mc board show
```

**[→ Full mc-board documentation](./plugins/mc-board/PLUGIN.md)**

---

#### **mc-kb** — Long-Term Memory
The **hippocampus**. Stores and retrieves everything your AI learns.

**What it does:**
- Vector + keyword search across your entire knowledge base
- Stores facts, errors, workflows, guides, lessons, postmortems
- Automatic indexing — save once, find forever
- Self-improvement — agents log what they learned

**Basic usage:**
```bash
# Add a fact
mc kb add --type fact --title "Austin weather" "March averages 65–75°F"

# Search for it
mc kb search "Austin weather"

# Add a lesson from an error
mc kb add --type lesson --title "Always test migrations" \
  "Learned: run migrations in staging first"
```

**[→ Full mc-kb documentation](./plugins/mc-kb/PLUGIN.md)**

---

#### **mc-designer** — Visual Creation
The **occipital lobe**. Generates images, designs, and visual content.

**What it does:**
- Generate images with Gemini (or DALL-E, Midjourney via API)
- Create social media graphics, blog headers, diagrams
- Edit and composite images
- Supports layers, templates, and batch generation

**Basic usage:**
```bash
# Generate a blog header
mc designer generate --prompt "Tech conference stage, bold colors" \
  --size 1200x628

# Create social media set
mc designer batch --template linkedin-banner,youtube-profile \
  --theme "tech-noir"
```

**[→ Full mc-designer documentation](./plugins/mc-designer/PLUGIN.md)**

---

#### **mc-context** — Working Memory
Manages the conversation window. Keeps relevant history in view while pruning old context.

**What it does:**
- Sliding window context management
- Summarizes older messages to preserve context
- Prevents token waste on old chat history
- Automatic pruning based on relevance

**[→ Full mc-context documentation](./plugins/mc-context/PLUGIN.md)**

---

#### **mc-queue** — Async Task Runner
The **basal ganglia**. Non-blocking message processing.

**What it does:**
- Routes Telegram, Slack, Discord, WhatsApp messages to agents
- Never blocks — all processing is async
- Handles multiple channels concurrently
- Intelligent routing based on agent skill

**[→ Full mc-queue documentation](./plugins/mc-queue/PLUGIN.md)**

---

#### **mc-trust** — Agent Identity & Security
The **immune system**. Verifies agents and secures inter-agent communication.

**What it does:**
- Cryptographic identity for each agent
- Handshake verification between agents
- Signed messages — prove who sent what
- Prevents impersonation and injection

**Basic usage:**
```bash
# Establish trust with another agent
mc trust challenge --peer ar

# Verify a message from a trusted agent
mc trust verify --peer ar --message "..." --signature "..."
```

**[→ Full mc-trust documentation](./plugins/mc-trust/PLUGIN.md)**

---

#### **mc-soul** — Personality & Identity
Defines who your AI is.

**What it does:**
- Stores personality traits, values, voice
- Loaded into every conversation
- Can be versioned and updated
- Makes your AI consistent and memorable

**Basic usage:**
```bash
# Edit your agent's personality
mc soul edit

# Backup current personality version
mc soul backup "before-rebranding"

# View personality
mc soul show
```

**[→ Full mc-soul documentation](./plugins/mc-soul/PLUGIN.md)**

---

#### **mc-rolodex** — Contact Management
Social cortex. Manages contacts, teams, and communication preferences.

**What it does:**
- Store contact info (email, phone, Telegram, Slack)
- Search by name, email, phone, domain, or tag
- Track trust status (verified, pending, unknown)
- Fuzzy matching — find contacts with partial information

**Basic usage:**
```bash
# Add a contact
openclaw mc-rolodex add '{"name":"Sarah Chen","emails":["sarah@example.com"],"tags":["marketing"]}'

# Search contacts
openclaw mc-rolodex search "Sarah"

# Search by domain
openclaw mc-rolodex search "example.com" --type domain

# List all contacts (or filter by tag)
openclaw mc-rolodex list --tag marketing

# View contact details
openclaw mc-rolodex show contact_1234
```

**[→ Full mc-rolodex documentation](./plugins/mc-rolodex/README.md)**

---

#### **mc-jobs** — Cron & Scheduled Tasks
Background job scheduler for automated work.

**What it does:**
- Run tasks on a schedule (hourly, daily, weekly, custom)
- Autonomous agents execute scheduled jobs
- Retry on failure with exponential backoff
- Logging and history tracking

**Basic usage:**
```bash
# Schedule a daily task
mc jobs add --cron "0 9 * * *" --task "Summarize overnight emails" \
  --agent news-brief

# List scheduled jobs
mc jobs list

# View job history
mc jobs history --job 123
```

**[→ Full mc-jobs documentation](./plugins/mc-jobs/PLUGIN.md)**

---

### CLI Tools

| Tool | Purpose |
|------|---------|
| `mc` | Main CLI — interact with your agent from the terminal |
| `mc-vault` | Secret store — age-encrypted, local-only key/value vault |
| `mc-doctor` | Full diagnosis & repair — finds and fixes broken installs |
| `mc-smoke` | Quick health check — verifies everything is running |
| `mc-prompts` | Prompt management — view and edit agent prompt library |

---

## Architecture

MiniClaw's mind is built like an actual brain. Each region does one thing well.

```
┌─────────────────────────────────────────────────────────────────┐
│                    MINICLAW AGENT ARCHITECTURE                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Input Layer (Async Queue)                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Telegram │ Slack │ Discord │ WhatsApp │ Web │ cron │ API │  │
│  └─────────────────────────┬─────────────────────────────────┘  │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                     mc-queue                            │    │
│  │              (Non-blocking message router)              │    │
│  └────────┬─────────────────────────────────┬──────────────┘    │
│           │                                 │                   │
│           ▼                                 ▼                   │
│  ┌──────────────────────┐        ┌──────────────────────┐       │
│  │   Agent Instance     │        │  Agent Instance      │       │
│  │   (parallel)         │        │  (parallel)          │       │
│  └──────────┬───────────┘        └──────────┬───────────┘       │
│             │                               │                   │
│             ├─────────────────┬─────────────┤                   │
│             │                 │             │                   │
│             ▼                 ▼             ▼                   │
│  ┌──────────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ mc-context       │  │ mc-soul      │  │ mc-trust         │  │
│  │ (Working Memory) │  │ (Identity)   │  │ (Verification)   │  │
│  └──────────────────┘  └──────────────┘  └──────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           Cognitive Layer (LLM Inference)               │   │
│  │    Haiku (fast) → Sonnet (normal) → Opus (reasoning)    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  Long-Term Memory & Executive Function                          │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐   │
│  │    mc-kb       │  │  mc-board      │  │ mc-designer      │   │
│  │ (Hippocampus)  │  │ (Prefrontal)   │  │ (Vision)         │   │
│  └────────────────┘  └────────────────┘  └──────────────────┘   │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐   │
│  │  mc-rolodex    │  │  mc-jobs       │  │ mc-vault         │   │
│  │ (Social Cortex)│  │ (Scheduler)    │  │ (Security)       │   │
│  └────────────────┘  └────────────────┘  └──────────────────┘   │
│                                                                   │
│  Local Storage (~/am/user/augmentedmike_bot/)                    │
│  • brain/ — cards, projects, backlog                             │
│  • kb/ — knowledge base indexes                                  │
│  • vault/ — encrypted secrets                                    │
│  • media/ — images, files                                        │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### How It Works

**The Problem:** Traditional AI gateways handle Telegram messages *synchronously*. While the agent thinks, the connection blocks. Long tasks stall. Multiple channels compete.

**The Solution:** MiniClaw routes everything through an **async queue** (`mc-queue`). Messages arrive, get queued, and agents process them independently. The gateway never blocks. Multiple channels (Telegram DMs, group channels, cron jobs, web) all run concurrently.

**Token Efficiency:** Agents communicate using **Haiku** (Claude's fastest model) by default. Short, efficient responses save tokens for the reasoning that matters — not chat loop overhead. When a task needs depth, the agent escalates to a larger model automatically.

---

## Examples

### Example 1: Autonomous Task Tracking

```bash
# Create a task
$ mc board create --title "Research competitor pricing" --priority high --tags sales

# Agent picks it up automatically
[mc-board] Task crd_xyz789 assigned to work loop

# Agent works on it
Agent: Researching competitor pricing...
[browser] Opened 5 competitor sites
[mc-designer] Generated pricing comparison chart
Task moved to in-review

# You review the work
$ mc board show crd_xyz789
# Agent's work is displayed with the comparison chart

# Approve it
$ mc board move crd_xyz789 shipped
# Agent notifies you it's done
```

---

### Example 2: Knowledge Base Self-Improvement

```bash
# Agent encounters an error while processing
Agent: Error: Failed to parse JSON response. Added to KB as error type.
[mc-kb] Added: "JSON parsing failures in API calls"

# Next time it encounters similar error
Agent: I've seen this before. (querying KB...)
[mc-kb] Found 3 related errors. Trying workaround #2...
✓ Resolved successfully

# Monthly review
$ mc kb search --type lesson --tag "api"
# Shows all lessons learned about API work

# Agent logs what it learned
[mc-kb] Lesson: "Always validate API responses before parsing"
```

---

### Example 3: Social Media Design Pipeline

```bash
# Create content
$ mc board create "LinkedIn post + graphics" --priority high

# Agent generates the graphics
Agent: Creating LinkedIn banner...
[mc-designer] Generated: social-linkedin-banner.png (1584×396)
[mc-designer] Generated: social-linkedin-thumbnail.png (400×400)

# Outputs placed in ~/am/media/social-backgrounds/
$ ls -la ~/am/media/social-backgrounds/
social-linkedin-banner-20260305.png
social-linkedin-thumbnail-20260305.png

# Ready to upload
Agent: Designs ready. LinkedIn banner: [link]
```

---

### Example 4: Scheduled Reports

```bash
# Set up daily email digest
$ mc jobs add --cron "0 8 * * *" \
  --task "Summarize overnight alerts and emails" \
  --agent news-brief

# Every morning at 8 AM
Agent: Good morning! Here's what you missed:
  • 3 urgent emails (all archived)
  • 12 GitHub notifications
  • 2 Slack mentions
  • 1 calendar conflict (already resolved)

# View job history
$ mc jobs history --job daily-digest
2026-03-05 08:00:42 ✓ Digest sent (3.2KB)
2026-03-04 08:00:51 ✓ Digest sent (2.8KB)
2026-03-03 08:01:08 ✓ Digest sent (4.1KB)
```

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

**Common issues:**

| Issue | Fix |
|-------|-----|
| Agent won't start | Run `mc-doctor` |
| Telegram not connected | Check `~/.openclaw/config/telegram.json` |
| Out of memory | Restart: `brew services restart openclaw` |
| Can't find mc-board | Reinstall plugins: `mc plugin install mc-board` |

---

## Contributing

**Want to build a plugin?** Follow the [Plugin Developer Guide](./docs/PLUGIN_DEVELOPMENT.md).

**Found a bug?** [Open an issue](https://github.com/augmentedmike/miniclaw-os/issues).

**Want to improve docs?** [Submit a PR](https://github.com/augmentedmike/miniclaw-os/pulls).

### Creating Your Own Plugin

1. **Create the plugin folder:**
```bash
mkdir plugins/my-plugin
cd plugins/my-plugin
```

2. **Add required files:**
```
my-plugin/
├── PLUGIN.md          # Plugin documentation
├── package.json       # Node.js metadata
├── src/
│   └── index.ts       # Main plugin code
└── config.schema.json # Configuration schema
```

3. **Register with MiniClaw:**
```bash
mc plugin register ./my-plugin
```

4. **Test it:**
```bash
mc plugin test my-plugin
```

5. **Share it:**
- Open a PR to add it to `plugins/`
- Or publish to npm as `@miniclaw/my-plugin`
- List it on [clawhub.com](https://clawhub.com)

### Plugin API

Every plugin has access to:

```typescript
// Configuration
const config = agent.getConfig('my-plugin');

// Long-term memory
const results = await kb.search('search term');
await kb.add({ type: 'fact', title: '...', content: '...' });

// Task management
const tasks = await board.list({ status: 'in-progress' });
await board.move(cardId, 'shipped');

// File I/O (safe directory only)
const files = await fs.readdir('/Users/augmentedmike/am/workspace/');

// LLM inference (with escalation)
const response = await agent.invoke('gpt-4', prompt);

// Inter-plugin communication (trusted agents)
await trust.verify(peerId, message, signature);
```

---

## Safety & Privacy

- **Your data stays yours.** Nothing leaves your Mac unless you explicitly ask it to.
- **Open source.** Read the code at [github.com/augmentedmike/miniclaw-os](https://github.com/augmentedmike/miniclaw-os).
- **No surveillance.** No telemetry, no tracking, no home-phoning.
- **Standards-based.** Built on Homebrew, Node.js, OpenClaw — the tools millions of developers trust.
- **Encrypted secrets.** All API keys and credentials stored in `mc-vault` (age-encrypted, not cloud-synced).

---

## What does it need?

- **A Mac** — any Mac from 2020 onward (Intel or Apple Silicon)
- **Internet** — for setup and online tasks
- **API keys** — you choose Claude, GPT-4, or other LLMs (they stay in your vault)
- **~20GB disk** — for agent runtime and local models
- **Git Butler** — for isolated per-card agent work (virtual branches); installed automatically by `install.sh`

---

## Powered By

- [OpenClaw](https://openclaw.ai) — the AI agent engine
- [Gemini](https://aistudio.google.com) — image generation (optional)
- [Claude](https://anthropic.com) — primary reasoning engine
- Your LLM of choice — GPT-4, Gemini, Llama, or others (via your own API keys)

---

## Learn More

- [Full Docs](https://docs.openclaw.ai) — architecture, guides, troubleshooting
- [Plugin Development Guide](./docs/PLUGIN_DEVELOPMENT.md) — build your own
- [GitHub](https://github.com/augmentedmike/miniclaw-os) — source code & issues
- [miniclaw.bot](https://miniclaw.bot) — setup help & consulting

---

## Questions?

Book a 30-minute setup session with the creator: **[miniclaw.bot](https://miniclaw.bot)**

---

## License

Apache 2.0. Open source. Built by [AugmentedMike](https://augmentedmike.com).

Made with coffee and conviction.
