# mc-designer — Usage Guide

---

## How image generation actually works

Gemini generates images at its own internal resolution — you cannot control the exact pixel output dimensions. What you can control is:

- **What to generate** (the prompt)
- **The role of the layer** — background (fills canvas) or element (natural size, placed at x,y)
- **Where to place it** (x/y offset for element layers)

mc-designer automatically appends canvas context to every prompt so Gemini knows what role the image plays. You write the creative brief; the plugin handles the technical framing.

---

## Layer roles

Every layer has a role that controls how it's composited:

| Role | Behaviour | Use for |
|------|-----------|---------|
| `background` | Scaled to fill canvas edge to edge (cover) | Sky, gradient, texture, scene backdrop |
| `element` | Kept at natural size, placed at x/y offset | Logo, product, person, text overlay |

**The first layer on a canvas defaults to `background`. All subsequent layers default to `element`.** Override with `--role`.

---

## Generating images

```bash
mc designer gen "blue gradient sky, wide and cinematic" --canvas homepage
```

Because this is the first layer, it gets `role=background` automatically. The prompt Gemini actually receives includes:

> *Fill the entire frame edge to edge with no borders, letterboxing, or whitespace. Target aspect ratio 1.00 (1024×1024 pixels). Do not include any UI elements, text, or foreground subjects.*

```bash
mc designer gen "bold sans-serif wordmark 'ACME' in black" --canvas homepage --layer logo
```

Because this is not z=0, it gets `role=element` automatically. Gemini is told:

> *Place the subject centered on a plain white background with clean, well-defined edges. No drop shadows or environmental context.*

**Override role explicitly:**

```bash
mc designer gen "dark semi-transparent overlay" --canvas homepage --role background
mc designer gen "circular product badge" --canvas homepage --role element --x 860 --y 400
```

---

## What makes a good prompt for each role

### Background layers

Tell Gemini the subject, mood, and fill behaviour. It does not need to know about other layers.

```bash
# Works well
mc designer gen "soft blue-to-white gradient, minimal, clean" --canvas hero
mc designer gen "dark textured concrete wall, subtle grain" --canvas card
mc designer gen "aerial ocean view, deep teal water, sunny day" --canvas banner

# Avoid — will confuse compositing
mc designer gen "sky with a logo in the corner"   # logo belongs on its own layer
mc designer gen "product hero shot with background"  # split these into two layers
```

### Element layers

Tell Gemini exactly what the subject is. Ask for a clean white background — this makes alpha stripping work when you need it.

```bash
# Works well
mc designer gen "white ceramic coffee mug, studio lighting, white background" --canvas hero --layer product
mc designer gen "minimal line icon of a crab, black on white, vector style" --canvas icon --layer subject
mc designer gen "bold wordmark 'ACME' in Helvetica-style sans-serif, black text on white" --canvas brand --layer logo

# Avoid
mc designer gen "coffee mug on a wooden table"   # the table will be in the image
mc designer gen "a logo with a gradient background"  # makes alpha stripping impossible
```

---

## Positioning element layers

Element layers are placed at pixel coordinates relative to the top-left of the canvas. At generation time:

```bash
# Generate centered at roughly 860,400 on a 1920×1080 canvas
mc designer gen "circular badge, red, 'SALE'" \
  --canvas homepage --layer badge --role element --x 860 --y 400
```

After generation, reposition an existing layer:

```bash
mc designer layer mv homepage badge --z 3    # change stack order
```

*(x/y repositioning after the fact requires editing the canvas JSON directly — layer move is z-index only. Set x/y at generation time.)*

---

## Canvas setup

```bash
# Create a canvas at specific dimensions
mc designer canvas new homepage --width 1920 --height 1080

# List canvases
mc designer canvas list

# Inspect layer stack (top to bottom)
mc designer canvas show homepage
```

`canvas show` output:
```
Canvas: homepage  1920×1080  (2 layers)
  z1  ✓  logo      opacity=100%  blend=normal  role=element
       prompt: "bold wordmark 'ACME' in black on white"
  z0  ✓  bg        opacity=100%  blend=normal  role=background
       prompt: "soft blue-to-white gradient, minimal, clean"
```

---

## Layer management

```bash
# Show/hide
mc designer layer toggle homepage logo

# Opacity (0–100)
mc designer layer opacity homepage logo 80

# Blend modes: normal | multiply | screen | overlay
mc designer layer blend homepage logo multiply

# Rename
mc designer layer rename homepage layer-1 background

# Remove
mc designer layer rm homepage logo

# Import your own image as a layer
mc designer layer add homepage ./my-logo.png --name logo --role element --x 100 --y 50
mc designer layer add homepage ./bg-texture.png --name texture --role background
```

---

## Editing a layer

Sends the current layer image back to Gemini with new instructions. Replaces the layer in place.

```bash
mc designer edit homepage bg "shift the gradient to warmer tones, more orange"
mc designer edit homepage logo "make the text heavier, increase contrast"
```

Edit works best for adjustments. For significant changes (different subject, different layout), generate a new layer instead.

---

## Compositing

Flattens all visible layers in z-order into a single PNG:

```bash
mc designer composite homepage
mc designer composite homepage --out ~/Desktop/homepage-final.png
```

- Background layers (role=background) fill the canvas with cover scaling
- Element layers (role=element) are placed at their natural size at x/y
- Hidden layers are skipped
- Opacity and blend mode are applied per layer

---

## Alpha stripping (background removal)

Removes the white background from an element layer image so it composites cleanly:

```bash
mc designer alpha strip ~/.openclaw/media/designer/layers/homepage/layer-1234567890.png
# outputs: layer-1234567890.nobg.png
```

> **Current limitation:** this is a basic alpha conversion, not AI segmentation. It works well on elements generated with a clean white background (as the element prompt instructs). For complex subjects with similar-toned backgrounds, results will be imperfect.

After stripping, re-add the .nobg.png as a new layer to replace the original.

---

## Usage and costs

```bash
mc designer stats           # summary
mc designer stats --full    # per-call breakdown
```

---

## Full worked example

```bash
# 1. Create a 1920×1080 homepage canvas
mc designer canvas new homepage --width 1920 --height 1080

# 2. Generate the background (auto role=background, fills canvas)
mc designer gen "soft gradient, pale blue top to white bottom, minimal" \
  --canvas homepage --layer bg

# 3. Generate the product (auto role=element, white background for clean edges)
mc designer gen "white ceramic coffee mug, studio lighting, white background, centered" \
  --canvas homepage --layer product --x 760 --y 300

# 4. Import your own logo
mc designer layer add homepage ./logo.png --name logo --role element --x 80 --y 60

# 5. Check the stack
mc designer canvas show homepage

# 6. Adjust product opacity
mc designer layer opacity homepage product 95

# 7. Composite
mc designer composite homepage --out ~/Desktop/homepage-v1.png
```

---

## File locations

| What | Where |
|------|-------|
| Canvas metadata | `~/.openclaw/media/designer/canvases/<name>.json` |
| Layer images | `~/.openclaw/media/designer/layers/<canvas>/<layer-id>.png` |
| Composite output | `~/.openclaw/media/designer/output/<canvas>-<timestamp>.png` |
| Usage log | `~/.openclaw/media/designer/usage.jsonl` |
