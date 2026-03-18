# mc-square — Square Payment Service

Square payment service for MiniClaw. Zero npm dependencies — raw `fetch()` to Square REST API v2.

## Quick start

```bash
mc mc-square setup            # vault your Square access token
mc mc-square locations        # verify connection + find your location ID
mc mc-square charge 19.99 usd "Consultation fee"
mc mc-square link 19.99 "Book a consultation"
```

## Setup

1. Go to https://developer.squareup.com/apps
2. Create an application (or select existing)
3. Copy your Sandbox or Production Access Token
4. Run `mc mc-square setup` and paste the token
5. Set `locationId` in your plugin config to the location you want to charge against

## CLI commands

| Command | Description |
|---------|-------------|
| `mc-square setup` | Guided token setup + verification |
| `mc-square charge <amount> <currency> <desc>` | Create payment (amount in dollars) |
| `mc-square refund <payment-id> [--amount]` | Full or partial refund |
| `mc-square status <payment-id>` | Payment details |
| `mc-square link <amount> <title>` | Create hosted checkout URL |
| `mc-square locations` | List account locations |

## Agent tools

| Tool | Description |
|------|-------------|
| `square_charge` | Create payment (amount in cents) |
| `square_refund` | Refund a payment |
| `square_status` | Payment details |
| `square_list_payments` | List recent payments |
| `square_payment_link` | Create hosted checkout URL |

## Vault keys

- `square-access-token` — personal access token from Square Developer Dashboard

## Architecture

- Zero npm dependencies — raw `fetch()` to Square REST API v2
- UUID idempotency keys per Square's API contract
- Personal access token (not OAuth) — right for solo dev use case
- Mirrors mc-stripe's interface to prove the provider pattern is agnostic
