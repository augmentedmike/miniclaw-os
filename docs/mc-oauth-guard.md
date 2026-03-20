# mc-oauth-guard

> Monitors OAuth token refresh failures, auto-disables failing profiles, and attempts keychain recovery.

## Overview

mc-oauth-guard watches for OAuth token refresh failures across agent profiles. After repeated
failures it auto-disables the failing profile to prevent cascading errors, applies exponential
backoff, and attempts to recover Anthropic tokens from the macOS keychain. It operates via
event hooks — no agent tools are exposed.

## Installation

```bash
cd ~/.openclaw/miniclaw/plugins/mc-oauth-guard
npm install
npm run build
```

### Prerequisites

- macOS keychain access (for Anthropic token recovery)
- Auth profiles at `~/.openclaw/agents/main/agent/auth-profiles.json`

## CLI Usage

```bash
# Show failure tracking status
openclaw oauth_guard_status

# Reset failure state for a profile
openclaw oauth_guard_reset [profileId]

# Attempt keychain recovery for Anthropic OAuth
openclaw oauth_guard_recover [profileId]
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `oauth_guard_status` | Show failure counts and backoff state | `openclaw oauth_guard_status` |
| `oauth_guard_reset` | Reset failure state for a profile | `openclaw oauth_guard_reset default` |
| `oauth_guard_recover` | Attempt keychain recovery | `openclaw oauth_guard_recover default` |

## Tool API

No agent tools. mc-oauth-guard operates via event hooks (`agent_end`, `before_model_resolve`).

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable OAuth guard |
| `maxConsecutiveFailures` | `number` | `3` | Failures before disabling a profile |
| `minBackoffMs` | `number` | `300000` | Minimum backoff interval (5 min) |
| `maxBackoffMs` | `number` | `3600000` | Maximum backoff interval (1 hour) |
| `keychainRecovery` | `boolean` | `true` | Attempt macOS keychain recovery for Anthropic tokens |

## Examples

### Example 1 — Check which profiles have failures

```bash
openclaw oauth_guard_status
```

### Example 2 — Reset after fixing credentials

```bash
# After updating OAuth credentials:
openclaw oauth_guard_reset default
```

## Architecture

- `index.ts` — Plugin entry point, event hooks, CLI commands
- `src/guard.js` — OAuthGuard class for state tracking and backoff logic
- `src/keychain.js` — macOS keychain credential recovery

### Hook Flow

1. `agent_end` — Detects OAuth failures from agent session results
2. `before_model_resolve` — Blocks retries during backoff period

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Profile auto-disabled | Run `openclaw oauth_guard_reset <profileId>` after fixing credentials |
| Keychain recovery fails | Ensure macOS keychain access is granted in System Settings |
| Backoff too aggressive | Increase `maxConsecutiveFailures` or decrease `minBackoffMs` |
