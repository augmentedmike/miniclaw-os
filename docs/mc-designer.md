# mc-designer — Visual Creation Studio

mc-designer is the agent's visual cortex — a Gemini-powered image generation and compositing plugin for OpenClaw. It provides a layered canvas system (generate, edit, composite, export) that lets the agent produce visual assets without human intervention.

## Supported Models

mc-designer uses **Google Gemini** exclusively. There is no DALL-E support.

| Config key | Default | Notes |
|------------|---------|-------|
| `model` | `gemini-3.1-flash-image-preview` | Any Gemini image generation model ID works here |

The model is called via the Gemini REST API (`https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`). Supported aspect ratios for generation: `1:1`, `16:9`, `9:16`, `4:3`, `3:4`. The aspect ratio is chosen automatically from canvas dimensions.

### API Key Requirement

A **Google Gemini API key** is required. Get one from [Google AI Studio](https://aistudio.google.com/app/apikey).

Set the key:
```bash
openclaw config set plugins.entries.mc-designer.config.apiKey "YOUR_KEY_HERE"
```

Or store it via the vault (preferred):
```bash
# The plugin will prompt and store via mc-vault on first use if no key is configured
```

Free tier limits: 1,500 requests/day, 15 requests/minute for Gemini 2.0 Flash.

---

## Configuration

All config lives in `openclaw.json` under `plugins.entries.mc-designer.config`.

| Key | Default | Description |
|-----|---------|-------------|
| `apiKey` | `""` | Gemini API key (required) |
| `model` | `gemini-3.1-flash-image-preview` | Gemini model to use |
| `mediaDir` | `~/.openclaw/media/designer` | Root directory for all generated files |
| `defaultWidth` | `1024` | Default canvas width in pixels |
| `defaultHeight` | `1024` | Default canvas height in pixels |

---

## Output Path Conventions

All files are written under `mediaDir` (default: `~/.openclaw/media/designer`):

| What | Path |
|------|------|
| Canvas metadata (JSON) | `<mediaDir>/canvases/<name>.json` |
| Layer images (PNG) | `<mediaDir>/layers/<canvas>/<layer-id>.png` |
| Composite output (PNG) | `<mediaDir>/output/<canvas>-<timestamp>.png` |
| API usage log (JSONL) | `<mediaDir>/usage.jsonl` |

---

## CLI Commands

All commands are under `mc designer` (or `mc-designer` in full form):

### Image Generation

```bash
# Generate a new image and add it as a layer
mc designer gen "<prompt>" [options]

Options:
  -c, --canvas <name>   Target canvas (created automatically if absent; default: "default")
  -l, --layer <name>    Layer name (auto-assigned if omitted)
  -W, --width <px>      Canvas width when auto-creating (default: 1024)
  -H, --height <px>     Canvas height when auto-creating (default: 1024)
  -r, --role <role>     Layer role: background or element
                        (first layer defaults to background; all others default to element)
  --x <px>              X position — required for element layers
  --y <px>              Y position — required for element layers
  --w <px>              Render width — required for element layers
  --h <px>              Render height — required for element layers

Examples:
  # Generate a background (first layer, role=background is automatic)
  mc designer gen "golden hour cityscape, cinematic" --canvas project

  # Generate an element layer with explicit position and size
  mc designer gen "minimal logo, white on black" \
    --canvas project --layer logo --role element \
    --x 24 --y 20 --w 120 --h 40
```

### Image Editing

```bash
# Edit an existing layer using Gemini (image-to-image)
mc designer edit <canvas> <layer> "<instructions>"

Example:
  mc designer edit project bg "shift the sky to deeper purple and pink tones"
```

### Canvas Management

```bash
mc designer canvas new <name> [options]
  --width <px>      Width in pixels (default: 1024)
  --height <px>     Height in pixels (default: 1024)
  --bg <hex>        Background color (default: "#18181b" zinc-900)
  --seed <n>        Seed for reproducible Gemini outputs (applied to all gen/edit on this canvas)
  --style <text>    Art direction style prepended to every gen/edit prompt on this canvas

mc designer canvas list              # List all canvases
mc designer canvas show <name>       # Show layer stack (z-index, visibility, opacity, blend mode)
mc designer canvas style <name> [text]  # Set or clear the art direction style
mc designer canvas clear <name>      # Remove all layers, keep canvas
mc designer canvas rm <name>         # Delete canvas (layer image files are not deleted)

Examples:
  mc designer canvas new mobile-hero --width 390 --height 844
  mc designer canvas new comic-panel --width 768 --height 550 --seed 3721 \
    --style "graphic novel, bold ink outlines, high contrast, dark moody palette"
  mc designer canvas style comic-panel "watercolor, soft edges, pastel"
  mc designer canvas style comic-panel  # (no text = clear style)
```

### Layer Management

```bash
mc designer layer add <canvas> <file> [options]   # Add existing image file as a layer
  --name <name>      Layer name (defaults to filename)
  --z <index>        Z-index (auto if omitted)
  --role <role>      background or element (default: element)
  --x <px>           X offset (default: 0)
  --y <px>           Y offset (default: 0)

mc designer layer rm <canvas> <layer>             # Remove a layer
mc designer layer mv <canvas> <layer> --z <index> # Move layer to a new z-index
mc designer layer opacity <canvas> <layer> <0-100> # Set opacity
mc designer layer toggle <canvas> <layer>         # Toggle visibility on/off
mc designer layer rename <canvas> <layer> <name>  # Rename a layer
mc designer layer blend <canvas> <layer> <mode>   # Set blend mode
mc designer layer clear <canvas>                  # Remove all layers

Examples:
  mc designer layer add project ~/export/logo.png --name logo --role element --x 24 --y 20
  mc designer layer opacity project overlay 45
  mc designer layer blend project shadow multiply
  mc designer layer mv project logo --z 3
```

### Compositing

```bash
# Flatten all visible layers and export a PNG
mc designer composite <canvas> [--out <file>]

# Output path auto-named as <mediaDir>/output/<canvas>-<timestamp>.png if --out is omitted

Examples:
  mc designer composite project
  mc designer composite project --out ~/Desktop/final.png
```

### Alpha / Transparency

```bash
# Add alpha channel to an image (outputs <file>.nobg.png)
mc designer alpha strip <file>

Example:
  mc designer alpha strip ~/Desktop/product.png
  # creates: ~/Desktop/product.nobg.png
```

> **Note:** `alpha strip` is a stub. It converts the image to PNG with an alpha channel (`ensureAlpha()`), but does **not** perform actual background removal or segmentation. The source comment describes this as a "naive approach" — a real implementation would require a segmentation API or model. Use this only to add transparency support to an image; remove backgrounds manually or with a dedicated service.

### Usage & Cost Tracking

```bash
mc designer stats           # Summary: total calls, tokens, images, estimated cost
mc designer stats --full    # Full per-call log
```

Pricing used for estimates (Gemini 2.0 Flash, as of 2026-03):
- Input: $0.075 / 1M tokens
- Output: $0.30 / 1M tokens
- Images: ~$0.04 per image

---

## Canvas and Layer System

### How Compositing Works

Every canvas has an ordered stack of layers. Layers are rendered bottom-up by z-index. The `composite` command flattens all visible layers into a single PNG.

```
canvas: project  (1024×1024)
  z=0  bg        role=background  (fills canvas, cover scaling)
  z=1  overlay   role=element     opacity=45%  at (0,0)  size=1024×1024
  z=2  logo      role=element     at (24, 20)  size=120×40
          ↓  mc designer composite project
  output/project-1234567890.png
```

### Layer Roles

| Role | Composite behavior | When to use |
|------|--------------------|-------------|
| `background` | Scales to fill canvas edge-to-edge (cover fit, no letterboxing), anchored south | Sky, scene, texture, gradient |
| `element` | Resized to `renderWidth × renderHeight`, placed at `x, y` | Logo, icon, product, text art, overlay |

- The **first layer on a canvas defaults to `background`**. All subsequent layers default to `element`.
- Element layers require `--x --y --w --h` at gen time (position and render size).
- Render size (`--w --h`) is independent of Gemini's output resolution — you control exactly how large the element appears on the canvas.

### Blend Modes

| Mode | Effect |
|------|--------|
| `normal` | Standard alpha compositing (default) |
| `multiply` | Darkens — multiplies pixel values |
| `screen` | Lightens — inverts, multiplies, inverts again |
| `overlay` | Contrast boost — combines multiply and screen |

Set with: `mc designer layer blend <canvas> <layer> <mode>`

### Canvas Style Directive

A canvas-level `style` string is prepended to every `gen` and `edit` prompt on that canvas. Set it once; all subsequent generation inherits it automatically.

```bash
mc designer canvas new comic --style "graphic novel, bold ink outlines, high contrast"
mc designer gen "man alone at a desk" --canvas comic
# Actual prompt sent to Gemini: "graphic novel, bold ink outlines, high contrast. man alone at a desk. Full bleed..."
```

### Canvas Seed

Setting `--seed <n>` on a canvas passes the seed to Gemini's `generationConfig` for all gen/edit calls. Same seed + same prompt = same result. Use the same seed across multiple canvases for visual consistency in multi-panel layouts.

### Aspect Ratio

The `gen` command automatically selects the Gemini aspect ratio closest to the canvas dimensions:

| Canvas shape | Gemini aspect ratio |
|---|---|
| Square-ish | `1:1` |
| Landscape (4:3) | `4:3` |
| Landscape (16:9) | `16:9` |
| Portrait (3:4) | `3:4` |
| Portrait (9:16) | `9:16` |

Match canvas dimensions to content orientation — a portrait canvas for a face close-up, landscape for a wide shot.

---

## Agent Context Injection

When canvases exist, mc-designer prepends a summary to every agent prompt:

```
[Designer] Active canvases:
  • project  1024×1024  3/4 layers visible
  • mobile-hero  390×844  6/6 layers visible
```

This lets the agent reason about current visual work without reading files directly.

---

## Worked Example — Mobile Hero Banner

```bash
# 1. Create canvas
mc designer canvas new mobile-hero --width 390 --height 844

# 2. Background (auto role=background for first layer)
mc designer gen "golden hour cityscape, warm orange and pink sky, cinematic" \
  --canvas mobile-hero --layer bg

# 3. Dark overlay for text readability
mc designer gen "solid black rectangle" \
  --canvas mobile-hero --layer overlay --role element \
  --x 0 --y 0 --w 390 --h 844
mc designer layer opacity mobile-hero overlay 45

# 4. Logo — top-left
mc designer gen "minimal wordmark 'ACME' in white, sans-serif, on black background" \
  --canvas mobile-hero --layer logo --role element \
  --x 24 --y 20 --w 120 --h 40

# 5. Headline
mc designer gen "bold white headline 'Built for Speed' on black background" \
  --canvas mobile-hero --layer headline --role element \
  --x 35 --y 320 --w 320 --h 120

# 6. CTA button
mc designer gen "rounded rectangle button, bright blue, white text 'Get Started'" \
  --canvas mobile-hero --layer cta --role element \
  --x 24 --y 720 --w 342 --h 52

# 7. Review layer stack
mc designer canvas show mobile-hero

# 8. Composite
mc designer composite mobile-hero --out ~/Desktop/mobile-hero.png

# 9. Iterate — edit a layer in place
mc designer edit mobile-hero bg "shift the sky to deeper purple and pink tones"
mc designer composite mobile-hero --out ~/Desktop/mobile-hero-v2.png
```

---

## Tips

**Prompting for backgrounds:** Describe what a photographer would frame. The system appends fill instructions automatically.
```
"golden hour cityscape, warm orange sky, cinematic, wide"   # good
"cityscape with a logo in the corner"                        # avoid — logos belong on element layers
```

**Prompting for elements:** Ask for the subject on a solid background (white or black). The system appends isolation instructions.
```
"white ceramic mug, studio lighting, white background"   # good — composites cleanly
"mug on a wooden café table"                             # avoid — background competes
```

**Multi-panel layouts:** `mc designer composite` flattens one canvas at a time. For multi-panel pages, composite each panel individually, then assemble with Python PIL or a similar tool.

**Text layers:** Gemini text in generated images gets distorted when scaled. For precise captions and labels, bake text into gen prompts carefully, or composite text externally with a tool like Python PIL after generation. (`mc designer text` is not yet implemented.)

**Character consistency:** Gemini has no memory between calls. For recurring characters, write a full physical description and include it verbatim in every panel prompt.
