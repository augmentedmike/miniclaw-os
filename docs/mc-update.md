# mc-update

> Nightly self-update system — checks for stable tags, pulls updates, rebuilds, and verifies with smoke tests.

## Overview

mc-update automates keeping MiniClaw up to date. It runs as a nightly cron job (3 AM by default),
checking for new stable-tagged versions of the miniclaw-os fork, all plugins, and the openclaw core.
It updates everything except `workspace/` and `USER/` directories, runs mc-smoke to verify,
and auto-rolls back if smoke tests fail.

## Installation

```bash
cd ~/.openclaw/miniclaw/plugins/mc-update
npm install
npm run build
```

### Prerequisites

- Git repositories with stable tags
- mc-backup plugin (for pre-update snapshots)
- mc-smoke for post-update verification

## CLI Usage

```bash
# Check for updates without applying
openclaw mc-update check

# Fetch, pull, rebuild, and verify
openclaw mc-update now

# Rollback to pre-update state
openclaw mc-update rollback

# Show last update time, versions, schedule
openclaw mc-update status
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `check` | Dry run — check for available updates | `openclaw mc-update check` |
| `now` | Fetch stable tags, pull, rebuild, verify | `openclaw mc-update now` |
| `rollback` | Revert to pre-update refs | `openclaw mc-update rollback` |
| `status` | Show update history and schedule | `openclaw mc-update status` |

## Tool API

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `update_check` | Check for available updates without applying | — | — |
| `update_now` | Fetch, pull, rebuild, and verify | — | — |
| `update_status` | Query last update time, versions, schedule | — | — |

### Example tool call (agent perspective)

```
Use the update_check tool to see if any new versions are available.
```

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `updateTime` | `string` | `0 3 * * *` | Cron expression for scheduled updates |
| `autoRollback` | `boolean` | `true` | Rollback if mc-smoke fails |
| `notifyOnUpdate` | `boolean` | `true` | Log notification when updates applied |
| `smokeTimeout` | `number` | `60000` | Timeout for mc-smoke verification (ms) |
| `repos` | `array` | `(auto-discovered)` | Repositories to check (name, path, remote, stableTag) |

## Examples

### Example 1 — Manual update

```bash
openclaw mc-update check
# If updates available:
openclaw mc-update now
```

### Example 2 — Rollback after a bad update

```bash
openclaw mc-update rollback
openclaw mc-update status
```

## Architecture

- `index.ts` — Plugin entry point, config resolution, cron job registration (`mc-update-nightly`)
- `cli/commands.ts` — CLI commands (check, now, rollback, status)
- `tools/definitions.ts` — 3 agent tools
- `src/updater.js` — Git operations (fetch, checkout stable tags, rebuild)
- `src/orchestrator.js` — Full update flow (backup → check → pull → rebuild → smoke → rollback)
- `src/state.js` — Update state persistence (lastCheck, lastUpdate, versions, rollbackRefs)

### Update Flow

1. Pre-update backup via mc-backup
2. Fetch stable tags from all configured repos
3. Checkout new stable tags and rebuild
4. Run mc-smoke to verify
5. Auto-rollback if smoke tests fail (when `autoRollback: true`)

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Update stuck | Check for lock files in state directory |
| Smoke test fails | Run `openclaw mc-update rollback` then investigate manually |
| Cron not running | Verify cron job with `openclaw mc-update status` |
| No updates found | Ensure repos have new stable tags pushed to remote |
