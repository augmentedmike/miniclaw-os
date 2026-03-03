# mc-board

State-machine kanban board — the agent's prefrontal cortex.

## Commands

```bash
openclaw cli brain create --title "Fix bug" --priority high
openclaw cli brain list
openclaw cli brain board
openclaw cli brain move <id> in-progress
openclaw cli brain move <id> in-review
openclaw cli brain move <id> shipped
openclaw cli brain archive <id>
openclaw cli brain next         # what to work on next
```

## Column flow

```
backlog → in-progress → in-review → shipped
```

Each transition has enforced gates. The agent cannot move a card forward without meeting the conditions for that column (e.g. a card needs `problem_description`, `implementation_plan`, and `acceptance_criteria` before moving to `in-progress`).

## Config

| Key | Default | Description |
|-----|---------|-------------|
| `cardsDir` | `~/.openclaw/user/brain/cards` | Where card JSON files are stored |
| `qmdBin` | `~/.bun/bin/qmd` | Path to QMD binary |
| `qmdCollection` | `mc-board` | QMD collection name |
| `webPort` | `4220` | Port for the web debug view |
