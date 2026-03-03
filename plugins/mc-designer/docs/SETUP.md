# Setting Up Miniclaw Designer — Gemini API Key Guide

This guide walks you through getting a Gemini API key and wiring it into the plugin.
No prior experience with APIs needed.

---

## What You Need

A free Google account and about 5 minutes.

---

## Step 1 — Get Your API Key

1. Open your browser and go to **Google AI Studio**:
   `https://aistudio.google.com/app/apikey`

2. Sign in with your Google account if prompted.

3. You'll see a page titled **"API keys"**. Click the button that says **"Create API key"**.

4. A dialog will appear asking you to select a Google Cloud project.
   - If you have an existing project, select it.
   - If not, click **"Create API key in new project"** — Google will make one for you automatically.

5. Your new API key will appear on screen. It looks something like this:
   ```
   AIzaSyBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

6. **Copy the key now.** Click the copy icon next to it or select all and copy.

> **Security note**: Treat this key like a password. Do not paste it into chat messages,
> commit it to git, or share it publicly. It gives access to your Google AI quota.

---

## Step 2 — Check Your Quota

By default the free tier gives you:
- **1,500 requests/day** for Gemini 2.0 Flash (generous for personal use)
- **15 requests/minute** rate limit

For paid usage, visit: `https://aistudio.google.com/app/plan`

---

## Step 3 — Add the Key to OpenClaw

Run this command in your terminal, replacing `YOUR_KEY_HERE` with your actual key:

```bash
openclaw config set plugins.entries.mc-designer.config.apiKey "YOUR_KEY_HERE"
```

That's it. The key is now stored in your local `openclaw.json` config.

---

## Step 4 — Verify It Works

Restart the OpenClaw gateway (use the OpenClaw app), then run:

```bash
openclaw cli designer gen "a simple red circle on white background"
```

If everything is set up correctly, you'll see output like:
```
Generating image for: "a simple red circle on white background" ...
Layer "layer-1" added to canvas "default"
Image saved: ~/.openclaw/media/designer/layers/default/layer-1234567890.png
Tokens: 12 in / 0 out  |  3421ms
```

---

## Step 5 — Check Usage & Costs

At any time, run:

```bash
openclaw cli designer stats
```

This shows you how many API calls have been made, total tokens consumed,
and an estimated cost in USD so you're never surprised.

---

## Troubleshooting

**"API key not valid"** — Double-check the key was copied in full (no trailing spaces).
Re-run the `openclaw config set` command.

**"Quota exceeded"** — You've hit the free tier daily limit.
Either wait until tomorrow or upgrade to a paid plan in AI Studio.

**"Gemini returned no image data"** — The model may have refused the prompt
(e.g. policy violation) or the `gemini-2.0-flash-exp` model may have been deprecated.
Check `openclaw config get plugins.entries.mc-designer.config.model`
and update the model name if needed.

**Plugin not loading** — Make sure the plugin is in the `allow` list in `openclaw.json`:
```bash
openclaw config get plugins.allow
```
You should see `mc-designer` in the list. If not, ask AugmentedMike.

---

## Quick Reference

| Command | What it does |
|---------|-------------|
| `designer gen "prompt"` | Generate image, add as layer on default canvas |
| `designer gen "prompt" --canvas myproject --layer sky` | Generate into named canvas/layer |
| `designer canvas list` | List all canvases |
| `designer canvas show myproject` | Show layer stack |
| `designer layer toggle myproject sky` | Hide/show a layer |
| `designer composite myproject` | Flatten all layers → PNG |
| `designer stats` | Usage + cost summary |
| `designer stats --full` | Per-call breakdown |
