# mc-designer — Usage Guide

Everything currently working in the visual creation studio.

---

## Prerequisites

A Gemini API key set in your config. If you haven't done this yet, see [SETUP.md](./SETUP.md).

---

## Core concepts

**Canvas** — a named workspace with a fixed pixel dimensions. Holds an ordered stack of layers.

**Layer** — a single image inside a canvas. Each layer has a z-index (higher = rendered on top), opacity, visibility, blend mode, and an optional x/y offset.

**Composite** — flatten all visible layers in z-order into a single PNG output file.

The default canvas is named `default` and is created automatically at 1024×1024 when you run `gen` without specifying one.

---

## Generating images

```bash
mc designer gen "a clean product hero shot on white background"
```

Calls Gemini, saves the result as a new layer on the `default` canvas. Prints the layer name, image path, token usage, and time.

**Options:**

```bash
# Target a specific canvas (created automatically if it doesn't exist)
mc designer gen "blue gradient sky" --canvas homepage

# Name the layer explicitly
mc designer gen "bold wordmark in black" --canvas homepage --layer logo

# Set canvas dimensions when auto-creating
mc designer gen "wide banner" --canvas hero --width 1920 --height 400
```

Layer names auto-increment (`layer-1`, `layer-2`, ...) if you don't specify `--layer`.

---

## Editing an existing layer

```bash
mc designer edit <canvas> <layer> "<instructions>"
```

Sends the current layer image back to Gemini alongside your instructions. The layer image is updated in place.

```bash
mc designer edit homepage bg "make the gradient warmer, more orange tones"
mc designer edit homepage logo "increase contrast, make it bolder"
```

---

## Canvas management

```bash
# Create a canvas with custom dimensions
mc designer canvas new mybrand --width 1920 --height 1080

# List all canvases
mc designer canvas list

# Inspect the layer stack
mc designer canvas show mybrand

# Delete a canvas (does not delete the underlying image files)
mc designer canvas rm mybrand
```

`canvas show` output:

```
Canvas: mybrand  1920×1080  (3 layers)
  z2  ✓  logo      opacity=100%  blend=normal
       prompt: "bold sans-serif wordmark on transparent background"
  z1  ✓  product   opacity=90%   blend=normal
       prompt: "product shot on white"
  z0  ✓  bg        opacity=100%  blend=normal
       prompt: "soft blue gradient background"
```

Layers are listed top-to-bottom (highest z first). `✓` = visible, `○` = hidden.

---

## Layer management

### Import an existing image as a layer

```bash
mc designer layer add mybrand ./my-photo.png --name photo
mc designer layer add mybrand ./logo.png --name logo --z 5
```

Copies the file into the canvas store. Accepts any image format sharp can read (PNG, JPEG, WebP, TIFF).

### Reorder layers

```bash
mc designer layer mv mybrand logo --z 3
```

### Set opacity

```bash
mc designer layer opacity mybrand logo 80    # 0 = invisible, 100 = fully opaque
```

### Show / hide

```bash
mc designer layer toggle mybrand logo        # flips between visible/hidden
```

### Rename

```bash
mc designer layer rename mybrand layer-1 background
```

### Set blend mode

```bash
mc designer layer blend mybrand overlay multiply
```

Supported modes: `normal`, `multiply`, `screen`, `overlay`.

Blend modes apply during compositing using sharp's native implementation.

### Remove a layer

```bash
mc designer layer rm mybrand logo
```

Removes the layer from the canvas. Does not delete the image file from disk.

---

## Compositing

Flatten all visible layers in z-order into a single PNG:

```bash
mc designer composite mybrand
```

Outputs to `~/.openclaw/media/designer/output/mybrand-<timestamp>.png` by default.

```bash
# Custom output path
mc designer composite mybrand --out ~/Desktop/mybrand-final.png
```

Layers are composited bottom-to-top by z-index. Hidden layers (`toggle`d off) are skipped. Opacity and blend mode are applied per layer.

---

## Background stripping

```bash
mc designer alpha strip ./my-layer.png
```

Outputs `./my-layer.nobg.png`.

> **Current limitation:** background stripping is a basic alpha conversion — it makes the image transparent-capable but doesn't do segmentation-based background removal. True background removal (isolating subjects) is on the roadmap.

---

## Working with the default canvas

If you just want to generate and iterate without naming things:

```bash
mc designer gen "a minimalist icon of a crab, flat design"
mc designer gen "same crab but in dark navy blue"
mc designer canvas show default
mc designer composite default --out ~/Desktop/crab.png
```

Each `gen` adds a new layer. The most recent generation is always the top layer.

---

## Usage and cost tracking

```bash
mc designer stats
```

```
  Miniclaw Designer — Gemini Usage Summary
  ─────────────────────────────────────────
  Total API calls : 12
    generate      : 10
    edit          : 2
  Images generated: 12
  Input tokens    : 8,431
  Output tokens   : 0
  Est. cost (USD) : $0.0021
  First call      : 2026-03-01T14:22:01.000Z
  Last call       : 2026-03-03T09:11:44.000Z
```

```bash
# Full per-call breakdown
mc designer stats --full
```

Cost estimates are based on Gemini 2.0 Flash pricing. Output tokens are typically 0 for image generation (the image bytes are not counted as tokens).

---

## Worked example — product hero image

```bash
# Create a 1600×900 canvas
mc designer canvas new hero --width 1600 --height 900

# Generate the background
mc designer gen "soft gradient, pale blue to white, clean and minimal" \
  --canvas hero --layer bg

# Generate a product mockup
mc designer gen "a white ceramic coffee mug, studio lighting, white background" \
  --canvas hero --layer product

# Import your own logo
mc designer layer add hero ./logo.png --name logo --z 10

# Adjust the product layer opacity
mc designer layer opacity hero product 95

# Preview the stack
mc designer canvas show hero

# Export
mc designer composite hero --out ~/Desktop/hero-final.png
```

---

## File locations

| What | Where |
|------|-------|
| Canvas metadata (JSON) | `~/.openclaw/media/designer/canvases/<name>.json` |
| Layer images | `~/.openclaw/media/designer/layers/<canvas>/<layer-id>.png` |
| Composite output | `~/.openclaw/media/designer/output/<canvas>-<timestamp>.png` |
| Usage log | `~/.openclaw/media/designer/usage.jsonl` |
