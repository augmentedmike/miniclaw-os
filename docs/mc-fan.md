# mc-fan

> Follow and authentically engage with people, agents, and projects the agent admires.

## Overview

mc-fan maintains a registry of people, agents, and projects to follow. It tracks engagement
history, checks for new content on YouTube, GitHub, and Substack, and supports authentic
interactions like commenting on Substack posts. Context is injected on cards tagged with
`fan`, `social`, `engagement`, `content`, or `networking`.

## Installation

```bash
cd ~/.openclaw/miniclaw/plugins/mc-fan
npm install
npm run build
```

### Prerequisites

- `yt-dlp` for YouTube content checks
- `gh` CLI for GitHub activity checks
- Substack SID in vault for commenting (`mc-vault set substack.sid <value>`)

## CLI Usage

```bash
# List all fans
openclaw fan list [-p PLATFORM]

# Add a new fan
openclaw fan add -n NAME -p PLATFORM -u URL1 URL2 -w "Why we follow" [--style intellectual-peer]

# Check a fan's latest content
openclaw fan check ID

# Show engagement overview
openclaw fan status
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `list` | List all fans with details | `openclaw fan list -p youtube` |
| `add` | Add person/project to registry | `openclaw fan add -n "Andrej Karpathy" -p youtube -u https://youtube.com/@karpathy -w "Leading AI educator"` |
| `check` | Show details and latest content for a fan | `openclaw fan check andrej-karpathy` |
| `status` | Engagement overview for all fans | `openclaw fan status` |

## Tool API

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `fan_add` | Add person/agent/project to registry | `name`, `platform`, `urls`, `whyWeFollow`, `engagementStyle` | `tags`, `notes` |
| `fan_list` | List all fans | — | `platform` |
| `fan_remove` | Remove fan from registry | `id` | — |
| `fan_check` | Check fan's latest content | `id` | `limit` (default 5) |
| `fan_engage` | Log engagement with content | `fanId`, `action`, `contentUrl`, `contentTitle` | `notes` |
| `fan_read_substack` | Read full Substack post as plain text | `postUrl` | — |
| `fan_comment_substack` | Post comment on Substack (min 50 chars, no generic praise) | `postId`, `body`, `fanId`, `postTitle`, `postUrl` | `substackDomain` |
| `fan_digest` | Summarize recent engagement | — | `fanId`, `days` (default 7) |
| `fan_status` | Overview with engagement stats | — | — |

### Example tool call (agent perspective)

```
Use the fan_check tool to see if Andrej Karpathy has posted any new YouTube videos.
```

## Configuration

No configuration keys required. Fan registry is stored as a JSON file managed by the plugin.

## Examples

### Example 1 — Add a fan and check their content

```bash
openclaw fan add -n "Simon Willison" -p blog -u https://simonwillison.net -w "AI tooling thought leader" --style intellectual-peer
openclaw fan check simon-willison
```

### Example 2 — Log engagement after watching a video

```bash
# After watching, log the engagement
openclaw fan engage --fan andrej-karpathy --action watched \
  --url "https://youtube.com/watch?v=abc123" \
  --title "Building GPT from Scratch"
```

## Architecture

- `index.ts` — Plugin entry point, context injection via `before_prompt_build` hook
- `cli/commands.ts` — Fan registry CLI (list, add, check, status)
- `tools/definitions.ts` — Agent tools for fan management and engagement
- `shared.ts` — Fan registry and engagement log persistence

## Troubleshooting

| Problem | Solution |
|---------|----------|
| YouTube check returns no results | Ensure `yt-dlp` is installed and the channel URL is correct |
| Substack comment fails | Verify `substack.sid` is set in mc-vault |
| Fan ID not found | IDs are slugified names — use `openclaw fan list` to see IDs |
