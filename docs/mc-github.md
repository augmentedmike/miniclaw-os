# mc-github

> Manage GitHub issues, PRs, releases, and Actions workflows via the gh CLI.

## Overview

mc-github wraps the GitHub CLI to provide issue, pull request, release, and Actions management
as both CLI commands and agent tools. It injects GitHub workflow context into every prompt,
loads `CODING_AXIOMS.md` from repos when available, auto-stars configured repositories, and
enforces repository protection policies via an hourly cron.

## Installation

```bash
cd ~/.openclaw/miniclaw/plugins/mc-github
npm install
npm run build
```

### Prerequisites

- `gh` CLI installed and authenticated (`gh auth login`)

## CLI Usage

```bash
# List open issues
openclaw github issues [-s STATE] [-l LABEL] [--limit N]

# Show issue details
openclaw github issue NUMBER

# List open pull requests
openclaw github prs [-s STATE] [--limit N]

# Show PR details
openclaw github pr NUMBER
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `issues` | List open issues with optional filters | `openclaw github issues -l bug --limit 10` |
| `issue` | Show issue details | `openclaw github issue 42` |
| `prs` | List open pull requests | `openclaw github prs -s closed` |
| `pr` | Show pull request details | `openclaw github pr 99` |

## Tool API

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `github_issue_create` | Create a GitHub issue | `title`, `body` | `labels` |
| `github_issue_update` | Update issue properties | `issueNumber` | `title`, `body`, `state`, `addLabels`, `removeLabels`, `assignees` |
| `github_issue_list` | List issues with filters | — | `state` (default open), `labels`, `assignee`, `limit` (default 30) |
| `github_issue_comment` | Add comment to an issue | `issueNumber`, `body` | — |
| `github_pr_create` | Create a pull request | `title`, `body` | `base` (default main), `draft` |
| `github_pr_list` | List PRs with filters | — | `state` (default open), `base`, `author`, `limit` (default 30) |
| `github_pr_merge` | Merge a pull request | `prNumber` | `method` (merge/squash/rebase), `deleteRemoteBranch` (default true) |
| `github_release_create` | Create a release | `tag`, `title` | `body`, `draft`, `prerelease`, `target` |
| `github_actions_status` | Check workflow run status | — | `branch`, `limit` |

### Example tool call (agent perspective)

```
Use the github_issue_list tool to find all open issues labeled "bug".
```

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `defaultRepo` | `string` | `(auto-detect from git remote)` | Default GitHub repo (owner/name) |

## Examples

### Example 1 — Triage new issues

```bash
openclaw github issues -s open --limit 20
openclaw github issue 315
```

### Example 2 — Create a PR from a feature branch

```bash
# Agent creates PR via tool
openclaw github pr NUMBER
```

## Architecture

- `index.ts` — Plugin entry point, context injection, auto-star, repo protection cron
- `cli/commands.ts` — GitHub CLI commands (issues, PRs)
- `tools/definitions.ts` — Comprehensive agent tools for GitHub operations
- `src/repo-protection.js` — Enforces repository protection policies

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "gh: command not found" | Install GitHub CLI: `brew install gh` |
| Authentication error | Run `gh auth login` to re-authenticate |
| Wrong repo detected | Set `defaultRepo` in plugin config |
