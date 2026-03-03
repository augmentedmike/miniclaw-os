# mc-designer — Usage Guide

---

## How it works

Gemini generates images. mc-designer composes them into a layered canvas.

You cannot control Gemini's output resolution — it generates at whatever size it decides. What you control is how each layer is **sized and placed** on your canvas at composite time:

- **Background layer (z=0):** fills the canvas edge to edge, cover scaling
- **Element layers (z≥1):** you specify exact position (`--x --y`) and size (`--w --h`)

Every `gen` call creates a **new layer**. Layer names must be unique per canvas.

---

## Layer roles

| Role | What happens at composite | When to use |
|------|--------------------------|-------------|
| `background` | Scales to fill canvas (cover, no letterboxing) | Sky, gradient, scene, texture |
| `element` | Resized to `--w × --h`, placed at `--x, --y` | Logo, product, icon, badge, text art |

**The first layer defaults to `background`. All others default to `element` and require `--x --y --w --h`.**

---

## Commands

### Generate a background (z=0, fills canvas)

```bash
mc designer gen "prompt" --canvas <name>
# role=background is automatic for the first layer
```

### Generate an element (z≥1, sized + placed)

```bash
mc designer gen "prompt" --canvas <name> --layer <name> \
  --role element --x <px> --y <px> --w <px> --h <px>
```

`--x --y` = top-left corner of where the element sits on the canvas
`--w --h` = the size to render it at composite time (independent of Gemini's output size)

### Other commands

```bash
mc designer canvas new <name> --width <px> --height <px>
mc designer canvas list
mc designer canvas show <name>
mc designer canvas clear <name>    # remove all layers, keep canvas
mc designer canvas rm <name>       # delete canvas entirely

mc designer layer add <canvas> <file> --name <name> --role element --x <px> --y <px> --w <px> --h <px>
mc designer layer rm <canvas> <layer>
mc designer layer clear <canvas>   # remove all layers
mc designer layer toggle <canvas> <layer>
mc designer layer opacity <canvas> <layer> <0-100>
mc designer layer blend <canvas> <layer> normal|multiply|screen|overlay
mc designer layer rename <canvas> <layer> <newname>
mc designer layer mv <canvas> <layer> --z <index>

mc designer edit <canvas> <layer> "instructions"
mc designer composite <canvas> [--out <file>]
mc designer alpha strip <file>
mc designer stats [--full]
```

---

## Worked example — mobile hero + header

**Canvas: 390×844** (iPhone 14 viewport)

```
┌─────────────────────────────┐  ← 390px wide
│  [logo]        [nav icon]   │  ← header: ~80px tall
│                             │
│                             │
│     [headline text art]     │  ← center-ish
│                             │
│   [hero background image]   │  ← fills entire canvas
│                             │
│    [CTA button graphic]     │  ← bottom area
└─────────────────────────────┘
```

```bash
# 1. Create the canvas
mc designer canvas new mobile-hero --width 390 --height 844

# 2. Hero background — full bleed photo, fills 390×844 (auto role=background)
mc designer gen "golden hour cityscape, warm orange and pink sky, cinematic" \
  --canvas mobile-hero --layer bg

# 3. Dark overlay — semi-transparent layer to make text readable on top
mc designer gen "solid black rectangle" \
  --canvas mobile-hero --layer overlay --role element \
  --x 0 --y 0 --w 390 --h 844
mc designer layer opacity mobile-hero overlay 45

# 4. Logo — top-left, small, ~120×40px
mc designer gen "minimal wordmark 'ACME' in white, sans-serif, on black background" \
  --canvas mobile-hero --layer logo --role element \
  --x 24 --y 20 --w 120 --h 40

# 5. Nav icon — top-right, hamburger menu icon, ~32×32px
mc designer gen "three horizontal white lines hamburger menu icon on black background" \
  --canvas mobile-hero --layer nav --role element \
  --x 334 --y 24 --w 32 --h 32

# 6. Headline — center, large text art, ~320×120px
mc designer gen "bold white headline text 'Built for Speed' on black background" \
  --canvas mobile-hero --layer headline --role element \
  --x 35 --y 320 --w 320 --h 120

# 7. CTA button — bottom area, full width minus margins, ~342×52px
mc designer gen "rounded rectangle button, bright blue, white text 'Get Started'" \
  --canvas mobile-hero --layer cta --role element \
  --x 24 --y 720 --w 342 --h 52

# 8. Check the stack
mc designer canvas show mobile-hero
# z5  ✓  cta       role=element  342×52  at (24, 720)
# z4  ✓  headline  role=element  320×120 at (35, 320)
# z3  ✓  nav       role=element  32×32   at (334, 24)
# z2  ✓  logo      role=element  120×40  at (24, 20)
# z1  ✓  overlay   role=element  390×844 at (0, 0)  opacity=45%
# z0  ✓  bg        role=background (full bleed)

# 9. Composite
mc designer composite mobile-hero --out ~/Desktop/mobile-hero.png
```

After compositing, open the result and iterate:

```bash
# Regenerate a layer you don't like (remove old, gen new)
mc designer layer rm mobile-hero headline
mc designer gen "bold white headline 'Move Fast' large type on black background" \
  --canvas mobile-hero --layer headline --role element \
  --x 35 --y 300 --w 320 --h 140

# Edit a layer in place
mc designer edit mobile-hero bg "shift the sky to deeper purple and pink tones"

# Re-composite
mc designer composite mobile-hero --out ~/Desktop/mobile-hero-v2.png
```

---

## Prompting tips

### Background layers
Write what you'd describe to a photographer. The system appends fill instructions automatically.
```bash
# Good
"golden hour cityscape, warm orange sky, cinematic, wide"
"soft blue-to-white gradient, minimal, clean"
"dark textured concrete, subtle grain, moody"

# Avoid — these belong on separate element layers
"cityscape with a logo in the corner"
"gradient background with a button"
```

### Element layers
Ask for the subject on a solid background. The system appends isolation instructions automatically.
```bash
# Good — white or black bg makes compositing clean
"white ceramic mug, studio lighting, white background"
"minimal crab icon, black on white, flat vector style"
"rounded blue button, white text 'Start', clean"

# Avoid — context in the background defeats compositing
"mug on a wooden café table"
"logo with a gradient behind it"
```

### Text
Gemini handles simple, short text reasonably. Keep it short and specify font style:
```bash
"bold white sans-serif text 'ACME' on black background"
"headline 'Move Fast' large bold white type, black bg"
```
For precise typography, generate text as an element and use real font rendering (import via `layer add`).

---

## File locations

| What | Where |
|------|-------|
| Canvas metadata | `~/.openclaw/media/designer/canvases/<name>.json` |
| Layer images | `~/.openclaw/media/designer/layers/<canvas>/<layer-id>.png` |
| Composite output | `~/.openclaw/media/designer/output/<canvas>-<timestamp>.png` |
| Usage log | `~/.openclaw/media/designer/usage.jsonl` |
