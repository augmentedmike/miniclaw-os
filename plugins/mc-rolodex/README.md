# mc-rolodex — Contact Browser for MiniClaw

**Interactive, searchable access to trusted contacts.**

mc-rolodex is a plugin for MiniClaw that provides fast, terminal-based contact management. Search by name, email, phone, domain, or tag. View full contact details. Verify identity status.

## Features

- **Fast search** — search across multiple fields (name, email, phone, domain, tag)
- **Fuzzy matching** — find contacts even with partial information
- **Identity verification** — track trust status (verified, untrusted, pending, unknown)
- **TUI browser** — interactive terminal UI for browsing results
- **JSON storage** — portable, human-readable contact data
- **CLI commands** — integrate with shell scripts and automation

## Installation

```bash
# Install dependencies
npm install

# Build plugin
npm run build

# Install globally
npm link
```

## Usage

### Search by name

```bash
mc-rolodex search "Sarah"
```

### Search by email

```bash
mc-rolodex search "sarah@example.com" --type email
```

### Search by phone

```bash
mc-rolodex search "512" --type phone
```

### Search by domain

```bash
mc-rolodex search "example.com" --type domain
```

### Interactive browser

```bash
mc-rolodex browse
```

Navigate with arrow keys, press Enter to view details, press 'q' to quit.

### List all contacts

```bash
mc-rolodex list
```

Or filter by tag:

```bash
mc-rolodex list --tag work
```

### View contact details

```bash
mc-rolodex show contact_1234
```

### Add a contact

```bash
# Via JSON string
mc-rolodex add '{"id":"contact_123","name":"Alice","emails":["alice@example.com"]}'

# Via JSON file
mc-rolodex add contacts.json
```

### Delete a contact

```bash
mc-rolodex delete contact_1234
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
~/.miniclaw/rolodex/contacts.json
```

This is a standard JSON array of contacts. You can edit it directly or use the CLI commands.

## Integration with mc-trust

mc-rolodex is designed to work with mc-trust, the identity verification system. When a contact's `trustStatus` is set to `verified`, MiniClaw treats communications with that contact as trusted.

### Trust Status Values

- **verified** — Contact identity confirmed via handshake
- **untrusted** — Contact failed verification or explicitly blocked
- **pending** — Awaiting verification handshake
- **unknown** — No verification attempt yet

### Future: Quick-Actions

The interactive browser (mc-rolodex browse) will support quick-actions for verified contacts:

```
┌─ Sarah Chen ────────────────────────────────┐
│ Email: sarah@example.com                    │
│ Phone: +1 512 555 1234                      │
│ Trust: ✓ verified                           │
│                                              │
│ [Call] [Email] [Message] [Mark Untrusted]  │
│ [Copy Email] [Copy Phone] [Edit] [Delete]  │
└──────────────────────────────────────────────┘
```

## Setup Guide

### Quick Start

1. **Initialize** the contact store:
   ```bash
   mkdir -p ~/.miniclaw/rolodex
   echo '[]' > ~/.miniclaw/rolodex/contacts.json
   ```

2. **Import your contacts** from CSV or JSON:
   ```bash
   # Add a contact
   mc-rolodex add '{"id":"1","name":"Michael","emails":["mike@example.com"]}'
   ```

3. **Search** for a contact:
   ```bash
   mc-rolodex search "michael"
   ```

4. **Browse** interactively:
   ```bash
   mc-rolodex browse
   ```

## Architecture

- **search/types.ts** — Type definitions for contacts and search
- **search/engine.ts** — In-memory search with persistent JSON storage
- **tui/browser.ts** — Terminal UI using blessed
- **cli/index.ts** — CLI interface using commander

## Testing

```bash
npm test
```

## License

MIT. Built for MiniClaw.
