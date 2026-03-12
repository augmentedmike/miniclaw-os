# mc-booking — Appointment Scheduling

Cloud-based appointment scheduling with payment integration and embeddable widget.

## What it does

- Manages bookable time slots with configurable availability (days, hours, duration, price)
- Integrates with Stripe or Square for payment processing via subprocess bridge pattern
- Stores appointments in cloud SQLite (Turso) for uptime
- Refund logic: >48h = 100% refund, <48h = 50% refund
- Serves an embeddable booking widget and REST API (Hono-based, 14KB)

## CLI

```bash
mc mc-booking setup                    # Create Turso DB and vault credentials
mc mc-booking slots                    # List available slots
mc mc-booking list [-n <limit>]        # Upcoming appointments
mc mc-booking show <token>             # Full appointment details by manage token
mc mc-booking cancel <token>           # Cancel with automatic refund
mc mc-booking config [key] [value]     # View/set availability config
mc mc-booking serve                    # Start HTTP server on port 4221
```

## Agent Tools

| Tool | Purpose |
|------|---------|
| `booking_slots` | List available time slots |
| `booking_list` | Upcoming appointments |
| `booking_show` | Appointment details by manage token |
| `booking_cancel` | Cancel with automatic refund |
| `booking_reschedule` | Reschedule (requires 48h notice) |
