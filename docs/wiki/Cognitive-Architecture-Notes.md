# Cognitive Architecture Notes

Design philosophy behind MiniClaw's brain-region approach.

---

## Why brain regions?

Most agent frameworks model tools as a flat list: "here are 47 things you can do." The agent picks from the list each turn. This works for simple tasks but breaks down when you need:

- **Persistent state** across sessions (memory)
- **Autonomous work** without human prompting (planning)
- **Multi-channel routing** without blocking (communication)
- **Identity** that survives restarts (personality)

Brain regions solve this by giving each cognitive function its own plugin with its own state, lifecycle hooks, and context injection. The agent doesn't need to "remember" to check the board — mc-board injects the current task into every prompt automatically.

## Planning vs. tool graphs

Tool-graph agents (LangChain, CrewAI) define workflows as directed graphs. The agent follows the graph. This is great for deterministic pipelines but bad for open-ended work.

MiniClaw uses a **state-machine kanban** instead. The board defines *what* needs to happen, not *how*. The agent decides how to approach each card. Failed approaches get logged to mc-memo so they're never retried. Lessons get saved to mc-kb so they're never forgotten.

The key insight: **planning is state management, not graph traversal.**

## Prompt loops vs. cognitive loops

A prompt loop is: user says something → agent thinks → agent responds → repeat.

A cognitive loop is: agent has a goal → agent works toward it → agent evaluates progress → agent adjusts → repeat. Humans may or may not be involved.

MiniClaw runs cognitive loops via cron. Every 5 minutes, the board workers check for tasks, do work, and evaluate results. The agent doesn't wait for a human to tell it what to do next.

## Context engineering

The hardest problem in agent design isn't reasoning — it's **what goes in the prompt.** Too little context and the agent makes mistakes. Too much and it drowns in noise.

MiniClaw solves this with **context injection hooks**. Each plugin decides what's relevant based on the current task and injects only that. mc-kb doesn't dump the entire knowledge base — it searches for entries relevant to the current card. mc-context doesn't keep the entire chat history — it prunes by time and relevance.

The result: the agent always has the right context, automatically, without manual prompt engineering.

## The immune system problem

When agents talk to each other, how do you know who's real? Email has SPF/DKIM. The web has TLS certificates. Agent-to-agent communication had nothing.

mc-trust solves this with Ed25519 key pairs and a 3-step challenge-response handshake. Every agent has a cryptographic identity. Messages are signed. Impersonation is impossible without the private key (which lives in the vault, age-encrypted).

This matters more as agents proliferate. If your agent accepts instructions from other agents, you need to know those instructions are authentic.

## What's missing (and what's next)

Things we're still figuring out:

- **Multi-agent coordination** — agents can verify each other (mc-trust) but don't yet negotiate or delegate tasks between themselves
- **Linux support** — architecture is Mac-first, Linux improvements are in progress
- **Resource governance** — no built-in token budgets or cost controls per task
- **Rollback** — mc-soul can snapshot personality, but there's no general undo for agent actions
- **Observability** — logging exists but there's no dashboard for agent behavior over time

These are tracked in [WISHLIST.md](https://github.com/augmentedmike/miniclaw-os/blob/main/WISHLIST.md) and [Discussions](https://github.com/augmentedmike/miniclaw-os/discussions).

---

See also:
- [Brain Regions](Brain-Regions) — the regions in detail
- [Agent Workflow](Agent-Workflow) — the cognitive loop in practice
- [Discussions](https://github.com/augmentedmike/miniclaw-os/discussions) — architecture ideas welcome
