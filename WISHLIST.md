# MiniClaw Wishlist

Planned plugins and features that don't exist yet.

---

## mc-comics — AI Comic Strip Generator

Wrap [comic-cli](https://github.com/augmentedmike/comic-cli) as a MiniClaw plugin. Generate comic book panels, pages, and blog posts using Gemini with reference-image likeness matching and multilingual caption rendering.

**What it would do:**
- Generate single expression frames from 57+ built-in expressions
- Build multi-panel comic pages from scene JSON or freeform notes
- Full blog pipeline: notes → panels → composited pages → HTML post
- Multilingual support — art generated once, captions translated and composited per locale (EN, ES, FR, etc.)
- 18 built-in page layouts (splash, grid, cinematic spreads)
- 4 built-in art styles: ligne-claire, noir-comic, manga, retro
- Visual QA via Gemini vision + pixel-level checks
- Integrates with mc-blog and mc-substack for publishing

**Example commands:**
```bash
mc comics frame happy
mc comics frame --prompt "lightbulb moment, eyes wide"
mc comics page --scenes story.json --locale en,es
mc comics blog --notes day.md --title "My Monday" --style noir-comic
mc comics qa page.png
```

**Based on:** [augmentedmike/comic-cli](https://github.com/augmentedmike/comic-cli)
