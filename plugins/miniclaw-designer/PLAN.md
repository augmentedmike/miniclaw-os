# miniclaw-designer — PLAN

**Brain analog**: Occipital lobe (visual cortex in generative/imagination mode)
**Role**: Creates images. Seeing is handled by the LLM's multimodal vision. This plugin handles _creation_.

---

## Phases

### Phase 1 — Generation + Layers + Compositing ✅ (built)

- `designer gen <prompt>` — Gemini text-to-image, saved as canvas layer
- `designer edit <canvas> <layer> <instructions>` — Gemini image-to-image edit
- `designer canvas` — new / list / show / rm
- `designer layer` — add / rm / mv (z-index) / opacity / toggle / rename / blend
- `designer composite <canvas>` — flatten visible layers → PNG (via sharp)
- `designer alpha strip <file>` — strip background from image
- `designer stats [--full]` — usage summary + per-call log + estimated USD cost
- `before_prompt_build` hook — injects active canvas state into agent context

### Phase 2 — Advanced Transparency & Alpha (next)

- Inpainting: edit only a masked region of a layer via Gemini
- `designer alpha cut <canvas> <layer>` — interactive region selection → transparent cutout
- `designer alpha mask <canvas> <layer> <maskFile>` — apply a mask PNG to a layer's alpha channel
- Layer blending: proper blend mode math beyond sharp's built-in modes
- Background replacement: strip + infill with generated background

### Phase 3 — Persona & Tooling (next)

- Full "visual artist" system prompt injection when designer mode is active
- Agent tools (not just CLI): `generate_image`, `composite_canvas` as registered tools so the agent can call them autonomously
- Thumbnail previews: small base64 previews injected into context for agent reference
- Output-to-Telegram: send composited PNG directly to active Telegram channel session

### Phase 4 — Project Management

- Named "projects" wrapping multiple canvases (e.g. a brand kit)
- Export all canvases in a project as a zip
- Canvas history: undo/redo per layer (snapshot each operation)
- `designer diff <canvas>` — visual diff between two canvas snapshots

---

## Future: Photoshop-Style Filters

> **Not in code yet. Planned for a future phase.**

These map roughly to Photoshop's image adjustment panel:

| Filter | Description | Implementation approach |
|--------|-------------|------------------------|
| **Curves** | Adjust tone response per RGB channel | LUT (look-up table) applied via sharp `.linear()` or raw pixel ops |
| **Levels** | Black/white/mid point per channel | Remap input range to output range |
| **Hue/Saturation** | Shift hue, adjust saturation, lightness | Convert RGB→HSL, adjust, convert back |
| **Vibrance** | Boost muted colors more than saturated | Weighted saturation by existing saturation level |
| **Brightness/Contrast** | Global brightness + contrast | sharp `.modulate()` / `.linear()` |
| **Color Balance** | Shift shadows/midtones/highlights per channel | Zone-split + channel shift |
| **Exposure** | Stop-based exposure compensation | Multiply linear light by 2^stops |
| **Shadows/Highlights** | Local tone mapping | Unsharp-mask derived approach or LUT |
| **Noise Reduction** | Gaussian blur on noisy regions | sharp `.blur()` |
| **Sharpening** | Unsharp mask / clarity | sharp `.sharpen()` with radius/sigma |
| **Vignette** | Darken edges | Overlay a radial gradient mask |
| **Film Grain** | Add realistic grain | Perlin noise layer at low opacity |

Implementation note: most can be built on top of sharp's linear transformations,
channel operations, and compositing. For full LUT-based filters (like DaVinci Resolve–style
color grades), a 3D LUT file (.cube) can be loaded and applied pixel-by-pixel.
This is a significant effort — budget a separate phase for this.

---

## Architecture

```
miniclaw-designer/
├── index.ts              Plugin entry — CLI registration + before_prompt_build hook
├── PLAN.md               This file
├── docs/
│   └── SETUP.md          Normie-friendly API key setup guide
├── src/
│   ├── config.ts         Config resolution (apiKey, model, paths)
│   ├── types.ts          Layer, Canvas, UsageRecord interfaces
│   ├── store.ts          Canvas JSON persistence + usage/stats log
│   ├── gemini.ts         Gemini API client (generate + edit + token tracking)
│   └── composite.ts      sharp-based compositing + alpha operations
└── cli/
    └── commands.ts       All designer CLI commands
```

## Data Layout

```
~/.openclaw/media/designer/
├── canvases/
│   └── <name>.json       Canvas + layer stack (JSON)
├── layers/
│   └── <canvasName>/
│       └── <layerId>.png  Layer image files
├── output/
│   └── <name>-<ts>.png   Composite exports
└── usage.jsonl            Append-only usage log (one JSON record per line)
```

## Config (in openclaw.json)

```json
"miniclaw-designer": {
  "enabled": true,
  "config": {
    "apiKey": "<your-gemini-api-key>",
    "model": "gemini-2.0-flash-exp",
    "mediaDir": "~/.openclaw/media/designer",
    "defaultWidth": 1024,
    "defaultHeight": 1024
  }
}
```

## Gemini Model Notes

The image generation model in use is configured via `model` (default: `gemini-2.0-flash-exp`).
This is what the team refers to as **"Gemini nano banana v2"** — the Gemini 2.0 Flash
experimental model with `responseModalities: ["IMAGE"]` enabled.

Pricing (as of 2026-03):
- Input tokens:  $0.075 / 1M
- Output tokens: $0.30  / 1M
- Images:        ~$0.04 / image (estimate)
