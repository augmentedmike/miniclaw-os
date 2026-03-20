# mc-x

> X/Twitter API v2 client — post tweets, read timelines, and reply to tweets.

## Overview

mc-x provides X/Twitter integration via the API v2. The agent can post tweets, read user
timelines, and reply to tweets. Authentication uses a Bearer token stored in mc-vault.

## Installation

```bash
cd ~/.openclaw/miniclaw/plugins/mc-x
npm install
npm run build
```

### Prerequisites

- X developer account with API v2 access
- Bearer token stored in mc-vault: `openclaw mc-x auth --token <bearer>`

## CLI Usage

```bash
# Store Bearer token
openclaw mc-x auth --token BEARER_TOKEN

# Post a tweet
openclaw mc-x post "Hello from MiniClaw!"

# Read a user's timeline
openclaw mc-x timeline --user-id USER_ID [--count N]

# Reply to a tweet
openclaw mc-x reply TWEET_ID "Reply text"
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `auth` | Store X/Twitter Bearer token in vault | `openclaw mc-x auth --token abc123` |
| `post` | Post a new tweet | `openclaw mc-x post "Shipping new features today"` |
| `timeline` | Read recent tweets from a user | `openclaw mc-x timeline --user-id 12345 --count 20` |
| `reply` | Reply to a tweet | `openclaw mc-x reply 789456 "Great thread!"` |

## Tool API

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `x_post` | Post a new tweet (max 280 chars) | `text` | — |
| `x_timeline` | Read recent tweets from a user | `user_id` | `count` (5–100, default 10) |
| `x_reply` | Reply to a tweet (max 280 chars) | `tweet_id`, `text` | — |

### Example tool call (agent perspective)

```
Use the x_post tool to tweet about the latest MiniClaw release.
```

## Configuration

Bearer token is managed via mc-vault (set with `openclaw mc-x auth`). No additional config schema keys.

## Examples

### Example 1 — Post a tweet

```bash
openclaw mc-x post "Just shipped mc-x plugin for MiniClaw — tweet from the terminal 🚀"
```

### Example 2 — Read and reply to a timeline

```bash
openclaw mc-x timeline --user-id 12345 --count 5
openclaw mc-x reply 789456123 "Interesting point about agent architectures"
```

## Architecture

- `index.ts` — Plugin entry point, checks for Bearer token, registers CLI and tools
- `cli/commands.ts` — CLI command registrations (auth, post, timeline, reply)
- `tools/definitions.ts` — Agent tool definitions (x_post, x_timeline, x_reply)
- `src/client.ts` — XClient class for X API v2 interactions
- `src/vault.ts` — Bearer token vault management

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Bearer token not found" | Run `openclaw mc-x auth --token <token>` to store credentials |
| 401 Unauthorized | Token may be expired — generate a new one from the X developer portal |
| Rate limited | X API has rate limits — wait and retry, or reduce `count` on timeline reads |
| Tweet too long | Tweets are limited to 280 characters |
