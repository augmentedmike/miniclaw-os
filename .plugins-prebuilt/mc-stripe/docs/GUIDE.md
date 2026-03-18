# mc-stripe — Stripe Payment Service

Shared Stripe payment primitive for MiniClaw plugins.

## Quick start

```bash
mc mc-stripe setup        # vault your Stripe API keys
mc mc-stripe balance      # verify connection
mc mc-stripe charge 19.99 usd "Consultation fee"
```

## Setup

1. Create a Stripe account at https://dashboard.stripe.com/register
2. Go to https://dashboard.stripe.com/apikeys
3. Run `mc mc-stripe setup` and paste your secret key and publishable key
4. Keys are stored in mc-vault (age-encrypted)

## CLI commands

| Command | Description |
|---------|-------------|
| `mc-stripe setup` | Guided key setup + verification |
| `mc-stripe charge <amount> <currency> <desc>` | Create PaymentIntent (amount in dollars) |
| `mc-stripe refund <pi_id> [--amount <dollars>]` | Full or partial refund |
| `mc-stripe status <pi_id>` | Check payment status |
| `mc-stripe customers list` | List recent customers |
| `mc-stripe customers create <email> [--name]` | Create customer |
| `mc-stripe balance` | Account balance |

## Agent tools

| Tool | Description |
|------|-------------|
| `stripe_charge` | Create PaymentIntent (amount in cents) |
| `stripe_refund` | Refund a PaymentIntent |
| `stripe_status` | Check payment status |
| `stripe_customer_create` | Create customer |
| `stripe_customer_find` | Find customer by email |

CLI uses dollars for human convenience. Agent tools use cents to avoid float ambiguity.

## Vault keys

- `stripe-secret-key` — sk_test_... or sk_live_...
- `stripe-publishable-key` — pk_test_... or pk_live_...

## Architecture

- No local database — Stripe IS the datastore
- Lazy singleton client (initialized on first use)
- Other plugins consume via CLI (`mc mc-stripe charge ...`) or direct import (`getStripeClient()`)
- `testMode` config flag prevents accidentally vaulting production keys during development
