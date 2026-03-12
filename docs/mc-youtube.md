# mc-youtube — Video Analysis

Video keyframe extraction and analysis for YouTube content.

## What it does

- Extracts keyframes (dense screenshot extraction) from videos at configurable intervals
- Generates up to 12 key points for analysis
- Passes frames to Claude for video understanding and analysis
- Stores media in user's media directory

## Config

```json
{
  "mediaDir": "~/.openclaw/USER/<bot>/media/youtube",
  "maxKeyPoints": 12,
  "screenshotWidth": 1280,
  "screenshotQuality": 3,
  "keyframeIntervalSeconds": 5
}
```

> **Note:** This plugin is in early development. CLI commands and agent tools are being built out.
