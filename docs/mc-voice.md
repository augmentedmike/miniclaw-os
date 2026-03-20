# mc-voice

> Local speech-to-text via whisper.cpp — record and transcribe audio files.

## Overview

mc-voice provides local speech-to-text transcription using whisper.cpp. It can record audio
from the microphone via sox, transcribe audio files, and combine both into a dictation workflow.
All processing happens locally — no API calls required.

## Installation

```bash
cd ~/.openclaw/miniclaw/plugins/mc-voice
npm install
npm run build
```

### Prerequisites

- whisper.cpp binary (bundled in `SYSTEM/bin/whisper-cpp` or from Homebrew)
- sox command-line tool for audio recording: `brew install sox`
- Whisper model files in `~/.openclaw/miniclaw/SYSTEM/whisper-models/`

## CLI Usage

```bash
# Transcribe an audio file
openclaw mc-voice transcribe <file> [-m MODEL] [-l LANGUAGE]

# Record audio from microphone
openclaw mc-voice record [-d SECONDS] [-o OUTPUT]

# Record then transcribe (press Ctrl+C to stop)
openclaw mc-voice dictate [-m MODEL] [-l LANGUAGE] [-d SECONDS]

# Download a whisper model
openclaw mc-voice download-model [-m MODEL]

# Check whisper.cpp and model availability
openclaw mc-voice status
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `transcribe` | Transcribe an audio file to text | `openclaw mc-voice transcribe recording.wav -m base` |
| `record` | Record audio from microphone (16kHz mono WAV) | `openclaw mc-voice record -d 30 -o meeting.wav` |
| `dictate` | Record from mic then transcribe | `openclaw mc-voice dictate -m small` |
| `download-model` | Download a whisper.cpp model | `openclaw mc-voice download-model -m small` |
| `status` | Check whisper.cpp and model availability | `openclaw mc-voice status` |

## Tool API

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `voice_transcribe` | Transcribe an audio file to text | `file` (absolute path) | `model` (tiny/base/small/medium/large) |
| `voice_record` | Record audio from microphone | `duration` (seconds) | — |

### Example tool call (agent perspective)

```
Use the voice_transcribe tool to transcribe the meeting recording at /tmp/meeting.wav.
```

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `model` | `string` | `base` | Whisper model (tiny, base, small, medium, large) |
| `language` | `string` | `en` | Language code for transcription |

## Examples

### Example 1 — Transcribe a meeting recording

```bash
openclaw mc-voice transcribe ~/recordings/standup-2026-03-19.wav -m small
```

### Example 2 — Quick dictation

```bash
openclaw mc-voice dictate -d 60
# Speak for up to 60 seconds, then get transcription
```

## Architecture

- `index.ts` — Plugin entry point, registers CLI and tools
- `cli/commands.ts` — CLI command registrations
- `tools/definitions.ts` — Agent tool definitions
- `src/config.ts` — Configuration resolution (locates whisper binary with fallback chain)
- `src/whisper.js` — Whisper transcription and model management
- `src/recorder.js` — Audio recording via sox

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "whisper binary not found" | Install via Homebrew or check `SYSTEM/bin/whisper-cpp` |
| "sox: command not found" | Install sox: `brew install sox` |
| Model not found | Run `openclaw mc-voice download-model -m base` |
| Poor transcription quality | Use a larger model: `-m small` or `-m medium` |
