# mc-vpn

> VPN management — Mullvad CLI support with country switching, connection management, and diagnostics.

## Overview

mc-vpn wraps the Mullvad VPN CLI to provide connection management, country switching, and
diagnostics as both CLI commands and agent tools. The agent can connect, disconnect, switch
relay locations, and diagnose issues without leaving the runtime.

## Installation

```bash
cd ~/.openclaw/miniclaw/plugins/mc-vpn
npm install
npm run build
```

### Prerequisites

- Mullvad CLI binary (`/usr/local/bin/mullvad`, `/opt/homebrew/bin/mullvad`, or `/opt/local/bin/mullvad`)
- Mullvad daemon running
- Valid Mullvad account

## CLI Usage

```bash
# Show current VPN state
openclaw mc-vpn status

# Connect to VPN
openclaw mc-vpn connect [--country CODE]

# Disconnect
openclaw mc-vpn disconnect

# List available relay countries
openclaw mc-vpn countries

# Diagnose Mullvad issues
openclaw mc-vpn doctor
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `status` | Show connection state, relay location, IP | `openclaw mc-vpn status` |
| `connect` | Connect to VPN | `openclaw mc-vpn connect --country de` |
| `disconnect` | Disconnect from VPN | `openclaw mc-vpn disconnect` |
| `countries` | List available relay countries | `openclaw mc-vpn countries` |
| `doctor` | Diagnose binary, daemon, account status | `openclaw mc-vpn doctor` |

## Tool API

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `vpn_status` | Get connection state, relay location, country, IP | — | — |
| `vpn_connect` | Connect to Mullvad VPN | — | `country` (country code) |
| `vpn_disconnect` | Disconnect from Mullvad VPN | — | — |
| `vpn_switch_country` | Switch relay location and reconnect | `country` (country code) | — |

### Example tool call (agent perspective)

```
Use the vpn_connect tool to connect through a German relay.
```

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `mullvadBin` | `string` | `(auto-detect)` | Path to the mullvad CLI binary |
| `stateDir` | `string` | `~/.openclaw/.vpn/` | Directory for VPN state files and logs |
| `defaultCountry` | `string` | — | Default country code for VPN relay |

## Examples

### Example 1 — Connect through a specific country

```bash
openclaw mc-vpn connect --country us
openclaw mc-vpn status
```

### Example 2 — Diagnose connection issues

```bash
openclaw mc-vpn doctor
# Checks: binary exists, daemon running, account valid
```

## Architecture

- `index.ts` — Plugin entry point, config resolution, registers CLI and tools
- `cli/commands.ts` — CLI command registrations (status, connect, disconnect, countries, doctor)
- `tools/definitions.ts` — Agent tool definitions (vpn_status, vpn_connect, vpn_disconnect, vpn_switch_country)

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "mullvad: command not found" | Install Mullvad or set `mullvadBin` to the correct path |
| Daemon not running | Start the daemon: `sudo mullvad-daemon` |
| Connection fails | Run `openclaw mc-vpn doctor` to diagnose |
| Country code unknown | Run `openclaw mc-vpn countries` to list available codes |
