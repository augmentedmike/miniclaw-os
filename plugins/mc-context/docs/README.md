# mc-context

Engineered context windows — the agent's hippocampus.

Runs automatically on every prompt build. No manual interaction needed.

## What it does

- **Time-based retention**: keeps only messages from the last N minutes (configurable), with a minimum message floor so recent context is never dropped entirely
- **Image pruning**: strips images from older messages to save context tokens, keeping only the most recent N images
- **Memory injection**: prepends QMD-sourced memory summaries into the prompt so the agent always has relevant background context

## Config

| Key | Default | Description |
|-----|---------|-------------|
| `windowMinutes` | `60` | How far back to retain messages |
| `windowMinMessages` | `10` | Minimum messages to keep regardless of age |
| `maxImagesInHistory` | `2` | Max images to retain in history |
| `imagePlaceholder` | `[image removed]` | Replacement text for pruned images |
| `applyToChannels` | `true` | Apply to channel/group sessions |
| `applyToDMs` | `true` | Apply to DM sessions |
| `replaceMessages` | `true` | Replace history (requires fork) vs prepend-only |
| `useHaikuForChannels` | `false` | Swap to Haiku model for channel sessions |
