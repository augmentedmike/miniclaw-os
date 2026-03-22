# mc-rolodex — Contact Browser for MiniClaw

**Interactive, searchable access to trusted contacts.**

mc-rolodex is an OpenClaw plugin for MiniClaw that provides fast contact management. Search by name, email, phone, domain, or tag. View full contact details. Verify identity status.

## Features

- **Fast search** — search across multiple fields (name, email, phone, domain, tag)
- **Fuzzy matching** — find contacts even with partial information
- **Identity verification** — track trust status (verified, untrusted, pending, unknown)
- **TUI browser** — interactive terminal UI for browsing results
- **JSON storage** — portable, human-readable contact data
- **CLI commands** — integrate with shell scripts and automation

## Installation

mc-rolodex is installed as an OpenClaw plugin. Ensure it is listed in your `openclaw.json` plugins section:

```json
{
  "plugins": {
    "allow": ["mc-rolodex"],
    "load": {
      "paths": ["~/.openclaw/miniclaw/plugins/mc-rolodex"]
    },
    "entries": {
      "mc-rolodex": {
        "enabled": true,
        "config": {
          "storagePath": "~/.openclaw/miniclaw/USER/rolodex/contacts.db"
        }
      }
    }
  }
}
```

## Usage

All commands run as `openclaw mc-rolodex <subcommand>`.

### Search by name

```bash
openclaw mc-rolodex search "Sarah"
```

### Search by email

```bash
openclaw mc-rolodex search "sarah@example.com" --type email
```

### Search by phone

```bash
openclaw mc-rolodex search "512" --type phone
```

### Search by domain

```bash
openclaw mc-rolodex search "example.com" --type domain
```

### List all contacts

```bash
openclaw mc-rolodex list
```

Or filter by tag:

```bash
openclaw mc-rolodex list --tag work
```

### View contact details

```bash
openclaw mc-rolodex show contact_1234
```

### Add a contact

```bash
# Via JSON string
openclaw mc-rolodex add '{"id":"contact_123","name":"Alice","emails":["alice@example.com"]}'

# Via JSON file
openclaw mc-rolodex add contacts.db
```

### Delete a contact

```bash
openclaw mc-rolodex delete contact_1234
```

### Get help

```bash
openclaw mc-rolodex --help
openclaw mc-rolodex search --help
```

## Contact Format

Contacts are stored as JSON with the following schema:

```json
{
  "id": "contact_123",
  "name": "Sarah Chen",
  "emails": ["sarah@example.com", "sarah.chen@work.com"],
  "phones": ["+1 512 555 1234"],
  "domains": ["example.com"],
  "tags": ["work", "engineering"],
  "trustStatus": "verified",
  "lastVerified": "2026-03-04T23:00:00Z",
  "notes": "CEO at Example Corp"
}
```

All fields except `id` and `name` are optional.

## Storage

Contacts are stored in:

```
~/.openclaw/miniclaw/USER/rolodex/contacts.db
```

This is a standard JSON array of contacts. You can edit it directly or use the CLI commands.

## Integration with mc-trust

mc-rolodex is designed to work with mc-trust, the identity verification system. When a contact's `trustStatus` is set to `verified`, MiniClaw treats communications with that contact as trusted.

### Trust Status Values

- **verified** — Contact identity confirmed via handshake
- **untrusted** — Contact failed verification or explicitly blocked
- **pending** — Awaiting verification handshake
- **unknown** — No verification attempt yet

## Architecture

- **src/search/types.ts** — Type definitions for contacts and search
- **src/search/engine.ts** — In-memory search with persistent JSON storage
- **src/tui/browser.ts** — Terminal UI using blessed
- **src/cli/commands.ts** — CLI interface using commander
- **index.ts** — Plugin entry point, registers CLI with OpenClaw

## Testing

```bash
bun test
```

## License

MIT. Built for MiniClaw.
