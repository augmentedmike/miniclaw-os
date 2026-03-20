# mc-web-chat

> WebSocket server for browser-based Claude Code chat — powers the board's chat panel.

## Overview

mc-web-chat runs a WebSocket server that enables browser-based chat with Claude Code.
It spawns a claude process per session, manages streaming responses, and optionally injects
workspace context from `.md` files. It powers the mc-board web UI's chat panel.

## Installation

```bash
cd ~/.openclaw/miniclaw/plugins/mc-web-chat
npm install
npm run build
```

### Prerequisites

- Claude CLI binary (default: `~/.local/bin/claude`)
- Node.js `ws` library (included in dependencies)

## CLI Usage

```bash
# Check server status
openclaw mc-web-chat status
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `status` | Check server status and active session count | `openclaw mc-web-chat status` |

## Tool API

No agent tools. mc-web-chat is a server-side plugin that handles WebSocket connections.

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `port` | `number` | `4221` | WebSocket server port |
| `claudeBin` | `string` | `~/.local/bin/claude` | Path to claude CLI binary |
| `workspaceDir` | `string` | — | Path to workspace `.md` files for context injection |

## Examples

### Example 1 — Check if the chat server is running

```bash
openclaw mc-web-chat status
# Returns: { status: "running", sessions: 2 }
```

### Example 2 — Connect from the board UI

Open the mc-board web interface and click the chat panel — it connects to `ws://localhost:4221` automatically.

## Architecture

- `index.ts` — Plugin entry point, starts WebSocket server, registers status CLI command
- `server.ts` — WebSocket server implementation (spawns claude process, manages sessions, streams responses)
- `com.miniclaw.web-chat.plist` — macOS launchd service configuration
- `run.ts` — Service runner script

### Session Lifecycle

1. Browser connects via WebSocket to port 4221
2. Server spawns a `claude` process for the session
3. Messages are piped between WebSocket and claude stdin/stdout
4. Workspace `.md` files are injected as context (if configured)
5. Session ends when WebSocket disconnects

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Port already in use | Change `port` in config or stop the conflicting process |
| Claude binary not found | Set `claudeBin` to the correct path |
| No response from chat | Check that claude CLI is working: `claude --version` |
| Context not injected | Set `workspaceDir` to the directory containing `.md` files |
