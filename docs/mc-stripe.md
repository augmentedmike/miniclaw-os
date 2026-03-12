# mc-stripe — Stripe Payment Processing

Stripe payment service — PaymentIntents, refunds, customer management.

## What it does

- Processes payments via Stripe SDK with lazy singleton initialization
- Creates PaymentIntents, refunds (full/partial), and manages customers
- No local database — Stripe IS the datastore
- CLI uses dollars for humans; agent tools use cents to avoid float ambiguity
- `testMode` config flag prevents accidentally vaulting production keys

## CLI

```bash
mc mc-stripe setup                                                 # Interactive key setup
mc mc-stripe charge <amount> <currency> <description>              # Create PaymentIntent (dollars)
mc mc-stripe refund <payment-intent-id> [--amount] [--reason]      # Full or partial refund
mc mc-stripe status <payment-intent-id>                            # Payment details
mc mc-stripe customers list [-n <limit>]                           # List customers
mc mc-stripe customers create <email> [--name]                     # Create customer
mc mc-stripe balance                                               # Account balance
```

## Agent Tools

| Tool | Purpose |
|------|---------|
| `stripe_charge` | Create PaymentIntent (amount in cents) |
| `stripe_refund` | Refund a payment |
| `stripe_status` | Check payment status |
| `stripe_customer_create` | Create customer |
| `stripe_customer_find` | Find customer by email |
