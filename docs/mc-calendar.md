# mc-calendar

> Apple Calendar integration via macOS EventKit — list, create, update, delete, and search events.

## Overview

mc-calendar bridges the macOS Calendar app (EventKit) with the MiniClaw agent runtime.
It lets the agent manage calendars and events through CLI commands and agent tools,
enabling scheduling workflows without leaving the terminal.

## Installation

```bash
cd ~/.openclaw/miniclaw/plugins/mc-calendar
npm install
npm run build
```

### Prerequisites

- macOS with EventKit access granted (System Settings → Privacy & Security → Calendars)
- EventKit helper binary (bundled)

## CLI Usage

```bash
# List all calendars
openclaw mc-calendar list

# Show upcoming events (default 7 days)
openclaw mc-calendar events [-d DAYS] [-c CALENDAR]

# Search events by text
openclaw mc-calendar search QUERY [-d DAYS] [-c CALENDAR]

# Read full event details
openclaw mc-calendar read UID

# Create a new event
openclaw mc-calendar create -c NAME -s TITLE --start DATE --end DATE [--location LOC] [--notes NOTES]

# Delete an event
openclaw mc-calendar delete UID

# Check EventKit access
openclaw mc-calendar status
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `list` | List all calendars with read/write status | `openclaw mc-calendar list` |
| `events` | List upcoming events | `openclaw mc-calendar events -d 14` |
| `search` | Search events by title, location, or notes | `openclaw mc-calendar search "standup" -d 30` |
| `read` | Show full event details including recurrence | `openclaw mc-calendar read ABC-123-DEF` |
| `create` | Create a new event | `openclaw mc-calendar create -c Work -s "Team Sync" --start "2026-03-20 10:00" --end "2026-03-20 11:00"` |
| `delete` | Delete an event by UID | `openclaw mc-calendar delete ABC-123-DEF` |
| `status` | Check EventKit access and list calendars | `openclaw mc-calendar status` |

## Tool API

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `calendar_list` | List all calendars with writable status | — | — |
| `calendar_events` | List upcoming events | — | `days_ahead` (default 7), `calendar` |
| `calendar_search` | Search events by text (case-insensitive) | `query` | `days_ahead` (default 30), `calendar` |
| `calendar_read` | Read full event details by UID | `event_uid` | `calendar` |
| `calendar_create` | Create a new event | `calendar`, `summary`, `start_date`, `end_date` | `location`, `description`, `all_day` |
| `calendar_update` | Update existing event properties | `event_uid` | `calendar`, `summary`, `start_date`, `end_date`, `location`, `description`, `all_day` |
| `calendar_delete` | Delete event by UID | `event_uid` | — |

### Example tool call (agent perspective)

```
Use the calendar_events tool to check what meetings are scheduled for the next 3 days.
```

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `defaultCalendar` | `string` | `(auto)` | Default calendar name for operations |

## Examples

### Example 1 — Check today's schedule

```bash
openclaw mc-calendar events -d 1
```

### Example 2 — Create a recurring standup reminder

```bash
openclaw mc-calendar create -c Work -s "Daily Standup" \
  --start "2026-03-20 09:00" --end "2026-03-20 09:15" \
  --notes "Team sync — review board and blockers"
```

## Architecture

- `index.ts` — Plugin entry point, registers CLI commands and agent tools
- `cli/commands.ts` — CLI command definitions
- `tools/definitions.ts` — Agent tool definitions
- `src/config.ts` — Configuration resolver
- `src/helper.ts` — EventKit helper interface

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "EventKit access denied" | Grant Calendar access in System Settings → Privacy & Security → Calendars |
| Calendar not found | Run `openclaw mc-calendar list` to see available calendar names |
| Events not showing | Check the `-d` flag — default is 7 days ahead |
