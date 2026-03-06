# mc-queue — Async Message Routing and Triage

mc-queue is the basal ganglia of Mini Claw. Every message that arrives from Telegram, Discord, Slack, or any other messaging channel passes through it before reaching the agent. Its job: classify the message, route it appropriately, and enforce that the agent never does long-running work inline during a conversation turn.

---

## Architecture Overview

```
Incoming message (TG DM / group / Slack / Discord)
        │
        ▼
[before_model_resolve]     → Switch session to Haiku (fast, cheap)
        │
        ▼
[before_prompt_build]      → Inject triage instructions into system prompt
        │
        ▼
        Agent (Haiku) classifies and responds
        │
        ├── IMMEDIATE  → answers directly, no tools
        ├── QUICK      → one tool call, answers from result
        └── TASK       → creates board card, acks, stops
                │
                ▼
        [before_tool_call]  → Enforce max tool call limit per turn
        │
        ▼
Cron worker picks up card, executes multi-step work
        │
        ▼
[after_tool_call]          → Log ship/blocked events to TG log channel
```

**Key principle:** the agent responding to a Telegram message is Haiku running in triage mode. It is fast and cheap. Heavy work never executes here — it gets queued to a board card that cron workers process asynchronously.

---

## Channel Types

mc-queue identifies session types from the OpenClaw session key format: `agent:<agent>:<channel>:<subtype>:<id>`.

### Messaging sessions (triage applies)

| Pattern in session key | Description |
|------------------------|-------------|
| `:telegram:`           | Telegram (DMs and groups) |
| `:discord:`            | Discord |
| `:slack:`              | Slack |
| `:whatsapp:`           | WhatsApp |
| `:signal:`             | Signal |
| `:imessage:`           | iMessage |

Within Telegram, two subtypes exist:
- `:direct:` — one-to-one DM with the human
- `:group:` or `:channel:` — group chat / channel

Both DMs and group/channel sessions are controlled independently via config (`applyToDMs`, `applyToChannels`).

### Non-messaging sessions (triage does NOT apply)

| Pattern | Description |
|---------|-------------|
| `:cron:` | Cron-triggered workers — these do the real work |
| `:main` | The primary interactive agent session |
| `:heartbeat:` | Periodic heartbeat sessions |

Cron sessions are excluded from triage (the tool call limit, Haiku override, and prompt injection do not apply) but are monitored for board events to log to the TG log channel.

### Log channel session

A special Telegram channel (`tgLogChatId` in config) receives board event notifications. If an incoming message hits a session whose key includes the log chat ID, the agent responds with a redirect message and nothing else — it is a read-only view.

---

## Triage-to-Board-Card Flow

When a message arrives in a messaging session, mc-queue injects the following classification scheme into the agent's system prompt:

### IMMEDIATE
**Trigger:** The question is answerable from conversation history or general knowledge. No tool calls needed.

**Agent behavior:** Answers directly. No preamble, no tool use.

### QUICK LOOKUP
**Trigger:** The question needs a memory lookup, KB search, or a single-tool check.

**Agent behavior:**
1. Says something natural ("Let me check..." / "One sec...")
2. Makes exactly ONE tool call
3. Replies with the result

The `before_tool_call` hook limits tool calls to `maxToolCallsPerTurn` (default: 3). A QUICK session stays well under this.

### TASK
**Trigger:** The request involves research, building, writing, deploying, or anything multi-step.

**Agent behavior:**
1. Calls `brain_create_card` with a HIGH priority card containing full task context
2. Acknowledges naturally ("Ok, queuing that up — cron picks it up within ~5 minutes")
3. **Stops.** Does not attempt inline work.

The card then sits in the board's `backlog` or `todo` column. A cron worker (`board-worker-in-progress`) picks it up, claims it, and executes the full task asynchronously.

---

## Non-Blocking Execution Model

mc-queue enforces non-blocking execution through two mechanisms:

### 1. Haiku model override (`before_model_resolve`)

All messaging sessions are switched to `claude-haiku-4-5-20251001` (configurable). Haiku is fast and cheap — it should never be doing long-running work. If the configured model is already Haiku, the override is a no-op.

### 2. Tool call cap per turn (`before_tool_call`)

A per-run counter tracks how many tool calls have been made in the current turn. If the count exceeds `maxToolCallsPerTurn` (default: 3), the tool call is blocked with an error:

```
mc-queue: max 3 tool calls per turn in messaging sessions.
Create a board card for multi-step work instead.
```

The counter is keyed by `runId` and cleaned up on `agent_end`.

This combination means: even if the agent somehow tries to do complex work inline, it physically cannot — it runs out of tool calls and must create a card instead.

---

## Board Event Logging

When a cron worker completes or blocks a card, mc-queue captures these events and posts to the configured Telegram log channel (`tgLogChatId`).

### Events detected from cron sessions

| Tool call | Condition | Event |
|-----------|-----------|-------|
| `brain_move_card` | `column == "shipped"` | Ship notification |
| `brain_update_card` | Notes contain blocker keywords | Human-needed alert |
| `bash` / `exec` / `computer` | `mc-board move <id> shipped` | Ship notification |

### Blocker keyword patterns

The following patterns in a card's `notes` field trigger a human-needed alert:
- `BLOCKED`
- `needs human` / `need human`
- `human review` / `human decision` / `human input` / `human approval` / `human needed`
- `awaiting human` / `awaiting michael` / `awaiting approval`
- `escalat...` (any form of escalate/escalating/escalation)

### Log message formats

Ship events:
```
🚀 Shipped: Task Title — crd_abc123
```

Human-needed alerts:
```
🚨 Human needed: crd_abc123 — Task Title
reason text (first line of notes)
```

Card links are included when `boardUrl` is configured (e.g. `https://mini.example.com`).

---

## Configuration Reference

Configuration lives in the plugin block of the OpenClaw config file under the `mc-queue` plugin ID.

```json
{
  "enabled": true,
  "haikuModel": "claude-haiku-4-5-20251001",
  "maxToolCallsPerTurn": 3,
  "applyToChannels": true,
  "applyToDMs": true,
  "tgLogChatId": "-1001234567890",
  "tgBotName": "@augmentedmike_bot",
  "boardUrl": "https://mini.example.com"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Master on/off switch |
| `haikuModel` | string | `claude-haiku-4-5-20251001` | Model to use for messaging sessions |
| `maxToolCallsPerTurn` | number | `3` | Max tool calls allowed per messaging turn |
| `applyToChannels` | boolean | `true` | Apply triage to group/channel sessions |
| `applyToDMs` | boolean | `true` | Apply triage to DM sessions |
| `tgLogChatId` | string | `""` | Telegram channel ID to post board events |
| `tgBotName` | string | `@augmentedmike_bot` | Bot handle shown in log channel redirect |
| `boardUrl` | string | `""` | Base URL for board card links in log messages. Also reads `MINICLAW_BOARD_URL` env var |

The bot token is read from the OpenClaw channels config (`channels.telegram.botToken`) — it is not a separate mc-queue config field.

---

## Status Command

Run from any session:

```
/queue_status
```

Returns:
```
mc-queue status
Enabled: true
Model: claude-haiku-4-5-20251001
Max tool calls/turn: 3
Apply to channels: true
Apply to DMs: true
TG log channel: -1001234567890
```

---

## How to Add a New Channel

To add support for a new messaging platform (e.g. Matrix, Line, WeChat):

1. **Add a session key check** in `isMessagingSession()` in `index.ts`:
   ```typescript
   sessionKey.includes(":matrix:") ||
   ```
   The session key format must contain the platform name as a segment.

2. **Verify the OpenClaw channel adapter** emits session keys in the expected format: `agent:<agent>:<platform>:<subtype>:<id>`. If the adapter doesn't use this format, adjust the check in step 1 to match whatever pattern it uses.

3. **No other changes needed.** The triage prompt, Haiku override, tool call cap, and cleanup hooks all run based on `isMessagingSession()`. Adding the pattern there is sufficient.

4. **Optional:** If the new channel should be excluded from triage (e.g. an admin-only channel), add it to the exclusion block at the top of `isMessagingSession()`:
   ```typescript
   if (sessionKey.includes(":admin:")) return false;
   ```

5. **Test**: send a message through the new channel and confirm:
   - The session runs Haiku (check `api.logger.info` output for `mc-queue loaded`)
   - A multi-step request creates a board card rather than executing inline
   - The tool call counter blocks excess calls

---

## File Map

```
plugins/mc-queue/
├── index.ts                          Main plugin — hooks, session classifier, config
│                                      Contains inline sendTgLog() and formatBoardEvent()
│                                      (no imports from lib/)
├── openclaw.plugin.json              Plugin manifest and config schema
├── package.json                      Package metadata
└── lib/                              ⚠ Orphaned — NOT imported by index.ts
    ├── format-log-events.ts          Alternative HTML formatters (unused by running code)
    ├── telegram-log-client.ts        Alternative TelegramLogClient class (unused by running code)
    └── __tests__/
        ├── format-log-events.test.ts
        └── telegram-log-client.test.ts
```

> **Note:** `lib/format-log-events.ts` and `lib/telegram-log-client.ts` are not imported by `index.ts`. The active log formatting and sending is handled by `sendTgLog()` (index.ts:90–113) and `formatBoardEvent()` (index.ts:135–148) — both defined inline. If you are debugging log output or message formatting, look in `index.ts`, not `lib/`.

---

## Relationship to Other Plugins

| Plugin | Relationship |
|--------|-------------|
| `mc-board` | mc-queue creates cards via `brain_create_card`; monitors `brain_move_card` / `brain_update_card` tool calls in cron sessions to detect ship/block events |
| `mc-jobs` | Cron workers managed by mc-jobs run in `:cron:` sessions — mc-queue's triage does not apply to them, but board events they emit are captured by the `after_tool_call` hook |
| `mc-soul` | mc-queue reads `IDENTITY.md` and `SOUL.md` from `$OPENCLAW_STATE_DIR/workspace/` at startup and prepends them to the triage system prompt so the agent maintains its persona in messaging sessions |
