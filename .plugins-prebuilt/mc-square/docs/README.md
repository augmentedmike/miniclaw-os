# mc-square — Square Payment Processing

mc-square is MiniClaw's Square payment service. It mirrors mc-stripe's interface to prove the payment provider pattern is agnostic — switching from Stripe to Square is a config change, not a code change.

## What changes

**Without mc-square:** you're locked to one payment provider. If Square's fee structure is better for your use case (2.6% + $0.10 per txn, zero monthly fees), you can't switch without rewriting payment code everywhere.

**With mc-square:** mc-booking and other plugins set `paymentProvider: "square"` in config and everything works. Same CLI interface, same tool interface, different provider.

## Why Square

- **Zero monthly fees** — 2.6% + $0.10 per transaction
- **Clean REST API** — no SDK needed, raw `fetch()` keeps the dependency count at zero
- **Payment links** — hosted checkout URLs, great for CLI/agent use where you can't render a card form
- **Simple auth** — personal access token, no OAuth dance
- **Sandbox mode** — full test environment with test credentials

## Architecture

```
mc-square/
├── index.ts                 # Plugin registration + re-export SquareClient
├── src/
│   ├── config.ts            # SquareConfig (environment, locationId, currency)
│   ├── vault.ts             # mc-vault get/set for square-access-token
│   └── client.ts            # SquareClient class — raw fetch to REST API v2
├── cli/
│   └── commands.ts          # 6 CLI commands (setup, charge, refund, status, link, locations)
├── tools/
│   └── definitions.ts       # 5 agent tools
└── docs/
    ├── README.md            # This file
    └── GUIDE.md             # Quick reference
```

### Design decisions

1. **Zero npm dependencies.** The Square client is raw `fetch()` to the Square Connect REST API v2. No SDK, no transitive deps. Follows the mc-email pattern of raw protocol access.

2. **UUID idempotency keys.** Every mutating request includes a UUID idempotency key per Square's API contract. Retries are safe.

3. **Personal access token, not OAuth.** For a solo dev use case, OAuth is unnecessary complexity. PAT is one string, vault it, done.

4. **Sandbox/production URL switching.** The `environment` config controls whether requests go to `squareupsandbox.com` or `connect.squareup.com`.

5. **Payment links.** Square's hosted checkout URLs are unique to this provider. `mc mc-square link 19.99 "Consultation"` returns a URL customers can pay at without any frontend integration.

## Vault secrets

| Key | Format | Example |
|-----|--------|---------|
| `square-access-token` | String | `EAAAl...` (sandbox) or `EAAA...` (production) |

## CLI reference

### `mc mc-square setup`
Prompts for access token, vaults it, verifies by listing locations.

### `mc mc-square charge <amount> <currency> <description>`
Creates a Square payment. Amount in dollars.

Options:
- `--customer <id>` — Square customer ID

### `mc mc-square refund <payment-id>`
Full or partial refund.

Options:
- `--amount <dollars>` — partial refund amount
- `--reason <reason>` — refund reason text

### `mc mc-square status <payment-id>`
Shows payment details: amount, status, note, creation date, receipt URL.

### `mc mc-square link <amount> <title>`
Creates a hosted checkout URL (payment link). Returns a URL customers can visit to pay.

Options:
- `--description <desc>` — link description

### `mc mc-square locations`
Lists all Square locations for the account. Location IDs are needed for charges.

## Agent tools

| Tool | Required params | Optional params |
|------|----------------|-----------------|
| `square_charge` | `amount_cents` | `currency`, `note`, `customer_id` |
| `square_refund` | `payment_id` | `amount_cents`, `reason` |
| `square_status` | `payment_id` | — |
| `square_list_payments` | — | `limit` |
| `square_payment_link` | `amount_cents`, `title` | `description` |

## Testing

```bash
cd plugins/mc-square
bun test
```

Tests cover:
- Config resolution (defaults, overrides, all 4 fields)
- Vault get/set roundtrip (fake vault binary)
- SquareClient with mocked fetch (listLocations, createPayment, getPayment, refundPayment, createPaymentLink, listPayments)
- Sandbox vs production URL routing
- API error handling
- Tool schema structure (names, required params, naming convention)

## Config

```json
{
  "vaultBin": "~/.local/bin/mc-vault",
  "environment": "sandbox",
  "locationId": "",
  "currency": "USD"
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `vaultBin` | string | `~/.openclaw/miniclaw/SYSTEM/bin/miniclaw-vault` | Path to mc-vault binary |
| `environment` | `"sandbox"` \| `"production"` | `"sandbox"` | Square API environment |
| `locationId` | string | `""` | Square location ID for charges |
| `currency` | string | `"USD"` | Default currency code |

## Square API version

The client sends `Square-Version: 2025-01-23` in all requests.
