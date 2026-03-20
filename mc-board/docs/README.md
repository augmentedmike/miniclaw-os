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
```

## Column flow

```
backlog → in-progress → in-review → shipped
```

## Config

| Key | Default | Description |
|-----|---------|-------------|
| `cardsDir` | `~/.openclaw/user/brain/cards` | Where card JSON files live |
| `qmdBin` | `~/.bun/bin/qmd` | Path to QMD binary |
| `qmdCollection` | `mc-board` | QMD collection name |
| `webPort` | `4220` | Port for the web debug view |
