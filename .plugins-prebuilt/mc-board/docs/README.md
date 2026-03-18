# mc-board — Prefrontal Cortex

The prefrontal cortex handles planning, prioritization, and follow-through. Without it you can react, but you can't organize complex work across time.

By default an AI agent has no persistent working memory between sessions. It can complete a task you give it right now, but it can't track what it committed to yesterday, what's half-finished, or what to do next. Every conversation starts from zero.

**mc-board gives openclaw a prefrontal cortex.**

It adds a state-machine kanban board — backlog → in-progress → in-review → shipped — where the agent tracks its own work. Cards carry context: problem description, implementation plan, acceptance criteria, notes. At the start of every session the board is injected into the prompt so the agent always knows where things stand without being told.

Transitions are enforced. The agent can't move a card to in-progress without a problem description, implementation plan, and acceptance criteria. It can't mark something shipped without a review sign-off. This isn't just organization — it's enforced executive function. The agent has to think before it acts.

## What changes

**Without mc-board:** the agent completes tasks in a single session and forgets them. Ask what it's working on and it has no answer. Long-running projects require you to re-explain context every time.

**With mc-board:** the agent maintains a live view of its own work across sessions. It creates cards autonomously, moves them through states, and knows what to pick up next without being asked.

## Commands

```bash
mc board create --title "Fix auth bug" --priority high
mc board list
mc board board                    # full kanban view
mc board move <id> in-progress
mc board move <id> in-review
mc board move <id> shipped
mc board next                     # what should I work on next?
mc board archive <id>

# WIP limit
mc board wip-limit in-progress    # print configured max for a column
mc board wip-limit in-review
```

## Column flow

```
backlog → in-progress → in-review → shipped
```

## WIP limits

Each column has a configurable max concurrent cards (`maxConcurrent` in `board-cron.json`, default: 3). The limit is enforced in two places:

- **`brain move`** — blocks the move and exits non-zero if the target column is at capacity. Use `--force` to override for recovery.
- **`brain triage`** — the auto-move step that fires when Haiku marks a card ready also checks the WIP limit. Cards exceeding the limit stay in backlog; the error is written to card notes.

Cron worker prompts call `mc board wip-limit <column>` at runtime to read the configured value — no hardcoded numbers.

## Config

| Key | Default | Description |
|-----|---------|-------------|
| `cardsDir` | `~/.openclaw/user/brain/cards` | Where card JSON files live |
| `qmdBin` | `~/.bun/bin/qmd` | Path to QMD binary |
| `qmdCollection` | `mc-board` | QMD collection name |
| `webPort` | `4220` | Port for the web debug view |
