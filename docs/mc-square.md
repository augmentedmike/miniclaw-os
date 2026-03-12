# mc-square — Square Payment Processing

Square payment service — charge, refund, payment links. Zero dependencies, raw fetch.

## What it does

- Processes payments via Square REST API v2 without SDK dependencies (raw `fetch()`)
- Creates charges, refunds (full or partial), and payment links (hosted checkout URLs)
- UUID idempotency keys for safe retries per Square's API contract
- Supports sandbox/production environment switching via config

## CLI

```bash
mc mc-square setup                                            # Guided access token setup
mc mc-square charge <amount> <currency> <description>         # Create payment (dollars)
mc mc-square refund <payment-id> [--amount <dollars>] [--reason]  # Full or partial refund
mc mc-square status <payment-id>                              # Payment details
mc mc-square link <amount> <title> [--description]            # Create hosted checkout URL
mc mc-square locations                                        # List account locations
```

## Agent Tools

| Tool | Purpose |
|------|---------|
| `square_charge` | Create payment (amount in cents) |
| `square_refund` | Full or partial refund |
| `square_status` | Payment details |
| `square_list_payments` | List recent payments |
| `square_payment_link` | Create hosted checkout URL |
