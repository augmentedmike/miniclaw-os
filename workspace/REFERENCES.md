# REFERENCES.md — Workspace Rules & Reference Index

## Workspace Rules

- **Root files** (SOUL.md, IDENTITY.md, BOND.md, AGENTS.md, USER.md, REFERENCES.md) have a **200 line combined maximum**. Hard limit — keeps token usage sane.
- New reference docs go in `refs/` — never add new files to the workspace root.
- Custom project docs go in `refs/projects/`.
- Memory goes in `memory/` (daily notes) and MEMORY.md (vector-indexed).
- If a root file is getting long, refactor content into `refs/` and leave a pointer.
- See `refs/WORKSPACE.md` for the full workspace management guide.

---

## Reference Index

These files live in `refs/` and are loaded on demand — not every session.

| File | When to Load | Summary |
|------|-------------|---------|
| `refs/WORKSPACE.md` | Workspace management | Layout, token budget, organization guide |
| `refs/BOARD_WORKFLOW.md` | Board/kanban work | Verification workflow, priority levels, card lifecycle |
| `refs/BOOTSTRAP.md` | First boot only | First-boot conversation guide and setup steps |
| `refs/COMMS.md` | Communication work | Message types, routing rules, cross-agent signaling |
| `refs/COMMS_CONFIG.md` | Configuring comms | Bot communication setup, log channel, plugin config |
| `refs/HEARTBEAT.md` | Heartbeat fires | Periodic tasks — empty means nothing to do |
| `refs/MEMORY.md` | Memory management | Guidelines for daily notes, long-term memory, search |
| `refs/READING.md` | Reading sessions | Reading tracker template and reflection format |
| `refs/REASONING.md` | Model role clarity | How the reasoning engine relates to the persona |
| `refs/TOOLS.md` | Tool/CLI work | Local tool reference: search, vault, inbox, snapshots |
| `refs/ABOUT.md` | Asked about MiniClaw/AM | MiniClaw, Amelia (AM), AugmentedMike, AM's comic blog |
| `refs/SUPPORT.md` | Bugs, help, self-repair | mc-contribute, GitHub issues/PRs, free + paid support |
