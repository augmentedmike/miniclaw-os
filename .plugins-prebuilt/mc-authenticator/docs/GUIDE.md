# mc-authenticator Setup Guide

## Prerequisites

- mc-vault must be installed and accessible
- A TOTP secret from the service you want to authenticate with

## Getting a TOTP secret

When you enable 2FA on a service, you'll typically see a QR code. Most services also offer a "Can't scan?" link that reveals the raw secret (a base32 string like `JBSWY3DPEHPK3PXP`).

Some services provide an `otpauth://` URI — use `add-uri` for those to preserve all metadata automatically.

## Adding a service

### From a raw secret

```bash
mc mc-auth add github JBSWY3DPEHPK3PXP
```

Add metadata for clarity:

```bash
mc mc-auth add github JBSWY3DPEHPK3PXP --issuer GitHub --account user@example.com
```

### From an otpauth:// URI

```bash
mc mc-auth add-uri github "otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub"
```

This automatically extracts issuer, account, algorithm, digits, and period.

## Generating codes

```bash
mc mc-auth code github
# 482901 (expires in 14s)
```

The agent uses the `auth_code` tool to get codes during login flows.

## Verifying a code

```bash
mc mc-auth verify github 482901
# Valid ✓
```

Verification allows ±1 time window (clock drift tolerance), matching standard authenticator behavior.

## Testing your setup

After adding a secret, verify it generates the same codes as your existing authenticator app. Both should show the same 6-digit code at the same time.

## Security notes

- TOTP secrets are stored encrypted in mc-vault (age encryption)
- Secrets never appear in logs or command history (vault handles encryption)
- The `list` command shows service names and metadata but never the raw secret
- Remove secrets with `mc mc-auth remove <name>` when no longer needed
