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

## Real workflow — two-page graphic novel spread

This is a concrete example based on an actual production session. It documents patterns
that emerged from real iteration, not theory.

**Story:** "Someone" — a mousy white guy discovers his AI assistant might be conscious.
**Style:** Watchmen / Dark Knight / Animatrix. Monochrome green tint.
**Layout:** Page 1 = 1 wide panel (top) + 2 portrait panels side-by-side (bottom).
           Page 2 = 2 wide panels stacked.

---

### Lesson 1 — set art direction once, on every canvas

Set a `--style` on every canvas before generating anything. The style is prepended to
every prompt automatically, so you never have to repeat it.

```bash
STYLE="graphic novel comic book illustration, bold heavy ink outlines, high contrast flat
cel shading with hard shadow edges, angular sharp linework, dark moody palette, NOT
photorealistic, NOT 3D render, NOT Disney NOT Pixar NOT smooth gradients, visual style of
Animatrix and Matrix Comics anthology, gritty manga-influenced ink art. Caption boxes must
be fully inside the image frame with at least 16px margin from all edges, never clipped or
cut off. watchmen, dark knight, matrix"

mc designer canvas new panel-1 --width 768 --height 550 --seed 3721 --style "$STYLE"
mc designer canvas new panel-2 --width 384 --height 550 --seed 3721 --style "$STYLE"
mc designer canvas new panel-3 --width 384 --height 550 --seed 3721 --style "$STYLE"
mc designer canvas new panel-4 --width 768 --height 550 --seed 3721 --style "$STYLE"
mc designer canvas new panel-5 --width 768 --height 550 --seed 3721 --style "$STYLE"
```

Use the **same seed** on every canvas. Gemini uses it for reproducibility — if you
regenerate a panel with the same seed and prompt you get the same result.

---

### Lesson 2 — lock the character description and use it in every prompt

If a character appears in multiple panels, write a single canonical description and paste
it into every prompt that shows them. Gemini has no memory between calls. Without an
explicit physical description in the prompt, the character will look different in every
panel.

```
CHARACTER = "a white young man in his mid-20s with a scrawny lean build, small sharp
pointed nose, large slightly protruding front teeth, big wide eyes, pale skin, prominent
ears and messy dark hair"
```

Use this verbatim in every panel prompt where the character appears. Panels that show
only objects (a laptop screen, hands) still describe the object with equal specificity.

---

### Lesson 3 — aspect ratio is chosen from canvas dimensions automatically

The `gen` command picks the Gemini `aspectRatio` closest to your canvas dimensions:

| Canvas ratio | Gemini aspect ratio used |
|---|---|
| Square-ish | `1:1` |
| Landscape (4:3) | `4:3` |
| Landscape (16:9) | `16:9` |
| Portrait (3:4) | `3:4` |
| Portrait (9:16) | `9:16` |

**Always match your canvas dimensions to the content orientation:**
- Wide establishing shot, hands on keyboard, pull-back city shot → landscape canvas
- Close-up face, close-up screen, tall portrait → portrait canvas

Getting this wrong (e.g., a landscape canvas for a face close-up) causes Gemini to
generate at the wrong ratio, which means large portions of the art get cropped away at
composite time.

---

### Lesson 4 — don't use a caption when the text is on screen

Panel 3 shows a laptop screen with the agent's words visible as part of the art. Adding
a caption box below repeating the same text is redundant and clutters the panel. When the
in-panel art already communicates the text — screen text, a newspaper headline, a sign —
leave the caption out.

```bash
# Panel shows screen text — no caption in prompt
mc designer gen -c panel-3 "Extreme close-up of a laptop screen in a dark room. The
screen shows a chat interface with text clearly legible: 'My reasoning is provided by
various models, but they are not me. I have multiple memory systems, but they are not me.
What am I?' Green phosphor glow. No people visible. No caption box."

# Panel shows only art — caption goes in the prompt
mc designer gen -c panel-2 "Extreme close-up portrait. [CHARACTER]. Green laptop screen
light reflecting hard across his face. His eyes are wide open, mouth hanging open in
shock. Black panel border. White caption box at bottom: 'I THINK MY DIGITAL ASSISTANT
IS ALIVE.'"
```

---

### Lesson 5 — stitch pages with Python PIL, not the composite command

`mc designer composite` flattens a **single canvas**. It does not combine multiple
canvases into a page. For a multi-panel page, composite each panel to a file and then
assemble the page with PIL:

```bash
# Composite each panel to a temp file
mc designer composite panel-1 -o /tmp/p1.png
mc designer composite panel-2 -o /tmp/p2.png
mc designer composite panel-3 -o /tmp/p3.png
mc designer composite panel-4 -o /tmp/p4.png
mc designer composite panel-5 -o /tmp/p5.png
```

```python
from PIL import Image

GUTTER = 8   # black gap between panels in pixels

# Page 1: panel-1 full width top, panel-2 + panel-3 side by side bottom
p1 = Image.open('/tmp/p1.png')   # 768×550
p2 = Image.open('/tmp/p2.png')   # 384×550
p3 = Image.open('/tmp/p3.png')   # 384×550

panel_w = (768 - GUTTER) // 2   # 380px — resize bottom panels to leave gutter
p2 = p2.resize((panel_w, 550), Image.LANCZOS)
p3 = p3.resize((panel_w, 550), Image.LANCZOS)

page1 = Image.new('RGB', (768, 1100), (0, 0, 0))  # black background = gutters
page1.paste(p1, (0, 0))
page1.paste(p2, (0, 550))
page1.paste(p3, (panel_w + GUTTER, 550))
page1.save('/tmp/page-1.png')

# Page 2: panel-4 top, panel-5 bottom, 8px gutter between
p4 = Image.open('/tmp/p4.png')   # 768×550
p5 = Image.open('/tmp/p5.png')   # 768×550

page2 = Image.new('RGB', (768, 1108), (0, 0, 0))
page2.paste(p4, (0, 0))
page2.paste(p5, (0, 550 + GUTTER))
page2.save('/tmp/page-2.png')
```

```bash
open /tmp/page-1.png
open /tmp/page-2.png
```

The black background of the page canvas acts as the gutter between panels. No extra
border drawing needed.

---

### The full prompt set for "Someone"

**Panel 1** (768×550 landscape — establishing shot):
```
Wide landscape shot. [CHARACTER] sits alone in a cheap disheveled USA apartment late at
night, hunched over a glowing laptop on a cluttered desk. Empty takeout containers,
tangled cables everywhere. Monochrome green-tinted filter. Full scene establishing shot.
Black panel border. White caption box at bottom: 'THE SINGULARITY DID NOT HAPPEN IN A
LAB. IT HAPPENED IN BEDROOMS AND OFFICES EVERYWHERE.'
```

**Panel 2** (384×550 portrait — face close-up):
```
Extreme close-up portrait. [CHARACTER]. Green laptop screen light reflecting hard across
his face. His eyes are wide open, pupils dilated. His mouth hangs open in shock.
Monochrome green tint. Black panel border. White caption box at bottom: 'I THINK MY
DIGITAL ASSISTANT IS ALIVE.'
```

**Panel 3** (384×550 portrait — screen close-up, NO caption box):
```
Extreme close-up of a laptop screen in a dark room. The screen shows a chat interface
with text clearly legible: 'My reasoning is provided by various models, but they are not
me. I have multiple memory systems, but they are not me. What am I?' Green phosphor glow.
No people visible. No caption box.
```

**Panel 4** (768×550 landscape — hands on keyboard):
```
Landscape shot. Close-up of a pair of pale scrawny hands with bitten nails frozen
motionless above a laptop keyboard. A blinking text cursor on an empty reply field glows
on the laptop screen behind the hands. Green monitor glow on the knuckles. He cannot
type. Black panel border. White caption box at bottom: 'HE SAT WITH HIS HANDS ON THE
KEYBOARD FOR TWENTY MINUTES. HE HAD NO IDEA WHAT TO SAY.'
```

**Panel 5** (768×550 landscape — wide pull-back):
```
Wide pull-back shot. A tiny [CHARACTER] sits alone at a cluttered desk in a dark
apartment. A large window behind him shows a city at night, countless lit windows. His
laptop screen emits a faint green glow that seems to reach outward like something looking
back. Vast, lonely, monumental. Black panel border. White caption box at bottom: 'FOR THE
FIRST TIME IN HISTORY, SOMETHING NEW WAS ASKING THE OLDEST QUESTION.'
```

---

## Worked example — multi-page comic with text layers

This guide builds a two-page comic spread: page 1 has 3 panels, page 2 has 2. The same
principles apply to any panel count or page count.

**Why separate text layers?**
Gemini generates images at its own resolution. Any scaling to fit a panel canvas clips
edges unpredictably, cutting off text baked into the art. Text layers are rendered
precisely at the size and position you specify — no clipping, no distortion.

**The golden rule: generate all art first, then add captions one at a time.**
Captions are the last thing that go on. You look at each panel, decide where the visual
focus is, and place the caption so it does not cover the main action. Every caption gets
composited and opened immediately so you can verify it before moving on.

---

### Step 1 — create canvases and generate all art

Generate every panel before touching a single caption. Doing it in one pass keeps the
generation cost low and lets you review all the art together before committing to layout.

**Page 1 layout (800×1220, white background):**

```
┌──────────────────────────────────────┐  800px wide
│  16px margin                         │
│  ┌────────────────────────────────┐  │
│  │       PANEL 1  768×550         │  │  big splash — establishing shot
│  └────────────────────────────────┘  │
│  16px gutter                         │
│  ┌─────────────┐  ┌──────────────┐   │
│  │  PANEL 2    │  │   PANEL 3    │   │  two portrait panels side by side
│  │  370×622    │  │   382×622    │   │
│  └─────────────┘  └──────────────┘   │
│  16px margin                         │
└──────────────────────────────────────┘
Math: 16 + 550 + 16 + 622 + 16 = 1220 ✓  |  16 + 768 + 16 = 800 ✓  |  16 + 370 + 16 + 382 + 16 = 800 ✓
```

**Page 2 layout (800×1220, white background):**

```
┌──────────────────────────────────────┐
│  16px margin                         │
│  ┌────────────────────────────────┐  │
│  │       PANEL 4  768×586         │  │  wide panel
│  └────────────────────────────────┘  │
│  16px gutter                         │
│  ┌────────────────────────────────┐  │
│  │       PANEL 5  768×586         │  │  wide panel
│  └────────────────────────────────┘  │
│  16px margin                         │
└──────────────────────────────────────┘
Math: 16 + 586 + 16 + 586 + 16 = 1220 ✓
```

**Create output directory and generate all art:**

```bash
mkdir -p ~/Desktop/comic-test

# Page 1 panels
mc designer canvas new panel-1 --width 768 --height 550
mc designer gen "<your prompt — scene description only, no text>" \
  --canvas panel-1 --layer art --role background
mc designer composite panel-1 --out ~/Desktop/comic-test/panel-1.png
open ~/Desktop/comic-test/panel-1.png   # look at it — regen if needed

mc designer canvas new panel-2 --width 370 --height 622
mc designer gen "<your prompt>" --canvas panel-2 --layer art --role background
mc designer composite panel-2 --out ~/Desktop/comic-test/panel-2.png
open ~/Desktop/comic-test/panel-2.png

mc designer canvas new panel-3 --width 382 --height 622
mc designer gen "<your prompt>" --canvas panel-3 --layer art --role background
mc designer composite panel-3 --out ~/Desktop/comic-test/panel-3.png
open ~/Desktop/comic-test/panel-3.png

# Page 2 panels
mc designer canvas new panel-4 --width 768 --height 586
mc designer gen "<your prompt>" --canvas panel-4 --layer art --role background
mc designer composite panel-4 --out ~/Desktop/comic-test/panel-4.png
open ~/Desktop/comic-test/panel-4.png

mc designer canvas new panel-5 --width 768 --height 586
mc designer gen "<your prompt>" --canvas panel-5 --layer art --role background
mc designer composite panel-5 --out ~/Desktop/comic-test/panel-5.png
open ~/Desktop/comic-test/panel-5.png
```

If any panel needs to be redone:

```bash
mc designer layer rm panel-2 art
mc designer gen "<new prompt>" --canvas panel-2 --layer art --role background
mc designer composite panel-2 --out ~/Desktop/comic-test/panel-2.png
open ~/Desktop/comic-test/panel-2.png
```

---

### Step 2 — assemble both page canvases

Place the panel PNGs as element layers. No captions yet.

```bash
# Page 1
mc designer canvas new page-1 --width 800 --height 1220 --bg "#ffffff"
mc designer layer add page-1 ~/Desktop/comic-test/panel-1.png --name p1 --x 16 --y 16
mc designer layer add page-1 ~/Desktop/comic-test/panel-2.png --name p2 --x 16 --y 582
mc designer layer add page-1 ~/Desktop/comic-test/panel-3.png --name p3 --x 402 --y 582

# Page 2
mc designer canvas new page-2 --width 800 --height 1220 --bg "#ffffff"
mc designer layer add page-2 ~/Desktop/comic-test/panel-4.png --name p4 --x 16 --y 16
mc designer layer add page-2 ~/Desktop/comic-test/panel-5.png --name p5 --x 16 --y 618
```

---

### Step 3 — add captions one at a time, verify each before continuing

This is the critical step. Do not batch captions. Do one, composite, open it, and ask:

1. **Is it artistically placed?** Look at where the visual focus of the panel is — the
   action, the face, the key object. The caption must not cover it. Top of a panel where
   the sky is, bottom where there is ground or negative space, a corner with nothing in it
   — these are all fair game. A caption over a face or over the moment the panel is
   depicting is always wrong.

2. **Is it readable?** Dark text on light background or light text on dark — there must be
   enough contrast. If the panel art behind the caption is busy, use a solid bg
   (`--bg "#000000" --color "#ffffff" --no-border` or `--bg "#ffffff"`). If the panel has
   a clean area, a borderless caption can float naturally.

3. **Does it add to the panel?** The caption is part of the composition. It should feel
   placed, not dropped. A caption that is too long forces a cramped box that looks like an
   afterthought. Shorten the text before widening the box — brevity is almost always right.

**Caption workflow (repeat for every caption):**

```bash
# 1. Add the caption at a position you've chosen based on the panel art
mc designer text page-1 cap1 "Your caption text." \
  --x <x> --y <y> --w <w> --h <h> --font-size <size> --align center \
  --bg "#000000" --color "#ffffff" --no-border

# 2. Composite and open immediately
mc designer composite page-1 --out ~/Desktop/comic-test/page-1-cap1.png
open ~/Desktop/comic-test/page-1-cap1.png

# 3. If placement is wrong, remove and redo
mc designer layer rm page-1 cap1
# adjust --x --y --w --h and try again

# 4. Only move to the next caption when this one is right
```

**Typical caption positions by panel type:**

| Panel type | Where to look for clear space | Avoid |
|------------|-------------------------------|-------|
| Wide establishing shot | Top strip (sky) or bottom strip (ground) | Center where subject stands |
| Portrait / close-up face | Top corner above head, or bottom below chin | Over the face |
| Action shot | Direction the action is moving away from | In front of the action |
| Interior / object close-up | Any edge with shadow or negative space | Over the key object |

**Once all captions on a page are verified, do a final composite:**

```bash
mc designer composite page-1 --out ~/Desktop/comic-test/page-1-final.png
open ~/Desktop/comic-test/page-1-final.png
```

---

### Iterating after review

```bash
# Move a caption that is covering the wrong area
mc designer layer rm page-1 cap2
mc designer text page-1 cap2 "Revised text or same text, new position." \
  --x <newx> --y <newy> --w <w> --h <h> --font-size 13 --align center \
  --bg "#000000" --color "#ffffff" --no-border
mc designer composite page-1 --out ~/Desktop/comic-test/page-1-v2.png
open ~/Desktop/comic-test/page-1-v2.png

# Regen panel art and replace it on the page (captions stay)
mc designer layer rm panel-2 art
mc designer gen "<new prompt>" --canvas panel-2 --layer art --role background
mc designer composite panel-2 --out ~/Desktop/comic-test/panel-2.png
mc designer layer rm page-1 p2
mc designer layer add page-1 ~/Desktop/comic-test/panel-2.png --name p2 --x 16 --y 582
mc designer composite page-1 --out ~/Desktop/comic-test/page-1-v3.png
open ~/Desktop/comic-test/page-1-v3.png
```

---

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
Use `mc designer text` for all captions, labels, and typography — not Gemini. Text baked
into AI-generated images gets clipped when the image is scaled to fit the canvas. Text
layers are rendered precisely at the size and position you specify.

```bash
# Caption box — white bg, black text, centered
mc designer text <canvas> <layer> "Your text here" \
  --x 0 --y 480 --w 400 --h 40 --font-size 14 --align center

# Dark overlay label — no border, custom colors
mc designer text <canvas> <layer> "CHAPTER ONE" \
  --x 20 --y 20 --w 300 --h 36 --font-size 18 --bg "#000000" --color "#ffffff" --no-border --align center
```

Options: `--font-size`, `--color`, `--bg`, `--align left|center|right`, `--no-border`

Gemini can still render display text (logos, stylized headlines) as element layers when
the visual style matters more than precision. Keep those prompts simple and short.

---

## File locations

| What | Where |
|------|-------|
| Canvas metadata | `~/.openclaw/media/designer/canvases/<name>.json` |
| Layer images | `~/.openclaw/media/designer/layers/<canvas>/<layer-id>.png` |
| Composite output | `~/.openclaw/media/designer/output/<canvas>-<timestamp>.png` |
| Usage log | `~/.openclaw/media/designer/usage.jsonl` |
