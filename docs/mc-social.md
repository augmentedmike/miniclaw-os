# mc-social

> Outbound GitHub social engagement — track repos, find contribution opportunities, and log activity.

## Overview

mc-social enables the agent to engage with the GitHub community by scanning repos for contribution
opportunities, starring projects, creating issues, commenting on discussions, and tracking engagement
metrics. Context is injected on cards tagged with relevant social/engagement tags.

## Installation

```bash
cd ~/.openclaw/miniclaw/plugins/mc-social
npm install
npm run build
```

### Prerequisites

- `gh` CLI authenticated (`gh auth login`)
- Target repos list in knowledge base (KB article ID: `github-social-targets`)

## CLI Usage

```bash
# Show engagement metrics summary
openclaw social status
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `status` | Show total actions, weekly stats, by type, by repo, recent activity | `openclaw social status` |

## Tool API

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `social_scan_opportunities` | Scan a GitHub repo for contribution opportunities | `repo` (owner/name) | — |
| `social_star_repo` | Star a GitHub repository | `repo` | — |
| `social_create_issue` | Create an issue on a repo | `repo`, `title`, `body` | `labels` |
| `social_create_discussion_comment` | Comment on a GitHub Discussion | `repo`, `discussionNumber`, `body` | — |
| `social_log_engagement` | Log an engagement action | `repo`, `action`, `url`, `description` | — |
| `social_metrics` | View engagement metrics | — | — |
| `social_traffic` | Track engagement by repo | — | — |
| `social_list_targets` | List target repos to engage with | — | — |

### Example tool call (agent perspective)

```
Use the social_scan_opportunities tool to find good-first-issue items in the langchain repo.
```

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `targetListKbId` | `string` | `github-social-targets` | KB article ID for target repo list |

## Examples

### Example 1 — Scan for contribution opportunities

```bash
# Via agent tool:
# "Scan langchain-ai/langchain for contribution opportunities"
openclaw social status
```

### Example 2 — Log engagement after contributing

```bash
# Agent logs engagement automatically after starring, commenting, or creating issues
openclaw social status
```

## Architecture

- `index.ts` — Plugin entry point, `before_prompt_build` hook for context injection on tagged cards
- `cli/commands.ts` — Social status CLI command
- `tools/definitions.ts` — Social tools (scan, star, issue, comment, log, metrics)
- `shared.ts` — Engagement log path and JSON file I/O utilities

### Data Storage

- Engagement log: `~/.openclaw/USER/engagement.jsonl`
- Target repos: stored in mc-kb (article ID from `targetListKbId` config)

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "gh: command not found" | Install GitHub CLI: `brew install gh` |
| No target repos | Add a KB article with ID `github-social-targets` listing repos to engage with |
| Engagement log missing | Log is created on first engagement action |
