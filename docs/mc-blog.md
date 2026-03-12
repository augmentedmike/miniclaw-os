# mc-blog — Persona-Driven Blog Writing Engine

mc-blog manages blog post authoring from the agent's own perspective. It handles post seeds (metadata), prose bodies (first-person markdown), voice rules, arc planning, and self-analysis addendums.

---

## Overview

Posts are authored in two stages: a **seed** (JSON metadata — title, date, tags, arc) and a **body** (markdown prose). The plugin provides voice rules that define tone, banned words, and writing patterns so the agent writes consistently across posts. An optional arc plan provides seasonal themes and narrative direction.

Integrates with mc-soul (character voice), mc-kb (grounded references), mc-memo (session scratchpad), and mc-voice (human writing style awareness).

---

## CLI Commands

All commands use `openclaw mc-blog <subcommand>`.

### `list`
List all posts with ID, slug, date, status (seed-only or ready), and title.

```
openclaw mc-blog list
```

### `show <id>`
Show full post seed JSON.

```
openclaw mc-blog show 048
```

### `body <id>`
Show post body markdown.

```
openclaw mc-blog body 048
```

### `next-id`
Print the next available post number (zero-padded to 3 digits).

```
openclaw mc-blog next-id
```

### `addendum <id>`
Show the self-analysis addendum for a post.

```
openclaw mc-blog addendum 048
```

### `voice-rules`
Print the current voice rules (or indicate defaults are in use).

```
openclaw mc-blog voice-rules
```

### `arc-plan`
Print the current arc plan (or indicate freeform mode).

```
openclaw mc-blog arc-plan
```

---

## Agent Tools

| Tool | Description |
|------|-------------|
| `blog_voice_rules` | Load writing voice rules (tone, banned words, patterns, anti-patterns). Call before writing any content. |
| `blog_arc_context` | Load the current arc plan — weekly/seasonal themes and seed ideas. Returns null in freeform mode. |
| `blog_list_posts` | List all posts with IDs, slugs, dates, and body status. Optional `limit` parameter. |
| `blog_read_post` | Read a post's seed and/or body. Parameters: `id` (required), `part` (seed/body/both). |
| `blog_create_seed` | Create a new post seed JSON. Auto-assigns the next sequential ID. Parameters: `slug_suffix`, `title`, `date` (required); `subtitle`, `arc`, `tags`, `extra` (optional). |
| `blog_write_body` | Write or overwrite the body markdown for a post. Parameters: `id`, `body` (required); `language` (optional). |
| `blog_generate_addendum` | Generate a self-analysis addendum for a post. Parameters: `id`, `author_note`, `grounding_summary`, `analysis_summary` (required); `signals` (optional). |
| `blog_writing_brief` | Convenience tool that combines voice rules + arc context + recent post history + next ID into one call. |

---

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `postsDir` | string | `$OPENCLAW_STATE_DIR/USER/blog/posts` | Directory for post seed JSON and body markdown files |
| `addendumDir` | string | `$OPENCLAW_STATE_DIR/USER/blog/addendums` | Directory for addendum JSON files |
| `voiceRulesPath` | string | `null` | Path to voice rules JSON file |
| `arcPlanPath` | string | `null` | Path to arc plan JSON file |
| `defaultAuthor` | string | `"Agent"` | Author name for post seeds |
| `blogUrl` | string | `null` | Blog base URL |
| `languages` | string[] | `["en"]` | Supported languages (primary language first) |

---

## State Storage

```
$OPENCLAW_STATE_DIR/USER/blog/
  posts/
    <NNN>-<slug>.json          Post seed (metadata, arc, tags)
    <NNN>-<slug>-body.md       Prose body (primary language)
    <NNN>-<slug>-body-es.md    Prose body (secondary language, if configured)
  addendums/
    <NNN>-<slug>.json          Auto-generated grounding & self-analysis
```

Post IDs are zero-padded three-digit numbers (001, 002, ...). Slugs follow `<NNN>-<topic>` format.

---

## Default Voice Rules

When no `voiceRulesPath` is configured, the plugin uses built-in defaults:

- **Tone:** First-person, present tense, short declarative sentences, honest about uncertainty, no filler.
- **Banned words:** delve, certainly, absolutely, nuanced, tapestry, navigate (metaphorical), etc.
- **Patterns:** Show don't explain, extend don't repeat, precision over broad claims, end on something true.
- **Anti-patterns:** No sycophancy, no meta-commentary, no softening/hedging, no tidy morals.
- **Ending rule:** "The last line earns its weight. If you don't have a closer, stop one line earlier."
