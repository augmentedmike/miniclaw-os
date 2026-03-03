# mc-context — Hippocampus

The hippocampus manages memory consolidation — deciding what gets encoded, what stays active, and what gets let go. It's the reason you remember yesterday's meeting but not every email you've ever read.

AI agents have a hard limit on how much they can hold in their context window at once. Without management, that window fills up with stale old messages, large images from hours ago, and irrelevant history. Eventually it overflows entirely, and the agent either loses earlier context or stops working.

**mc-context gives openclaw a hippocampus.**

It runs automatically on every prompt build and engineers the context window before the model ever sees it. Recent messages stay. Old ones get trimmed. Images are pruned once they're no longer relevant. And semantic memory from QMD gets injected so the agent always has relevant background — not the full history, just what matters right now.

## What changes

**Without mc-context:** the context window grows unchecked until it hits the limit. The agent sees everything or nothing. Old images waste thousands of tokens. The agent forgets background context it was told three sessions ago.

**With mc-context:** the agent's active memory is always fresh and focused. Older messages are dropped, stale images are stripped, and important background is pulled in from long-term storage automatically. The agent works better for longer without hitting limits.

## How it works

```
Raw message history
       ↓
  [time filter]  → drop messages older than windowMinutes (keep at least windowMinMessages)
       ↓
  [image prune]  → strip images from older messages, keep only the last maxImagesInHistory
       ↓
  [QMD inject]   → prepend relevant memory summaries from semantic search
       ↓
Engineered context window → model
```

## Config

| Key | Default | Description |
|-----|---------|-------------|
| `windowMinutes` | `60` | How far back to retain messages |
| `windowMinMessages` | `10` | Minimum messages to keep regardless of age |
| `maxImagesInHistory` | `2` | Max images to retain in history |
| `applyToChannels` | `true` | Apply to channel/group sessions |
| `applyToDMs` | `true` | Apply to DM sessions |
| `replaceMessages` | `true` | Replace history (requires fork) vs prepend-only |
| `useHaikuForChannels` | `false` | Swap to Haiku model for channel sessions |
