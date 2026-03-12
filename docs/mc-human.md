# mc-human — Ask-a-Human via noVNC

mc-human pauses agent execution and hands control to a human operator via an interactive noVNC browser session. It delivers a one-time URL through Telegram or email, then blocks until the human signals completion or the session times out.

---

## Overview

When the agent encounters a captcha, login flow, or any UI interaction it cannot automate, it invokes mc-human to request human intervention. The plugin:

1. Verifies macOS VNC (Screen Sharing) is available
2. Starts a local HTTP server with a WebSocket-to-VNC proxy
3. Generates a one-time session URL with a secure token
4. Delivers the URL via Telegram and/or email
5. Blocks until the human clicks "Done -- Resume AM" or timeout elapses

The noVNC viewer runs entirely in the browser. The VNC password is read from the vault if available.

---

## CLI Commands

All commands use `openclaw mc-human <subcommand>`.

### `ask <reason>`
Block until the human closes the noVNC session or timeout elapses.

```
openclaw mc-human ask <reason> [options]

Options:
  --via <method>        Delivery method: tg|email|both|none (default: tg)
  --timeout <seconds>   Session timeout (default: 300)
  --vnc-host <host>     VNC server host (default: 127.0.0.1)
  --vnc-port <port>     VNC server port (default: 5900)
  --proxy-port <port>   Local HTTP proxy port (default: 4221, auto if busy)

Examples:
  openclaw mc-human ask "solve CAPTCHA on login page"
  openclaw mc-human ask "complete 2FA on Gmail" --timeout 600 --via both
  openclaw mc-human ask "manual browser action needed" --via none
```

### `status`
Check if VNC is reachable.

```
openclaw mc-human status [--vnc-host <host>] [--vnc-port <port>]
```

---

## Agent Tools

| Tool | Description |
|------|-------------|
| `ask_human` | Pause execution and hand control to the human via noVNC. Parameters: `reason` (required), `timeout_seconds` (default: 300), `via` (tg/email/both/none, default: tg). Blocks until human signals done or timeout. Returns "done" on success. |

The agent tool creates sessions via the board web server (`localhost:4220`) and polls for completion, rather than spawning its own HTTP server.

---

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `tgBotToken` | string | (from global Telegram config) | Telegram bot token for delivering URLs |
| `tgChatId` | string/number | (from global Telegram config) | Telegram chat ID for the human operator |
| `vncHost` | string | `127.0.0.1` | macOS VNC server host |
| `vncPort` | number | `5900` | macOS VNC server port |
| `proxyPort` | number | `4221` | Local HTTP proxy port (falls back to random if busy) |
| `defaultTimeout` | number | `300` | Default session timeout in seconds |

Telegram config falls back to the global `channels.telegram` config in `openclaw.json` if not set at the plugin level.

---

## Session Security

- Session tokens are 24-byte base64url random strings
- Tokens expire on first use or when the timeout elapses
- The VNC password (if set) is read from the vault key `vnc-password`
- The session URL includes the LAN IP so it works from other devices on the same network

---

## Requirements

- **macOS Screen Sharing** must be enabled: System Settings > General > Sharing > Screen Sharing
- For Telegram delivery: a Telegram bot token and chat ID must be configured
- For email delivery: the `send-alert` binary must be available at `$HOME/.openclaw/miniclaw/system/bin/send-alert`
