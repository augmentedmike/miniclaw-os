# mc-email — Email Integration

mc-email provides email access via IMAP/SMTP for reading, sending, replying, archiving, and triaging email messages. Supports Gmail and non-Gmail providers (Outlook, Fastmail, custom domains). Authentication uses an app password stored in the MiniClaw vault.

---

## Overview

The plugin connects to an email account using IMAP (for reading) and SMTP (for sending) via `imapflow` and `nodemailer`. Credentials are stored securely in the vault under the `email-app-password` key (legacy `gmail-app-password` is also supported for backward compatibility). The triage command delegates to an external Python script for autonomous email classification and response.

---

## CLI Commands

All commands use `openclaw mc-email <subcommand>`.

### `auth`
Verify or store the Gmail app password in the vault.

```
openclaw mc-email auth
```

If no password is stored, prompts interactively for a 16-character app password from Google Account settings.

### `check`
List unread inbox messages.

```
openclaw mc-email check [options]

Options:
  -n, --limit <n>     Max messages to show (default: 20)
  -q, --query <q>     Gmail search query (default: "in:inbox is:unread")

Example:
  openclaw mc-email check --limit 5
```

### `read <id>`
Read a single message by UID.

```
openclaw mc-email read 12345
```

Shows UID, from, to, date, subject, flags, and snippet.

### `archive <id>`
Archive a message (move from INBOX to All Mail).

```
openclaw mc-email archive 12345
```

### `send`
Send an email.

```
openclaw mc-email send --to user@example.com --subject "Hello" --body "Message text"

Required:
  -t, --to <address>      Recipient
  -s, --subject <text>    Subject
  -b, --body <text>       Body text
```

### `reply <id>`
Reply to a message by UID.

```
openclaw mc-email reply 12345 --body "Thanks for your message"

Required:
  -b, --body <text>    Reply body text
```

### `triage`
Autonomous triage: classify, reply, and archive unread inbox messages.

```
openclaw mc-email triage [options]

Options:
  --dry-run        Classify but do not send replies or archive
  -n, --limit <n>  Max unread messages to process (default: 20)
  --test-set       Run classification test suite only (no inbox access)
```

Delegates to `~/.openclaw/cron/scripts/email-triage.py`.

---

## Agent Tools

mc-email does not currently register agent tools. All operations are CLI-only.

---

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `vaultBin` | string | `$HOME/.openclaw/miniclaw/system/bin/miniclaw-vault` | Path to the vault binary |
| `emailAddress` | string | `owner@example.com` | Gmail address for IMAP/SMTP auth |

---

## Authentication

### Gmail
1. Enable 2-factor authentication on the Google account
2. Generate a 16-character app password at https://myaccount.google.com/apppasswords
3. Run `openclaw mc-email auth` and paste the password
4. The password is stored in the vault under `email-app-password`

Gmail defaults: IMAP `imap.gmail.com:993` (TLS), SMTP `smtp.gmail.com:465` (TLS).

### Non-Gmail (Outlook, Fastmail, custom domains)
1. Generate an app password from your provider's settings
2. During setup, provide the SMTP host and port
3. IMAP/SMTP hosts are stored in `setup-state.json` and read automatically by the triage script

The vault key `email-app-password` is canonical. The legacy `gmail-app-password` key is still read as a fallback for existing installs.
