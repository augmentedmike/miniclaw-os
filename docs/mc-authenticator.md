# mc-authenticator — TOTP 2FA for Agents

Autonomous two-factor authentication. Stores TOTP secrets in mc-vault and generates RFC 6238-compliant codes on demand — the same codes Google Authenticator would produce. Zero npm dependencies.

## What it does

- Stores TOTP secrets (base32 or `otpauth://` URIs from QR codes)
- Generates 6-digit codes identical to Google Authenticator
- Supports SHA1, SHA256, SHA512 — configurable digits (6/8) and period (30s/60s)
- Clock drift tolerance (verifies current code ±1 window)

## CLI

```bash
mc mc-auth add <name> <base32-secret> [--issuer] [--account]   # Store a TOTP secret
mc mc-auth add-uri <name> "otpauth://..."                      # Store from otpauth:// URI
mc mc-auth code <name>                                         # Get current code
mc mc-auth verify <name> <code>                                # Verify a code
mc mc-auth list                                                # List all stored services
mc mc-auth remove <name>                                       # Remove a service
```

## Agent Tools

| Tool | Purpose |
|------|---------|
| `auth_code` | Get current TOTP code + seconds until expiry |
| `auth_list` | List all stored 2FA services |
| `auth_time_remaining` | Seconds until current code expires |
