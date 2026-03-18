# mc-designer — Occipital Lobe

The occipital lobe is the brain's visual cortex — it processes what you see, builds spatial understanding, and generates mental imagery.

AI agents are naturally text-first. They can describe a design, critique an image, or write code that produces visuals — but they can't *make* images directly. When visual output is needed, a human has to step in.

**mc-designer gives openclaw an occipital lobe.**

It connects the agent to Gemini's image generation capabilities and adds a full layered canvas system. The agent can generate images from prompts, edit existing images, manage layers with z-index ordering, composite them together, and strip backgrounds — all without human intervention.

Think Photoshop layers, but driven by natural language and automated.

## What changes

**Without mc-designer:** the agent describes what an image should look like and asks you to make it. Visual work requires a human in the loop for every step.

**With mc-designer:** the agent generates, edits, and composites images autonomously. It can produce assets for a project, iterate on designs, and deliver finished visual output directly.

## Commands

```bash
mc designer gen "a clean product hero shot on white background"
mc designer edit <layer> "make the background darker"
mc designer canvas create --name homepage --width 1920 --height 1080
mc designer layer list <canvas>
mc designer composite <canvas> --output final.png
mc designer alpha <layer>        # strip background
mc designer stats                # usage + cost summary
mc designer stats --full         # full call log
```

## Layers and compositing

Each canvas has ordered layers. Layers are generated or imported images stacked by z-index. When you composite, they're flattened top-to-bottom into a single output image.

```
canvas: homepage
  layer 0 (background)  z=0
  layer 1 (product)     z=1
  layer 2 (logo)        z=2
         ↓ composite
  homepage-final.png
```

## Config

| Key | Default | Description |
|-----|---------|-------------|
| `apiKey` | `""` | Gemini API key — see [SETUP.md](./SETUP.md) |
| `model` | `gemini-3.1-flash-image-preview` | Gemini model to use |
| `mediaDir` | `~/.openclaw/media/designer` | Where generated images are stored |
| `defaultWidth` | `1024` | Default canvas width |
| `defaultHeight` | `1024` | Default canvas height |

For API key setup, see [SETUP.md](./SETUP.md).
