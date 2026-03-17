# mc-oauth-guard

OAuth token refresh failure guard for OpenClaw. Prevents retry storms when Claude Code rotates the shared Anthropic refresh token, invalidating OpenClaw's copy.

## Problem

When Claude Code and OpenClaw share the same Anthropic OAuth client, Claude Code may rotate the refresh token, making OpenClaw's stored copy stale. Without this guard, OpenClaw retries the failed refresh every cron cycle (~5 minutes), filling `gateway.err.log` with 95+ repeated errors.

## What it does

1. **Detects repeated failures** — monitors `agent_end` events for "OAuth token refresh failed" errors
2. **Exponential backoff** — after each failure, increases the retry delay (5m → 10m → 20m → ... up to 1h)
3. **Auto-disable** — after 3 consecutive failures, disables the OAuth profile and logs a clear re-auth message
4. **Keychain recovery** — on macOS, attempts to re-import fresh credentials from Claude Code's keychain/config before disabling
5. **CLI commands** — `oauth_guard_status`, `oauth_guard_reset`, `oauth_guard_recover` for manual management

## Manual workaround

If the plugin cannot auto-recover, paste a fresh token manually:

```bash
openclaw models auth paste-token --provider anthropic
```

This creates/updates the `anthropic:manual` token profile, which the gateway uses as `lastGood` fallback.

## Configuration

In `openclaw.plugin.json` or MANIFEST.json config:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable the guard |
| `maxConsecutiveFailures` | number | `3` | Failures before auto-disabling a profile |
| `minBackoffMs` | number | `300000` | Minimum backoff (5 minutes) |
| `maxBackoffMs` | number | `3600000` | Maximum backoff (1 hour) |
| `keychainRecovery` | boolean | `true` | Attempt macOS keychain re-import |

## Fixes

- [augmentedmike/miniclaw-os#157](https://github.com/augmentedmike/miniclaw-os/issues/157)
