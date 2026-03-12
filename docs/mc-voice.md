# mc-voice — Human Writing Style Learning

mc-voice captures human messages from all channels and builds a voice profile using Gemini embeddings. It learns vocabulary, tone, and sentence patterns so the agent can mirror the human's writing style over time.

---

## Overview

The plugin hooks into the `message_received` event to capture every incoming human message. Messages are sent to an external `voice-ingest` binary that computes Gemini embeddings and stores them in `voice.db`. The agent uses this voice profile data to adapt its writing style.

mc-voice includes a full transparency and consent system: first-time disclosure, slash commands for opt-out/opt-in, natural language opt-out detection ("stop mirroring me"), and a purge command that deletes all stored data.

---

## How It Works

1. **Capture:** Every `message_received` event triggers a fire-and-forget call to the `voice-ingest` binary
2. **Embedding:** The ingest binary computes Gemini embeddings and writes to `voice.db`
3. **Disclosure:** On the first message captured for a human, the agent sends a proactive disclosure
4. **Opt-out:** Users can disable at any time via `/voice-off`, natural language, or `/voice-purge`

---

## Slash Commands

| Command | Description |
|---------|-------------|
| `/voice-off` | Disable voice learning immediately. Messages stop being captured. |
| `/voice-on` | Re-enable voice learning. Resume capturing messages for style mirroring. |
| `/voice-purge` | Delete all stored messages, reset the voice profile entirely. Nothing retained. |

---

## Natural Language Opt-Out

The plugin detects natural language opt-out requests and responds accordingly:

- "stop mirroring me"
- "stop mirroring"
- "turn off mirroring"
- "disable mirroring"
- "stop learning my style"

When detected, voice learning is disabled and the agent confirms: "Got it -- mirroring off. I'll stop learning your style and my writing will drift back to default from here."

---

## Transparency

On the first message captured for a `human_id`, the plugin injects a disclosure into the agent's next prompt:

> "Hey -- I'm going to start learning from how you write so I can match your style over time. I'll track vocabulary, tone, and sentence patterns from your messages. You can turn this off any time by sending /voice-off."

Pre-existing users (those with messages already in the database before disclosure was added) are marked as pre-acknowledged and do not receive a retroactive disclosure.

---

## Agent Tools

mc-voice does not register agent tools. Voice data is consumed internally by the agent's style-matching system.

---

## CLI Commands

mc-voice does not register CLI commands. All interaction is through slash commands and the automatic `message_received` hook.

---

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `humanId` | string | `augmentedmike` | Human identifier for voice profile |
| `dbPath` | string | `$OPENCLAW_STATE_DIR/USER/<bot_id>/voice/voice.db` | Path to the SQLite voice database |
| `ingestBin` | string | `$OPENCLAW_STATE_DIR/miniclaw/system/bin/voice-ingest` | Path to the voice-ingest binary |

The `GOOGLE_API_KEY` environment variable is passed to the ingest binary for Gemini embedding calls.

---

## State Storage

```
$OPENCLAW_STATE_DIR/USER/<bot_id>/voice/
  voice.db       SQLite database (WAL mode)
    human_voice        Captured messages with embeddings
    voice_settings     Per-human opt-out status, disclosure state, analysis metadata
```

---

## Database Tables

### `voice_settings`

| Column | Description |
|--------|-------------|
| `human_id` | Human identifier (primary key) |
| `opted_out` | 1 if user has opted out |
| `opted_out_at` | Timestamp of opt-out |
| `needs_disclosure` | 1 if first-time disclosure is pending |
| `disclosed_at` | Timestamp when disclosure was sent |
| `learning_active` | Whether active learning is enabled |
| `message_count_at_last_analysis` | Message count at last style analysis |

### `human_voice`

Stores individual captured messages with Gemini embeddings, keyed by `human_id`.
