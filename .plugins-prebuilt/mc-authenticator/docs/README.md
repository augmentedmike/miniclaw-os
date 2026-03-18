# mc-authenticator

TOTP 2FA code generation — Google Authenticator compatible. Gives the agent autonomous 2FA capability.

## What it does

Stores TOTP secrets in mc-vault and generates RFC 6238-compliant 6-digit codes on demand. When a login flow asks for a 2FA code, the agent calls `auth_code` instead of waiting for a human to open an authenticator app.

Zero npm dependencies. TOTP is HMAC-SHA1 over a time counter, implemented with Node's built-in `crypto`.

## CLI

```bash
# Store a raw base32 secret
mc mc-auth add github JBSWY3DPEHPK3PXP --issuer GitHub --account user@example.com

# Store from otpauth:// URI (from QR code)
mc mc-auth add-uri github "otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub"

# Get current code
mc mc-auth code github
# 482901 (expires in 14s)

# Verify a code (allows ±1 window for clock drift)
mc mc-auth verify github 482901
# Valid ✓

# List all services
mc mc-auth list
#   github       — GitHub (user@example.com)   SHA1/6/30s

# Remove a service
mc mc-auth remove github
```

## Agent tools

| Tool | Params | Description |
|------|--------|-------------|
| `auth_code` | `service` (required) | Returns current TOTP code + seconds remaining |
| `auth_list` | — | List all stored TOTP services |
| `auth_time_remaining` | `service` (required) | Seconds until current code expires |

## Vault storage

Secrets stored as `totp-<name>` in mc-vault. Value is a JSON blob preserving all metadata from the original `otpauth://` URI:

```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "issuer": "GitHub",
  "account": "user@example.com",
  "algorithm": "sha1",
  "digits": 6,
  "period": 30
}
```

## Supported providers

Any TOTP-compatible service works. Common ones:

- Google (SHA1/6/30s)
- GitHub (SHA1/6/30s)
- AWS (SHA1/6/30s)
- Microsoft (SHA1/6/30s)
- Cloudflare (SHA1/6/30s)
- 1Password (SHA1/6/30s)

SHA256/SHA512, 8-digit codes, and 60s periods are also supported for providers that use non-standard settings.
