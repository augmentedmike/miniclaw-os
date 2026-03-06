# mc-context — Context Window Management

mc-context is the hippocampus of the Mini Claw agent stack. It runs automatically on every
prompt build, engineering the context window before the model sees it — keeping recent,
relevant messages and discarding stale history, old images, and orphaned data.

---

## Problem it solves

OpenClaw's built-in context systems are reactive: compaction fires after the window fills up,
and context pruning only trims tool results. Neither handles images proactively, neither is
channel-aware, and neither injects semantic memory.

Without mc-context, the agent's context window grows unchecked until it hits the model's
token limit. Old images (estimated 1,000+ tokens each) pile up. Messages from sessions two
days ago sit next to messages from two minutes ago with equal weight.

mc-context replaces that with a **sliding window**: before every model call, it decides
exactly what goes in.

---

## How it works

The pipeline runs inside the `before_prompt_build` hook, in this order:

```
Raw message history (full session)
        ↓
  [session check]   → skip if session type not configured (channel/DM)
        ↓
  [time filter]     → drop messages older than windowMinutes
                      always keep at least windowMinMessages recent messages
        ↓
  [image prune]     → walk newest-first, keep last maxImagesInHistory image-bearing messages
                      replace stripped images with imagePlaceholder text
        ↓
  [tool-pair repair]→ drop orphaned toolResult messages whose toolCall was filtered away
        ↓
  [prependContext]  → inject summary of what was pruned + response latency hint
        ↓
  [optional replace]→ return engineered message list (replaceMessages=true, requires fork)
        ↓
Model call
```

---

## Window management strategy

### Time-based retention

The primary retention criterion is message age. Messages older than `windowMinutes` are
dropped from the context sent to the model.

**Timestamp detection** — the plugin reads three fields in priority order:
1. `createdAt` (number)
2. `timestamp` (number)
3. `ts` (number)

If none are present, the message is **kept** (safe default: unknown age = don't drop).

### Minimum floor

To prevent edge cases where a long-idle session would lose nearly everything, the plugin
always keeps the **last `windowMinMessages` messages** regardless of their age. These are
never subject to time filtering.

Example: `windowMinutes=60`, `windowMinMessages=10`. If the session has 50 messages but
only 3 are from the last hour, all 3 recent ones are kept plus the 7 before them to reach
the floor of 10.

### Tool-pair integrity repair

The Anthropic API requires every `toolResult` message to have a corresponding `toolCall`
in the immediately preceding assistant message. Time-window filtering can sever this
pairing by dropping the assistant message while keeping the toolResult.

After the time filter runs, mc-context scans for orphaned toolResult messages and drops
them. The count is logged and included in the prependContext summary so the agent knows
what happened.

---

## Image pruning

Images are expensive. Each image block is estimated at ~1,000 tokens (4,000 chars / 4
chars-per-token). Without pruning, a multi-hour session with frequent image uploads would
burn thousands of tokens on images the agent no longer needs.

### Strategy: newest-first, keep last N

The pruner walks the message list from newest to oldest. It tracks how many
image-bearing messages it has preserved. Once that count reaches `maxImagesInHistory`,
all older image-bearing messages have their image blocks stripped.

Stripped image blocks are replaced with a text block containing `imagePlaceholder`. The
rest of the message (any text content, role, metadata) is preserved unchanged. The
message remains in history — only the image data is removed.

**Key property:** messages without images are never touched by the image pruner.

### Example

With `maxImagesInHistory=2` and 4 image-bearing messages (oldest first):

```
msg[0]  image: "chart from Monday"     → STRIPPED (oldest, beyond limit)
msg[1]  image: "screenshot of error"  → STRIPPED
msg[2]  image: "updated chart"        → KEPT (2nd most recent)
msg[3]  image: "final screenshot"     → KEPT (most recent)
```

msg[0] and msg[1] become `{ type: "text", text: "[image removed from history]" }`.

---

## QMD summarization integration

QMD (Query Memory Documents) is the semantic search layer for long-term memory. mc-context
is designed to inject QMD results as a memory preamble before the engineered message window.

**Current status (Phase 1):** QMD injection is architected but not yet wired in the active
plugin. The `before_prompt_build` hook assembles a `prependContext` string that currently
carries the pruning summary and response latency hint. QMD injection will prepend a
`## Memory` section with results from `qmd query <prompt>` once enabled.

**Planned QMD config:**

| Key | Default | Description |
|-----|---------|-------------|
| `qmd.enabled` | `true` | Enable semantic memory injection |
| `qmd.collection` | `"workspace"` | QMD collection to query |
| `qmd.maxResults` | `3` | Max memory entries to inject |
| `qmd.maxChars` | `2000` | Max characters of QMD output |
| `qmd.triggerOnChannels` | `true` | Inject in channel sessions |
| `qmd.triggerOnDMs` | `false` | Inject in DM sessions |

When enabled, the flow becomes:

```
[QMD query] → top-N semantically relevant memory docs
     ↓
prependContext = "## Memory\n<qmd results>\n\n## Recent Context\n<pruning summary>"
```

---

## Session vs channel context

mc-context classifies each session by its `sessionKey` before applying any logic:

| Session type | sessionKey pattern | Example |
|---|---|---|
| Channel/group | contains `:group:` or `:channel:` | `tg:group:123456` |
| Direct message | contains `:direct:` or equals `agent:main:main` | `tg:direct:111222` |

The `applyToChannels` and `applyToDMs` config flags gate which session types are processed.
If a session type is not enabled, the hook returns immediately with no modification.

**Default behavior:** channels are managed, DMs are not. This reflects the typical use case
where DM sessions are shorter and less likely to accumulate stale context.

---

## Configuration reference

All config is set under the plugin's entry in `openclaw.json`.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `windowMinutes` | number | `60` | Retain messages from the last N minutes |
| `windowMinMessages` | number | `10` | Always keep at least N most recent messages |
| `maxImagesInHistory` | number | `2` | Max image-bearing messages to retain |
| `imagePlaceholder` | string | `"[image removed from history]"` | Text inserted in place of pruned images |
| `applyToChannels` | boolean | `true` | Apply context management to channel/group sessions |
| `applyToDMs` | boolean | `false` | Apply context management to DM sessions |
| `replaceMessages` | boolean | `false` | Actually replace history (requires openclaw fork) |
| `useHaikuForChannels` | boolean | `false` | Swap to Haiku model for channel sessions (planned) |
| `maxToolResultChars` | number | — | Truncate long tool results (planned) |

### Example openclaw.json entry

```json
{
  "plugins": {
    "entries": {
      "mc-context": {
        "enabled": true,
        "config": {
          "windowMinutes": 60,
          "windowMinMessages": 10,
          "maxImagesInHistory": 2,
          "applyToChannels": true,
          "applyToDMs": false,
          "replaceMessages": false
        }
      }
    }
  }
}
```

---

## Phase 1 vs Phase 2

mc-context ships in two capability phases.

### Phase 1 (current): prependContext only

The plugin builds the engineered window internally but cannot return it to openclaw to
replace the actual history. Instead, it prepends a summary of what was pruned.

The full raw history still goes to the model. Token savings come from:
- The prependContext summary helping the model ignore stale data
- (Future) QMD injection giving the model better grounding without needing old history

### Phase 2: full messages replacement

A small upstream patch adds `messages?: AgentMessage[]` to the
`PluginHookBeforePromptBuildResult` type. Once merged, setting `replaceMessages: true`
causes mc-context to return the pruned window, which openclaw substitutes for the full
history before the model call.

This achieves real token reduction: the model only processes the engineered window.

**Important cache note:** the plugin only returns `messages` when something actually
changed (at least one message dropped or image pruned). Returning the same messages with
different object references would bust Anthropic's prefix cache unnecessarily.

---

## Interaction with mc-queue

mc-queue handles Telegram message ingestion and queuing — it decides when and how messages
enter the agent's session. mc-context operates downstream, after messages are in the
session and the agent is about to respond.

They interact at the session boundary:

1. **mc-queue** receives a Telegram message, queues it, and triggers an agent run for the
   session.
2. **mc-context** fires on `before_prompt_build` for that run, receives the full session
   history, and engineers the window.
3. The model runs on the engineered context.
4. **mc-queue** receives the response and sends it back to Telegram.

mc-context has no dependency on mc-queue and does not need to be aware of the queue state.
Both plugins operate on the same `sessionKey` namespace, so session classification is
consistent across both.

---

## Slash commands

| Command | Description |
|---------|-------------|
| `/context_stats` | Cumulative pruning stats: tokens saved, images pruned, message drops, response latency |
| `/context_status` | Current config: window size, min messages, max images, enabled session types |

### Sample `/context_stats` output

```
mc-context stats (since restart, ~42min ago)

📊 Real token data (17 LLM runs)
  • Sent to model: 48,320
  • Est. without pruning: 61,800
  • Saved: ~13,480 (21%)

⏱️ Response latency (17 samples)
  • Last: 4.2s
  • Avg: 5.1s
  • Min: 2.8s  Max: 9.3s

✂️ Messages dropped (age): 34
🖼️ Images pruned: 12
🔁 Hook invocations: 17
⏱️ Last invoked: 23s ago
```

Stats are cumulative since the last openclaw restart and reset on restart.

---

## Response latency tracking

mc-context also tracks wall-clock time from when a message is received to when the
response is sent (`message_received` → `message_sent`). This is time-to-first-response
(TTFR) — the full round trip including queueing, model call, and delivery.

The last 20 TTFR samples are retained. A latency hint is injected into `prependContext`
so the agent can see its own response performance in real time.

---

## Token estimation

For tracking purposes, mc-context uses a rough token estimator:

- Text: `ceil(characters / 4)` tokens
- Image blocks: 1,000 tokens each (fixed estimate, ~4,000 chars equivalent)

These estimates are used to calculate how many tokens were saved by pruning. They are
compared against real usage reported by the `llm_output` event to show actual vs
estimated savings in `/context_stats`.
