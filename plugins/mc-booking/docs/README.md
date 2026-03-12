# mc-booking — Appointment Scheduling

mc-booking is MiniClaw's appointment scheduling system. It manages bookable time slots, takes payments through any configured provider (mc-stripe, mc-square, or none), and serves an embeddable booking widget — all from a single plugin.

## What changes

**Without mc-booking:** augmentedmike.com has a custom Next.js + MongoDB + Stripe booking system that's coupled to that one site. Moving it to miniclaw.bot means duplicating routes, models, and payment logic.

**With mc-booking:** booking is a shared service. Any site embeds `<iframe src="https://booking.miniclaw.bot/widget">` and gets a working booking flow. The payment provider is a config switch. The database is cloud SQLite (Turso) for uptime.

## Architecture

```
mc-booking/
├── index.ts                 # Plugin registration
├── src/
│   ├── config.ts            # BookingConfig — availability, pricing, origins
│   ├── db.ts                # Turso client init + schema migration
│   ├── store.ts             # AppointmentStore (async CRUD)
│   ├── slots.ts             # Configurable slot generation
│   ├── vault.ts             # mc-vault for Turso credentials
│   ├── server.ts            # Hono HTTP server (REST API + CORS)
│   ├── stripe-bridge.ts     # Shell out to mc-stripe/mc-square CLI
│   └── setup.ts             # Turso setup walkthrough
├── cli/
│   └── commands.ts          # 7 CLI commands
├── tools/
│   └── definitions.ts       # 5 agent tools
├── web/
│   └── embed.ts             # Self-contained booking widget HTML
└── docs/
    ├── README.md            # This file
    └── GUIDE.md             # Quick reference
```

### Design decisions

1. **Hono, not Next.js.** mc-booking is a REST API + widget, not a dashboard. Hono is 14KB, starts instantly, and runs anywhere. The widget is a single HTML page, not a React app.

2. **Turso (cloud SQLite), not MongoDB.** The original augmentedmike.com booking used MongoDB. mc-booking uses Turso because:
   - Cloud-hosted — always available, no self-hosting
   - SQLite semantics — familiar, simple, predictable
   - @libsql/client is async (unlike mc-board's sync better-sqlite3)

3. **Payment bridge, not direct integration.** mc-booking shells out to `mc mc-stripe charge` or `mc mc-square charge` via subprocess. It never imports payment SDKs directly. This means:
   - Changing provider = changing one config value
   - Payment plugins can be updated independently
   - UNIX pipe philosophy: small tools composed together

4. **Configurable availability.** Everything is a config value:
   - Which days of the week are bookable
   - Which UTC hours have slots
   - Duration, price, max per day, booking window
   - All overridable via the `config` DB table at runtime

5. **48-hour refund policy.** 100% refund if cancelled 48h+ before appointment, 50% if less. This matches the existing augmentedmike.com policy.

6. **Manage tokens, not auth.** Each appointment gets a 32-byte hex manage token. Customers use this to view, reschedule, or cancel — no login required. Simple, stateless, email-friendly.

## Database schema

```sql
appointments (
  id               TEXT PRIMARY KEY        -- apt_<hex8>
  name             TEXT NOT NULL
  email            TEXT NOT NULL
  interest         TEXT NOT NULL DEFAULT ''
  scheduled_time   TEXT NOT NULL            -- ISO 8601
  notes            TEXT NOT NULL DEFAULT ''
  status           TEXT NOT NULL DEFAULT 'confirmed'
  manage_token     TEXT NOT NULL UNIQUE     -- 32-byte hex
  stripe_payment_id TEXT NOT NULL DEFAULT ''
  stripe_refund_id  TEXT NOT NULL DEFAULT ''
  refund_amount    INTEGER NOT NULL DEFAULT 0
  paid_at          TEXT NOT NULL DEFAULT ''
  cancelled_at     TEXT NOT NULL DEFAULT ''
  created_at       TEXT NOT NULL
  updated_at       TEXT NOT NULL
)

config (key TEXT PRIMARY KEY, value TEXT NOT NULL)
```

Indexes on `(scheduled_time, status)` and `(manage_token)`.

## HTTP API

Start with `mc mc-booking serve` (default port 4221).

### Endpoints

| Method | Path | Purpose | Status codes |
|--------|------|---------|-------------|
| GET | `/health` | Health check | 200 |
| GET | `/api/config` | Public config (price, duration, days) | 200 |
| GET | `/api/slots` | Available booking slots | 200 |
| POST | `/api/appointments` | Create booking | 201, 400, 409, 502 |
| GET | `/api/appointments/:token` | Appointment details | 200, 404 |
| POST | `/api/appointments/:token/reschedule` | Reschedule | 200, 400, 404, 409 |
| POST | `/api/appointments/:token/cancel` | Cancel + refund | 200, 400, 404, 502 |
| GET | `/widget` | Embeddable booking widget | 200 |

### CORS

Configured origins: `miniclaw.bot`, `augmentedmike.com`, `localhost:3000`.

### Create appointment request

```json
POST /api/appointments
{
  "name": "Alice Smith",
  "email": "alice@example.com",
  "interest": "AI consulting",
  "scheduled_time": "2026-03-18T17:00:00.000Z",
  "notes": "Optional notes"
}
```

Response (201):
```json
{
  "id": "apt_a3f2b1c0",
  "manage_token": "64-char-hex-string",
  "scheduled_time": "2026-03-18T17:00:00.000Z",
  "status": "confirmed"
}
```

### Validation rules

- `name`, `email`, `scheduled_time` required
- Email must match basic format
- `scheduled_time` must be valid ISO 8601, in the future
- Slot must not be already booked (409)
- Day must not be at capacity (409)
- Payment must succeed before booking is confirmed (502 on failure)

### Reschedule rules

- Appointment must be `confirmed`
- Must be 48h+ before the original time
- New time must be available

### Cancel + refund rules

- Appointment must be `confirmed`
- 48h+ before: 100% refund
- Less than 48h: 50% refund
- Refund via configured payment provider

## Booking widget

A self-contained HTML page at `/widget`. Dark theme, responsive, no external dependencies.

Features:
- Month calendar with available date highlighting
- Time slot buttons per selected day
- Booking form (name, email, interest, notes)
- Success confirmation
- All JavaScript inline, no build step

Embed with: `<iframe src="https://your-host:4221/widget" width="100%" height="700"></iframe>`

## CLI reference

### `mc mc-booking setup`
Guided Turso database setup. Prompts for URL and token, vaults them, runs schema migration.

### `mc mc-booking slots`
Lists available slots for the configured window, grouped by date.

### `mc mc-booking list [-n <limit>]`
Lists upcoming confirmed appointments.

### `mc mc-booking show <token>`
Full appointment details by manage token.

### `mc mc-booking cancel <token>`
Cancels appointment with automatic refund (48h rule applies).

### `mc mc-booking config [key] [value]`
View all config, get a specific key, or set a key in the DB.

### `mc mc-booking serve`
Starts the Hono HTTP server on the configured port.

## Agent tools

| Tool | Required params | Optional params |
|------|----------------|-----------------|
| `booking_slots` | — | — |
| `booking_list` | — | `limit` |
| `booking_show` | `token` | — |
| `booking_cancel` | `token` | — |
| `booking_reschedule` | `token`, `new_time` | — |

## Testing

```bash
cd plugins/mc-booking
bun test
```

Tests cover:
- Config resolution (all 10 fields, defaults and overrides)
- Vault get/set roundtrip (fake vault binary)
- AppointmentStore CRUD (in-memory @libsql/client):
  - create (full fields, minimal fields, with payment ID)
  - getByToken, getById
  - listUpcoming (sorting, cancelled exclusion, limit)
  - hasConflict, countOnDate
  - cancel (with refund info, idempotency, unknown token)
  - reschedule (success, unknown token, cancelled appointment)
  - config get/set/overwrite
- Slot generation (window, future-only, conflict marking, day filter, capacity)
- Refund calculation (48h threshold, boundary, rounding)
- Tool schema structure (names, required params, naming convention)

## Config

```json
{
  "vaultBin": "~/.local/bin/mc-vault",
  "paymentProvider": "stripe",
  "port": 4221,
  "origins": ["https://miniclaw.bot", "https://augmentedmike.com"],
  "availableDays": [1, 2, 3],
  "timeSlots": [17, 18, 19],
  "durationMinutes": 90,
  "priceCents": 19900,
  "maxPerDay": 1,
  "windowWeeks": 4
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `vaultBin` | string | `~/.openclaw/miniclaw/SYSTEM/bin/miniclaw-vault` | Path to mc-vault |
| `paymentProvider` | `"stripe"` \| `"square"` \| `"none"` | `"stripe"` | Which payment plugin to use |
| `port` | number | `4221` | HTTP server port |
| `origins` | string[] | miniclaw.bot, augmentedmike.com | CORS allowed origins |
| `availableDays` | number[] | `[1, 2, 3]` | Days of week (1=Mon, 7=Sun) |
| `timeSlots` | number[] | `[17, 18, 19]` | UTC hours for slots |
| `durationMinutes` | number | `90` | Appointment duration |
| `priceCents` | number | `19900` | Price in cents ($199.00) |
| `maxPerDay` | number | `1` | Max bookings per day |
| `windowWeeks` | number | `4` | How far ahead to show slots |

## Vault secrets

| Key | Format | Example |
|-----|--------|---------|
| `turso-booking-url` | `libsql://...` | `libsql://miniclaw-booking-xxx.turso.io` |
| `turso-booking-token` | JWT string | `eyJ0eXAiOi...` |

## Deployment

1. `mc mc-booking setup` — create Turso DB, vault credentials
2. `mc mc-booking serve` — start HTTP server
3. `tailscale funnel 4221` — expose publicly via Tailscale Funnel
4. Point DNS / embed iframe to the funnel URL
