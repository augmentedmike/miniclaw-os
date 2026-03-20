# mc-devlog

> Daily devlog cron — aggregates yesterday's git activity, credits contributors, and publishes to multiple targets.

## Overview

mc-devlog gathers the previous day's git commits, merged PRs, closed issues, and shipped board cards,
then formats them into a markdown devlog post. It publishes to GitHub Discussions, mc-blog, mc-substack,
and queues a weekly digest flag for mc-reddit.

## Installation

```bash
cd ~/.openclaw/miniclaw/plugins/mc-devlog
npm install
npm run build
```

### Prerequisites

- Git repository with commit history
- `gh` CLI authenticated for GitHub Discussions
- mc-blog and mc-substack plugins (optional, for cross-posting)

## CLI Usage

```bash
# Generate and publish yesterday's devlog
openclaw mc-devlog run

# Preview without publishing (dry run)
openclaw mc-devlog preview
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `run` | Generate and publish devlog to all targets | `openclaw mc-devlog run` |
| `preview` | Dry-run — show devlog without publishing | `openclaw mc-devlog preview` |

## Tool API

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `devlog_preview` | Gather yesterday's activity and format without publishing | — | — |
| `devlog_publish` | Gather, format, and publish to all configured targets | — | — |

### Example tool call (agent perspective)

```
Use the devlog_preview tool to see what yesterday's activity looks like before publishing.
```

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `repoDir` | `string` | `~/.openclaw/projects/miniclaw-os` | Git repository path |
| `githubRepo` | `string` | `miniclaw-official/miniclaw-os` | GitHub owner/repo for Discussions |
| `discussionCategory` | `string` | `Devlog` | GitHub Discussions category |
| `postsDir` | `string` | `~/.openclaw/USER/blog/posts` | Directory for mc-blog posts |
| `contributorMap` | `object` | `{}` | Map git author names → display names |
| `substackEnabled` | `boolean` | `false` | Cross-post to Substack |
| `redditDigestDir` | `string` | `~/.openclaw/USER/devlog/reddit-queue` | Weekly digest queue directory |
| `timezone` | `string` | `America/Chicago` | Timezone for date display |

## Examples

### Example 1 — Preview before publishing

```bash
openclaw mc-devlog preview
# Review the output, then:
openclaw mc-devlog run
```

### Example 2 — Configure contributor names

Set `contributorMap` in `openclaw.plugin.json`:
```json
{
  "contributorMap": {
    "mike@example.com": "Mike O'Neal",
    "bot@miniclaw.dev": "Am (MiniClaw Agent)"
  }
}
```

## Architecture

- `index.ts` — Plugin entry point, registers CLI and cron job
- `cli/commands.ts` — Devlog run and preview commands
- `tools/definitions.ts` — Agent tools for preview and publish
- `src/gather.js` — Gathers git commits, PRs, issues, shipped cards
- `src/format.js` — Formats activity into markdown
- `src/publish.js` — Publishes to GitHub Discussions, mc-blog, mc-substack
- `src/types.ts` — Configuration types

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Empty devlog | Ensure `repoDir` points to a repo with recent commits |
| GitHub Discussions post fails | Verify `gh` CLI is authenticated and the Discussion category exists |
| Substack cross-post skipped | Set `substackEnabled: true` in config |
