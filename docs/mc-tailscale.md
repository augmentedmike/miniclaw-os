# mc-tailscale

> Tailscale management — diagnostics, status, hardening, Serve/Funnel wrappers, and custom domain setup.

## Overview

mc-tailscale manages the Tailscale VPN mesh network from the agent runtime. It provides diagnostics
to detect common issues (daemon state, socket connectivity, zombie processes), status monitoring,
and a hardening wizard to apply security best practices. It detects Homebrew installs that don't
support Funnel.

## Installation

```bash
cd ~/.openclaw/miniclaw/plugins/mc-tailscale
npm install
npm run build
```

### Prerequisites

- Tailscale installed (Homebrew, App Store, or standalone)
- Valid tailscaled state directory with daemon socket
- Tailscale API token in mc-vault: `openclaw mc-vault set tailscale-api-token <token>`

## CLI Usage

```bash
# Diagnose Tailscale issues
openclaw mc-tailscale doctor

# Show current Tailscale state
openclaw mc-tailscale status

# Apply hardening settings
openclaw mc-tailscale harden
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `doctor` | Diagnose binary, daemon, socket, zombie processes, connection state | `openclaw mc-tailscale doctor` |
| `status` | Show connection status, hostname, IPs, peers, serve/funnel config, key expiry | `openclaw mc-tailscale status` |
| `harden` | Apply shields-up, disable route acceptance, auto-updates, SSH | `openclaw mc-tailscale harden` |

## Tool API

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `tailscale_doctor` | Diagnose Tailscale issues | — | — |
| `tailscale_status` | Show current Tailscale state | — | — |
| `tailscale_harden` | Apply hardening settings | — | `dry_run` (boolean) |

### Example tool call (agent perspective)

```
Use the tailscale_doctor tool to check if Tailscale is configured correctly.
```

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `tailscaleBin` | `string` | `/opt/homebrew/bin/tailscale` | Path to tailscale CLI binary |
| `tailnetName` | `string` | `(auto)` | Name of the tailnet (e.g. example.ts.net) |
| `apiTokenVaultKey` | `string` | `tailscale-api-token` | mc-vault key for API OAuth token |
| `stateDir` | `string` | `~/.openclaw/.tailscale/` | Directory for tailscaled state files |

## Examples

### Example 1 — Full diagnostic check

```bash
openclaw mc-tailscale doctor
# Checks: binary exists, install method, version, state dir, socket, zombies, connection
```

### Example 2 — Harden a new installation

```bash
openclaw mc-tailscale harden
# Applies: shields-up, disable route acceptance, enable auto-updates, configure SSH
```

## Architecture

- `index.ts` — Plugin entry point with config resolution
- `cli/commands.ts` — Doctor command with detailed checks
- `tools/definitions.ts` — 3 agent tools (doctor, status, harden)

### Install Detection

The doctor command detects Homebrew installs (which don't support Funnel) and warns accordingly.
It communicates with tailscaled via socket-based IPC.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "tailscale binary not found" | Set `tailscaleBin` to the correct path or install via `brew install tailscale` |
| Socket connection failed | Ensure tailscaled daemon is running: `sudo tailscaled` |
| Funnel not working | Homebrew installs don't support Funnel — use the standalone or App Store version |
| Key expired | Run `tailscale up --reset` to re-authenticate |
