# Agent Workflow

How a task moves from idea to shipped. This is the core loop that mc-board, mc-context, and mc-memo orchestrate together.

---

## The Task Lifecycle

```
  ┌──────────┐     ┌──────────────┐     ┌───────────┐     ┌─────────┐
  │ BACKLOG  │────▶│ IN-PROGRESS  │────▶│ IN-REVIEW │────▶│ SHIPPED │
  └──────────┘     └──────────────┘     └───────────┘     └─────────┘
       │                  │                    │
       │                  │                    │
   Triage cron        Work cron           Review cron
   (every 5 min)     (every 5 min)       (every 5 min)
```

### 1. Backlog — Triage

Cards enter the backlog from:
- Human request (Telegram, Slack, web)
- Agent self-creation (discovered during other work)
- SEO audit findings (mc-seo → mc-board)
- Cron jobs

The **board-worker-backlog** cron (every 5 min):
1. Scans backlog cards
2. Selects the best candidate per project (priority + age + dependencies)
3. Fills in problem description, implementation plan, acceptance criteria
4. Moves to in-progress

### 2. In-Progress — Work

The **board-worker-in-progress** cron:
1. Picks up in-progress cards
2. Reads the implementation plan
3. Creates a working memo (mc-memo) to track what's been tried
4. Does the work (code, research, design, outreach)
5. Checks acceptance criteria after each step
6. Moves to in-review when criteria are met

During work, the agent uses:
- **mc-kb** to search for prior knowledge and lessons
- **mc-memo** to avoid repeating failed approaches
- **mc-context** to keep the conversation window focused
- **mc-designer** for any visual work
- **mc-human** if it gets stuck (CAPTCHA, login wall)

### 3. In-Review — Verification

The **board-worker-in-review** cron:
1. Re-reads the acceptance criteria
2. Verifies each criterion is met
3. Runs any automated checks
4. Ships or sends back to in-progress with notes

### 4. Shipped — Done

Card is archived. Lessons learned are saved to mc-kb.

---

## How Context Flows

At each step, plugins inject context into the agent's prompt:

| Plugin | What it injects |
|--------|----------------|
| mc-board | Current card details, acceptance criteria, project context |
| mc-kb | Relevant knowledge entries (auto-searched based on card content) |
| mc-memo | Previous attempts and notes for this card |
| mc-soul | Agent personality and identity |
| mc-context | Pruned conversation history (recent, relevant) |
| mc-trust | Trust status of any peer agents involved |
| mc-designer | Active canvases and layer state |

This is **context engineering** — the right information at the right time, without flooding the context window.

---

## Cron Schedule

| Job | Interval | What it does |
|-----|----------|-------------|
| board-worker-backlog | Every 5 min | Triage and promote best backlog card |
| board-worker-in-progress | Every 5 min (offset) | Work on active cards |
| board-worker-in-review | Every 5 min (offset) | Verify and ship reviewed cards |
| nightly-voice-analyze | Daily 3:17 AM | Update voice style profiles |

---

See also:
- [Brain Regions](Brain-Regions) — what each plugin does
- [Writing Plugins](Writing-Plugins) — hook into the lifecycle
- [Discussions](https://github.com/augmentedmike/miniclaw-os/discussions)
