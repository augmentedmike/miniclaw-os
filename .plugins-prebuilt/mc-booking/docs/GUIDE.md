# mc-booking — Appointment Scheduling

Cloud-based appointment scheduling with payment integration and embeddable widget.

## Quick start

```bash
mc mc-booking setup           # create Turso DB + vault credentials
mc mc-booking slots           # list available slots
mc mc-booking list            # upcoming appointments
mc mc-booking serve           # start HTTP server on port 4221
```

## Setup

1. Install Turso CLI: `brew install tursodatabase/tap/turso`
2. Sign up: `turso auth signup`
3. Create DB: `turso db create miniclaw-booking`
4. Run `mc mc-booking setup` and paste the URL + token
5. Schema is auto-migrated on first connect

## CLI commands

| Command | Description |
|---------|-------------|
| `mc-booking setup` | Create Turso DB + vault credentials |
| `mc-booking slots` | List available booking slots |
| `mc-booking list` | Upcoming confirmed appointments |
| `mc-booking show <token>` | Appointment details |
| `mc-booking cancel <token>` | Cancel with automatic refund |
| `mc-booking config [key] [value]` | View/set availability config |
| `mc-booking serve` | Start HTTP server on port 4221 |

## Agent tools

| Tool | Description |
|------|-------------|
| `booking_slots` | List available slots |
| `booking_list` | Upcoming appointments |
| `booking_show` | Appointment details by token |
| `booking_cancel` | Cancel with refund |
| `booking_reschedule` | Reschedule (48h notice required) |

## HTTP API

Start with `mc mc-booking serve` (port 4221).

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/slots` | Available slots |
| POST | `/api/appointments` | Create booking |
| GET | `/api/appointments/:token` | Appointment details |
| POST | `/api/appointments/:token/reschedule` | Reschedule |
| POST | `/api/appointments/:token/cancel` | Cancel + refund |
| GET | `/api/config` | Public config |
| GET | `/health` | Health check |
| GET | `/widget` | Embeddable booking widget |

CORS enabled for miniclaw.bot + augmentedmike.com.

## Payment providers

Set `paymentProvider` in config: `"stripe"`, `"square"`, or `"none"`.

mc-booking shells out to `mc mc-<provider> charge/refund` — never imports payment SDKs directly. Changing provider is a config switch, not a code change.

## Refund policy

- 48h+ before appointment: 100% refund
- Less than 48h: 50% refund

## Configurable availability

Defaults (overridable in DB via `mc mc-booking config set`):

- `availableDays`: [1, 2, 3] (Mon-Wed)
- `timeSlots`: [17, 18, 19] (UTC = 11am-1pm CST)
- `durationMinutes`: 90
- `priceCents`: 19900 ($199.00)
- `maxPerDay`: 1
- `windowWeeks`: 4

## Vault keys

- `turso-booking-url` — libsql://...
- `turso-booking-token` — Turso auth token

## Architecture

- **Hono** (14KB) for HTTP, not Next.js — this is a REST API + widget, not a dashboard
- **Turso** (cloud SQLite via @libsql/client) for uptime — async unlike mc-board's sync better-sqlite3
- **Payment bridge** shells out to mc-stripe/mc-square CLI — UNIX pipe philosophy
- **Widget** is a self-contained HTML page served at `/widget`, embeddable via iframe
