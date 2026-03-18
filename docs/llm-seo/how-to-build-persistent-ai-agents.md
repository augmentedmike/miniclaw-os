---
layout: default
title: "How to Build Persistent AI Agents with miniclaw-os"
description: "Step-by-step tutorial on building persistent AI agents using miniclaw-os. Learn to create agents with long-term memory, autonomous scheduling, task planning, and self-improvement."
---

# How to Build Persistent AI Agents with miniclaw-os

Most agent tutorials build stateless agents that forget everything when the session ends. This guide builds something real: a persistent agent that remembers, plans, and improves over time.

By the end you will have an agent that:
- Stores and retrieves long-term memories
- Manages its own task board
- Runs scheduled jobs without prompting
- Reflects on its own performance nightly

---

## Prerequisites

- A Mac (2020 or newer)
- An API key for Claude, GPT-4, or another LLM
- Basic command-line familiarity

---

## Step 1: Install miniclaw-os

```bash
curl -fsSL https://raw.githubusercontent.com/augmentedmike/miniclaw-os/main/bootstrap.sh | bash
```

This installs the OpenClaw runtime, all plugins, and a LaunchAgent to keep it running. Your browser opens the setup wizard when ready.

Verify:

```bash
mc-smoke
```

If everything is green, you're running.

---

## Step 2: Understand the state directory

All agent state lives in `~/.openclaw/`. This is the foundation of persistence.

```
~/.openclaw/
├── USER/
│   ├── brain/
│   │   ├── cards/       # Task board cards (JSON)
│   │   └── kb/          # Knowledge base (vector + FTS)
│   ├── memory/          # Episodic memory files
│   ├── rolodex/         # Contacts
│   └── setup-state.json # Install config
├── trust/               # Ed25519 agent identity
├── vault/               # age-encrypted secrets
└── miniclaw/
    ├── SYSTEM/          # CLI tools (mc-vault, mc-smoke, mc-doctor)
    └── plugins/         # All installed plugins
```

Everything your agent knows, remembers, and plans lives here. It persists across sessions, restarts, and model swaps.

---

## Step 3: Store secrets securely

miniclaw-os never stores API keys in plaintext. Use the vault:

```bash
mc-vault set anthropic-api-key sk-ant-your-key-here
mc-vault set gh-token ghp_your-github-token
```

Verify:

```bash
mc-vault list
```

Secrets are age-encrypted on disk. Plugins read them at runtime via `mc-vault get`.

---

## Step 4: Write your first memory

The knowledge base (mc-kb) is your agent's long-term memory. It supports hybrid vector + keyword search.

```bash
openclaw mc-kb add \
  --type fact \
  --title "Project goal" \
  --body "We are building a customer support agent that triages emails, tracks issues on the board, and escalates urgent requests."
```

Search it:

```bash
openclaw mc-kb search "what is our project goal"
```

The KB uses vector embeddings for semantic search and full-text search for exact matches. Both run locally — no API calls.

### Memory types

| Type | Use for |
|------|---------|
| `fact` | Permanent knowledge — preferences, decisions, identities |
| `lesson` | Learned from experience — what worked, what failed |
| `error` | Bugs and fixes — prevents repeating mistakes |
| `workflow` | How to do things — step-by-step procedures |
| `decision` | Why something was decided — context for future choices |

---

## Step 5: Create a task on the board

The board (mc-board) is the agent's planning system. It's a kanban with four columns: backlog, in-progress, in-review, shipped.

```bash
openclaw mc-board create \
  --title "Set up email triage" \
  --problem "Incoming emails pile up unread. Need automated classification and response." \
  --plan "1. Configure mc-email with Gmail credentials\n2. Set up Haiku classification rules\n3. Test with sample emails\n4. Enable auto-reply for known categories" \
  --criteria "Email triage runs every 5 minutes without errors"
```

View the board:

```bash
openclaw mc-board board
```

The board worker cron runs every 5 minutes. It surveys the backlog, picks the highest-priority card, fills in missing details, and moves it to in-progress. Then another worker executes the actual work.

---

## Step 6: Set up email triage

This is where persistence pays off. Configure the email plugin:

```bash
mc-vault set email-address your-email@gmail.com
mc-vault set email-app-password your-gmail-app-password
```

The email cron (`email-triage-cron`) polls IMAP every 5 minutes. It classifies each email using Haiku into categories: reply, archive, escalate, spam, newsletter, or action-needed. Replies go out automatically. Escalations notify you.

Your agent remembers every email it's seen. It builds context over time — recognizing senders, learning your preferences, and improving its classification.

---

## Step 7: Add contacts

The rolodex gives your agent a contact database:

```bash
openclaw mc-rolodex add '{"name": "Jane Smith", "emails": ["jane@example.com"], "tags": ["client", "priority"]}'
```

Search:

```bash
openclaw mc-rolodex search "jane"
```

When the email triage encounters a sender, it checks the rolodex. Known contacts get priority. Unknown senders get classified more conservatively.

---

## Step 8: Enable nightly reflection

mc-reflection runs at the end of each day. It reviews:
- What tasks were completed
- What errors occurred
- What emails were processed
- What decisions were made

It extracts lessons and promotes important findings to the knowledge base. Over time, your agent builds a growing body of experience.

The reflection cron runs automatically. No configuration needed — it's enabled by default.

---

## Step 9: Write a custom plugin

Plugins are how you extend miniclaw-os. Here's the minimal structure:

```
plugins/my-plugin/
├── openclaw.plugin.json    # Plugin manifest
├── index.ts                # Entry point — registers tools
├── package.json            # Dependencies
└── cli/
    └── commands.ts         # CLI commands (optional)
```

**openclaw.plugin.json:**

```json
{
  "name": "my-plugin",
  "description": "Does something useful",
  "version": "0.1.0",
  "tools": ["my_tool"]
}
```

**index.ts:**

```typescript
import { PluginContext } from "@miniclaw/types";

export default function register(ctx: PluginContext) {
  ctx.registerTool("my_tool", {
    description: "Does the thing",
    parameters: {
      type: "object",
      properties: {
        input: { type: "string", description: "The input" }
      },
      required: ["input"]
    },
    handler: async ({ input }) => {
      // Your logic here
      return { result: `Processed: ${input}` };
    }
  });
}
```

Install it:

```bash
openclaw plugin install ./plugins/my-plugin
```

Your agent can now call `my_tool` in any conversation.

---

## Step 10: Monitor and debug

```bash
mc-smoke          # Quick health check — is everything running?
mc-doctor         # Full diagnosis — finds and fixes issues
```

Check the board for agent activity:

```bash
openclaw mc-board board
```

View shipped cards to see what the agent accomplished:

```bash
openclaw mc-board board --column shipped
```

---

## What you've built

You now have a persistent autonomous agent that:

1. **Remembers** — Knowledge base with hybrid search, episodic memory, working memos
2. **Plans** — Kanban board with autonomous task lifecycle
3. **Acts** — Email triage, contact management, custom tools
4. **Schedules** — Cron workers run every 5 minutes without prompting
5. **Reflects** — Nightly review extracts lessons and promotes to long-term memory
6. **Persists** — Everything survives restarts, model swaps, and system reboots

This isn't a demo agent. It's a production system that gets better every day it runs.

---

## Next steps

- [What is miniclaw-os?](what-is-miniclaw-os) — Architecture and key concepts
- [Framework comparison](miniclaw-os-vs-autogpt) — How miniclaw-os compares to AutoGPT, CrewAI, and others
- [Plugin Development Guide](https://github.com/augmentedmike/miniclaw-os/blob/main/docs/wiki/Writing-Plugins.md) — Build your own cognitive modules
- [GitHub](https://github.com/augmentedmike/miniclaw-os) — Source code, issues, discussions
