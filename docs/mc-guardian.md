# mc-guardian

> Absorbs non-fatal uncaught exceptions to prevent plugin errors from crashing the gateway process.

## Overview

mc-guardian replaces the default `uncaughtException` and `unhandledRejection` handlers with
resilient alternatives. Non-fatal errors are logged to a file instead of crashing the process,
while truly fatal errors (out of memory, stack overflow) are allowed to propagate normally.

## Installation

```bash
cd ~/.openclaw/miniclaw/plugins/mc-guardian
npm install
npm run build
```

### Prerequisites

- No external dependencies required

## CLI Usage

```bash
# Check guardian status
openclaw guardian_status
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `guardian_status` | Show absorbed error count and log file location | `openclaw guardian_status` |

## Tool API

No agent tools. mc-guardian is a utility plugin for process resilience.

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | `boolean` | `true` | Enable/disable guardian error handling |

## Examples

### Example 1 — Check how many errors have been absorbed

```bash
openclaw guardian_status
```

### Example 2 — Review absorbed errors

```bash
cat ~/.openclaw/guardian.log | tail -20
```

## Architecture

- `index.ts` — Replaces `uncaughtException` and `unhandledRejection` handlers, registers status command

### Fatal Error Patterns (allowed to crash)

- `out of memory`
- `allocation failed`
- `maximum call stack`
- `FATAL ERROR`

All other uncaught errors are absorbed and logged to `~/.openclaw/guardian.log`.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Process still crashing | Check if the error matches a fatal pattern — those are intentionally not caught |
| Log file growing too large | Rotate or truncate `~/.openclaw/guardian.log` |
| Want to disable guardian | Set `enabled: false` in plugin config |
