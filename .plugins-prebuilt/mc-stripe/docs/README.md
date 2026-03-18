# mc-stripe — Payment Processing

mc-stripe is MiniClaw's shared Stripe payment service. It exists so any plugin that needs to charge, refund, or manage customers can do so through a single interface — no duplicate Stripe integrations.

## What changes

**Without mc-stripe:** each project that needs payments has its own Stripe integration, its own key management, and its own error handling. When you move a booking system between sites, you duplicate payment code.

**With mc-stripe:** payments are a shared primitive. mc-booking, mc-invoicing, or any future plugin shells out to `mc mc-stripe charge` or imports `getStripeClient()` directly. One set of keys, one integration, one place to fix bugs.

## Architecture

```
mc-stripe/
├── index.ts                 # Plugin registration + re-export getStripeClient()
├── src/
│   ├── config.ts            # StripeConfig interface, resolveConfig()
│   ├── vault.ts             # mc-vault get/set for stripe keys
│   ├── client.ts            # Lazy Stripe SDK singleton
│   └── types.ts             # ChargeResult, RefundResult, CustomerResult
├── cli/
│   └── commands.ts          # 6 CLI commands (setup, charge, refund, status, customers, balance)
├── tools/
│   └── definitions.ts       # 5 agent tools (in-process, no subprocess)
└── docs/
    ├── README.md            # This file
    └── GUIDE.md             # Quick reference
```

### Design decisions

1. **No local DB.** Stripe IS the datastore. Every call goes to the Stripe API. No sync issues, no stale cache.

2. **Lazy singleton client.** The Stripe SDK is initialized on first use, not at plugin load. If keys aren't vaulted, the plugin still loads (CLI still works for `setup`).

3. **CLI uses dollars, tools use cents.** Humans think in dollars ($19.99). Machines need cents (1999) to avoid float ambiguity. The boundary is explicit.

4. **testMode config flag.** When `testMode: true`, the setup wizard rejects `sk_live_` keys. Prevents accidentally using production credentials during development.

5. **Two consumption patterns:**
   - **CLI:** Other plugins shell out to `mc mc-stripe charge 19.99 usd "..."` (UNIX pipe philosophy)
   - **Direct import:** `import { getStripeClient } from "mc-stripe"` for lower-latency in-process calls

## Vault secrets

| Key | Format | Example |
|-----|--------|---------|
| `stripe-secret-key` | `sk_test_...` or `sk_live_...` | `sk_test_51abc...` |
| `stripe-publishable-key` | `pk_test_...` or `pk_live_...` | `pk_test_51abc...` |

Both are stored via `mc-vault set` (age-encrypted at rest).

## CLI reference

### `mc mc-stripe setup`
Interactive walkthrough. Prompts for secret key and publishable key, vaults them, verifies with `balance.retrieve()`.

### `mc mc-stripe charge <amount> <currency> <description>`
Creates a Stripe PaymentIntent. Amount is in dollars (e.g., `19.99`). Internally converts to cents.

Options:
- `--customer <id>` — attach to a Stripe customer
- `--payment-method <id>` — attach a payment method and auto-confirm

### `mc mc-stripe refund <payment-intent-id>`
Full or partial refund.

Options:
- `--amount <dollars>` — partial refund amount
- `--reason <reason>` — `duplicate`, `fraudulent`, or `requested_by_customer`

### `mc mc-stripe status <payment-intent-id>`
Shows amount, status, description, creation date, and charge ID.

### `mc mc-stripe customers list|create`
- `list` — show recent customers (default 10, configurable with `-n`)
- `create <email> [--name <name>]` — create a new customer

### `mc mc-stripe balance`
Shows available and pending balances by currency.

## Agent tools

All tools operate in-process (no subprocess). Amount parameters use **cents**.

| Tool | Required params | Optional params |
|------|----------------|-----------------|
| `stripe_charge` | `amount_cents`, `currency`, `description` | `payment_method_id`, `customer_id` |
| `stripe_refund` | `payment_intent_id` | `amount_cents`, `reason` |
| `stripe_status` | `payment_intent_id` | — |
| `stripe_customer_create` | `email` | `name` |
| `stripe_customer_find` | `email` | — |

## Testing

```bash
cd plugins/mc-stripe
bun test
```

Tests cover:
- Config resolution (defaults, overrides)
- Vault get/set roundtrip (with fake vault binary)
- Type shape validation
- Tool schema structure (names, required params, additionalProperties)
- Tool naming convention (`stripe_*` prefix)

## Config

```json
{
  "vaultBin": "~/.local/bin/mc-vault",
  "testMode": false
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `vaultBin` | string | `~/.openclaw/miniclaw/SYSTEM/bin/miniclaw-vault` | Path to mc-vault binary |
| `testMode` | boolean | `false` | When true, only accepts `sk_test_` keys during setup |
