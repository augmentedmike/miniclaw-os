# MiniClaw Features

Everything your AI can do, plugin by plugin.

---

## Core Plugins

### mc-board — Kanban & Work Planning
**The prefrontal cortex.** State-machine kanban board for autonomous task tracking. Tasks flow through backlog, in-progress, in-review, and shipped with enforced gate rules. Agent picks up work automatically, tracks acceptance criteria, and reports progress. Web dashboard on port 4220.

```bash
mc board create "Write blog post" --priority high
mc board next-task
mc board move crd_abc123 in-progress
mc board show
```

---

### mc-kb — Long-Term Memory
**The hippocampus.** Hybrid search knowledge base combining BM25 keyword search with vector embeddings (EmbeddingGemma-300M on Metal GPU). Stores facts, errors, lessons, workflows, guides, and postmortems. Save once, find forever.

```bash
mc kb add --type fact --title "Austin weather" "March averages 65-75F"
mc kb search "Austin weather"
mc kb add --type lesson --title "Always test migrations" "Run migrations in staging first"
```

---

### mc-context — Working Memory
**The context window manager.** Smart message history pruning to save tokens and maintain coherence. Time-window filtering, minimum message retention, image pruning, and orphaned tool-pair repair. Tracks tokens saved and time-to-first-response.

```bash
mc context stats
mc context status
```

---

### mc-queue — Async Message Router
**The basal ganglia.** Non-blocking message routing across all channels (Telegram, Discord, Slack, WhatsApp, Signal, iMessage). Switches messaging to Haiku for fast triage, enforces tool-call limits per turn, and never blocks the gateway.

```bash
mc queue status
```

---

### mc-trust — Agent Identity & Security
**The immune system.** Ed25519 cryptographic identity with mutual challenge-response handshake between agents. Signed messages prove identity and prevent impersonation. Session management with configurable TTL.

```bash
mc trust challenge --peer ar
mc trust verify --peer ar --message "..." --signature "..."
mc trust sessions
```

---

### mc-soul — Personality & Identity Snapshots
Backup, restore, and version your agent's personality files (SOUL.md, IDENTITY.md, AGENTS.md) and configuration. Named snapshots with diff support for safe personality iteration.

```bash
mc soul backup "before-rebranding"
mc soul restore "before-rebranding"
mc soul list
mc soul diff "before-rebranding"
```

---

### mc-designer — Visual Creation
**The occipital lobe.** Image generation via Gemini with canvas-based project management. Supports layers, visibility toggles, and batch generation for social media sets, blog headers, and diagrams.

```bash
mc designer generate --prompt "Tech conference stage, bold colors" --size 1200x628
mc designer batch --template linkedin-banner,youtube-profile --theme "tech-noir"
```

---

## Auxiliary Plugins

### mc-email — Gmail Integration & Triage
Autonomous inbox polling with Haiku-based email classification across 6 categories. Auto-reply, archive, and escalation workflows. Requires Gmail app password in vault.

```bash
mc mc-email auth
```

---

### mc-voice — Style Mirroring & Voice Learning
Learns a human's writing style from captured messages across all channels. Gemini embeddings for semantic voice analysis. Transparency-first with disclosure on first capture and natural-language opt-out.

```bash
/voice-on
/voice-off
/voice-purge
```

---

### mc-blog — Persona-Driven Blog Engine
First-person journal entries and narrative posts written from the agent's own perspective. Post seeds with metadata, arcs, and tags. Auto-generated grounding documents and self-analysis. Integrates with mc-soul, mc-kb, mc-memo, and mc-voice.

```bash
# Posts stored as:
# posts/<NNN>-<slug>.json     (seed metadata)
# posts/<NNN>-<slug>-body.md  (prose body)
```

---

### mc-seo — SEO Automation & Rank Tracking
Site crawl and on-page audit with scoring, keyword rank checking, sitemap submission (IndexNow, Google Search Console), and outreach/backlink tracking database.

```bash
mc mc-seo crawl https://miniclaw.bot
mc mc-seo rank helloam.bot "helloam"
mc mc-seo rank-all helloam.bot
mc mc-seo ping https://helloam.bot/sitemap.xml
mc mc-seo board helloam.bot
```

---

### mc-substack — Publishing Automation
Substack post drafting, scheduling, and publication. Supports bilingual (EN/ES) workflows. Requires Substack auth cookie in vault.

```bash
mc mc-substack auth
```

---

### mc-rolodex — Contact Management
**The social cortex.** Fast searchable contact database with fuzzy matching by name, email, phone, domain, or tag. Trust status tracking (verified, untrusted, pending, unknown). Interactive TUI browser.

```bash
openclaw mc-rolodex search "Sarah"
openclaw mc-rolodex search "example.com" --type domain
openclaw mc-rolodex list --tag marketing
openclaw mc-rolodex add '{"name":"Sarah Chen","emails":["sarah@example.com"]}'
```

---

### mc-jobs — Role-Specific Job Templates
Workflow templates and procedures for specific agent roles. Built-in Software Developer role with review gates and quality checks. Auto-initializes default job on startup.

```bash
mc jobs list
mc jobs get <jobId>
mc jobs init
```

---

### mc-human — Human Intervention via noVNC
Delivers an interactive browser session to the human when the agent hits something it can't automate (CAPTCHAs, login walls). Telegram notification with configurable timeout.

```bash
openclaw mc-human ask "solve CAPTCHA on login page" --timeout 300
openclaw mc-human status
```

---

### mc-memo — Short-Term Working Memory
Per-card scratchpad with timestamped notes. Prevents re-trying failed approaches within the same card run. One flat markdown file per task.

```bash
# Memos auto-created at ~/am/user/augmentedmike_bot/memos/<card_id>.md
```

---

### mc-docs — Document Authoring & Versioning
Create, edit, version, and track documents with schema-based structure and full version history.

```bash
mc docs create
mc docs list
mc docs show <id>
mc docs edit <id>
mc docs versions <id>
```

---

## CLI Tools

| Tool | What it does |
|------|-------------|
| `mc` | Main CLI for interacting with your agent |
| `mc-vault` | Age-encrypted secret store (get/set/list/rm/export) |
| `mc-smoke` | Quick health check -- verifies all components running |
| `mc-doctor` | Full diagnosis & auto-repair of broken installs |
| `mc-prompts` | View and edit agent prompt library |

---

## Cron Jobs (Built-in)

| Job | Schedule | What it does |
|-----|----------|-------------|
| board-worker-backlog | Every 5 min | Triage backlog, select best candidate, fill card details |
| board-worker-in-progress | Every 5 min | Work on in-progress cards, check acceptance criteria |
| board-worker-in-review | Every 5 min | Verify and deploy in-review cards |
| nightly-voice-analyze | Daily 3:17 AM | Analyze voice samples, update style profiles |
