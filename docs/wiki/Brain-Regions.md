# Brain Regions

MiniClaw plugins are organized by cognitive function. Each region solves one class of problem.

---

## Planning & Executive Function

### mc-board — Prefrontal Cortex
The decision-maker. Manages what to work on, in what order, and whether it's done.

- State machine: backlog → in-progress → in-review → shipped
- Enforced gate rules (can't ship without review)
- Autonomous work queue — agent picks up the next task
- Acceptance criteria tracking
- Web dashboard on port 4220

### mc-jobs — Procedural Templates
Role-specific workflows. Defines *how* to do a job, not *what* to do.

- Built-in Software Developer role
- Review gates and quality checks
- Auto-initializes on startup

---

## Memory

### mc-kb — Hippocampus (Long-Term Memory)
Everything the agent has ever learned, searchable in milliseconds.

- Hybrid search: BM25 keywords + vector embeddings (EmbeddingGemma-300M on Metal GPU)
- Stores facts, errors, lessons, workflows, guides, postmortems
- Reciprocal Rank Fusion merges keyword and semantic results
- Auto-indexed: save once, find forever

### mc-memo — Short-Term Working Memory
Per-task scratchpad. Prevents repeating failed approaches within a single card run.

- One markdown file per task card
- Timestamped notes appended during work
- Cleared when card ships

### mc-soul — Identity & Personality
Who the agent is. Loaded into every conversation.

- SOUL.md, IDENTITY.md, AGENTS.md
- Named snapshots with diff support
- Safe personality iteration (backup before rebranding)

### mc-context — Working Memory Window
What's relevant right now. Manages the conversation context window.

- Time-window filtering (keep last N minutes)
- Image pruning (old images → placeholder text)
- Orphaned tool-pair repair
- Token savings tracking

---

## Communication & Routing

### mc-queue — Basal Ganglia (Message Router)
Non-blocking message routing. The traffic controller.

- Routes Telegram, Discord, Slack, WhatsApp, Signal, iMessage
- Switches messaging to Haiku for fast triage
- Enforces tool-call limits per turn
- Never blocks the gateway

### mc-email — Gmail Triage
Autonomous inbox management.

- IMAP polling with Haiku classification (6 categories)
- Auto-reply, archive, escalation workflows
- Security threat detection and logging

### mc-rolodex — Social Cortex
Contact management with fuzzy search.

- Search by name, email, phone, domain, tag
- Trust status tracking (verified, pending, unknown)
- Interactive TUI browser

### mc-voice — Style Mirroring
Learns human writing style over time.

- Captures messages for semantic voice analysis
- Gemini embeddings for style profiling
- Transparency-first with opt-out

---

## Creation & Publishing

### mc-designer — Occipital Lobe (Visual Creation)
Image generation with project management.

- Gemini-powered image generation
- Canvas-based projects with layers
- Batch generation for social media sets

### mc-blog — Persona-Driven Blog Engine
First-person narrative posts from the agent's perspective.

- Post seeds with metadata, arcs, tags
- Auto-generated grounding documents
- Integrates with mc-soul, mc-kb, mc-voice

### mc-substack — Publishing Pipeline
Draft, schedule, and publish to Substack.

- Bilingual EN/ES workflows
- Auth via vault

### mc-reddit — Community Outreach
Reddit interaction and community management.

- Post comments and replies
- Manage community presence

### mc-youtube — Video Analysis
Extract knowledge from YouTube videos.

- Transcript extraction
- Key-moment analysis with timestamps
- Screenshot capture

---

## Security & Identity

### mc-trust — Immune System
Cryptographic identity and mutual authentication between agents.

- Ed25519 key pairs (private keys in vault)
- 3-step challenge-response handshake
- Signed messages prove identity
- Session management with TTL

---

## Human Override

### mc-human — Emergency Handoff
When the agent gets stuck, it asks for help.

- Delivers noVNC browser session to the human
- Telegram notification
- Configurable timeout

---

## Utilities

### mc-docs — Document Versioning
Create, edit, and version documents with schema-based structure.

---

See also:
- [Agent Workflow](Agent-Workflow) — how these regions work together
- [Writing Plugins](Writing-Plugins) — build your own region
- [FEATURES.md](https://github.com/augmentedmike/miniclaw-os/blob/main/FEATURES.md) — example commands for every plugin
