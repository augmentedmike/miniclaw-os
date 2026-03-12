# mc-backup — State Directory Backups with Tiered Retention

mc-backup creates compressed tgz archives of the entire MiniClaw state directory and manages retention with a three-tier policy: recent dailies, monthly snapshots, and yearly archives.

---

## Overview

The plugin wraps `tar czf` with sensible defaults, automatic directory exclusions, and a retention policy that balances disk space against recovery granularity. Backups are stored as timestamped `.tgz` files in a configurable directory. After each backup, old archives are pruned according to cumulative size thresholds.

---

## CLI Commands

All commands use `openclaw mc-backup <subcommand>`.

### `now`

Create a backup immediately and prune old archives.

```
openclaw mc-backup now [--no-prune]

Options:
  --no-prune    Skip pruning after backup

Example:
  openclaw mc-backup now
```

Runs `tar czf` on the state directory, excluding configured directories (projects, .git, node_modules, logs, tmp, browser, media by default). The backup file is named by ISO timestamp: `2026-03-11T14-30-00.tgz`.

### `list`

List all backup archives with sizes.

```
openclaw mc-backup list
```

Alias: `ls`. Shows each archive filename, size in MB, and a total.

### `prune`

Delete old backups per the retention policy.

```
openclaw mc-backup prune [--dry-run]

Options:
  --dry-run    Show what would be deleted without deleting
```

### `restore <filename>`

Restore a backup archive to the state directory parent.

```
openclaw mc-backup restore <filename>

Example:
  openclaw mc-backup restore 2026-03-11T14-30-00.tgz
```

Accepts a filename (resolved relative to backupDir) or a full path. Extracts with `tar xzf` to the parent of stateDir.

---

## Agent Tools

| Tool | Description |
|------|-------------|
| `backup_now` | Create a tgz backup and prune old archives. Returns backup path and size. |
| `backup_list` | List all backup archives with dates and sizes. |

---

## Retention Policy

Backups are walked newest-to-oldest, accumulating size:

| Cumulative size | Kept | Granularity |
|-----------------|------|-------------|
| Under `recentQuotaBytes` (1 GB default) | All | Daily |
| Under `totalQuotaBytes` (2 GB default) | Day = 1 only | Monthly (1st of month) |
| Over `totalQuotaBytes` | Month = Jan and Day = 1 only | Yearly (Jan 1) |

Everything else is deleted. Pruning runs automatically after `mc-backup now` unless `--no-prune` is passed.

---

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `backupDir` | string | `$OPENCLAW_STATE_DIR/backups` | Directory for backup archives |
| `recentQuotaBytes` | number | `1073741824` (1 GB) | Cumulative size threshold for keeping all dailies |
| `totalQuotaBytes` | number | `2147483648` (2 GB) | Cumulative size threshold for monthly-only retention |
| `excludeDirs` | string[] | `["projects", ".git", "node_modules", "backups", "logs", "tmp", "browser", "media", "*/media"]` | Directories excluded from backup |
| `includeUserMedia` | boolean | `false` | If true, stops excluding `*/media` (user-generated assets) |

---

## State Storage

Backup archives: `$OPENCLAW_STATE_DIR/backups/`

Filename convention: `YYYY-MM-DDTHH-MM-SS.tgz`
