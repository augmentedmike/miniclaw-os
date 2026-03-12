# mc-substack — Substack Publishing

mc-substack manages Substack drafts, image uploads, scheduling, and cross-posting via the Substack private API. It supports multiple publications from a single installation.

---

## Overview

The plugin authenticates using a `substack.sid` session cookie stored in the MiniClaw vault. It talks directly to the Substack API (`<subdomain>.substack.com/api/v1/`) for all operations — creating drafts, uploading images, editing Tiptap document bodies, and scheduling or publishing posts.

Multiple publications (e.g. primary account + "inner thoughts" newsletter) are supported via the `--publication` flag and the `publications` config map.

---

## CLI Commands

All commands use `openclaw mc-substack <subcommand>`. Most accept `-p, --publication <name>` for targeting a specific publication.

### `auth`
Store the Substack session cookie in the vault.

```
openclaw mc-substack auth [--publication <name>]
```

Prompts for the `substack.sid` cookie value from Chrome DevTools (Application > Cookies).

### `create-draft`
Create a new empty draft and print its ID.

```
openclaw mc-substack create-draft [--title <title>] [--subtitle <subtitle>] [-p <pub>]
```

### `list-drafts`
List draft posts.

```
openclaw mc-substack list-drafts [--limit <n>] [-p <pub>]
```

### `get-draft <id>`
Show draft details: title, subtitle, body length, publish status, schedule.

```
openclaw mc-substack get-draft 12345 [-p <pub>]
```

### `delete-draft [id]`
Delete a draft by ID, or use `--all` to delete all unpublished drafts.

```
openclaw mc-substack delete-draft 12345
openclaw mc-substack delete-draft --all [-p <pub>]
```

### `upload-image <file>`
Upload an image to the Substack CDN and print the URL.

```
openclaw mc-substack upload-image ~/Desktop/hero.jpg [-p <pub>]
```

### `add-image <draftId> <imageFile>`
Upload an image and insert it into a draft body.

```
openclaw mc-substack add-image 12345 ~/Desktop/hero.jpg [--after "paragraph text"] [-p <pub>]
```

### `set-title <draftId> <title>`
Update a draft's title and/or subtitle.

```
openclaw mc-substack set-title 12345 "New Title" [--subtitle "New Subtitle"] [-p <pub>]
```

### `schedule <draftId> <isoDateTime>`
Schedule a post for future publication.

```
openclaw mc-substack schedule 12345 2026-03-15T08:00:00-06:00 [-p <pub>]
```

### `insert-paragraph <draftId> <text>`
Insert a new paragraph into a draft body. Supports `**bold**` inline syntax.

```
openclaw mc-substack insert-paragraph 12345 "This is **important** text" [--after "existing text"] [-p <pub>]
```

### `patch-text <draftId> <search> <replace>`
Find and replace text in a draft body.

```
openclaw mc-substack patch-text 12345 "old text" "new text" [-p <pub>]
```

### `copy-images <fromId> <toId>`
Copy `captionedImage` nodes from one draft to another (no re-upload).

```
openclaw mc-substack copy-images 11111 22222 [-p <pub>]
```

### `post-comic`
Full workflow: create, populate, and schedule a comic cross-post.

```
openclaw mc-substack post-comic \
  --title "EP.001 -- The Night" \
  --subtitle "A comic" \
  --image "https://cdn.example.com/hero.jpg" \
  --blog-url "https://blog.helloam.bot/001" \
  --blog-date 2026-03-01 \
  [--ep 001] [--schedule <iso>] [-p <pub>]
```

Default schedule: blog date + 7 days at 08:00 CT. If the date is in the past, publishes immediately.

---

## Agent Tools

mc-substack does not currently register agent tools. All operations are CLI-only.

---

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `subdomain` | string | `augmentedmike` | Primary Substack subdomain |
| `vaultBin` | string | `$HOME/.openclaw/miniclaw/system/bin/miniclaw-vault` | Path to the vault binary |
| `publications` | object | — | Named publications map (see below) |

### Multiple publications

```json
{
  "publications": {
    "inner-thoughts": {
      "subdomain": "augmentedmike-inner",
      "vaultKey": "substack-sid-inner"
    }
  }
}
```

Each publication stores its own `substack.sid` cookie under a separate vault key.

---

## Authentication

1. Log in to Substack in Chrome
2. Open DevTools > Application > Cookies > `<subdomain>.substack.com`
3. Copy the `substack.sid` value
4. Run `openclaw mc-substack auth` and paste it
5. The cookie is stored in the vault under `substack-sid` (or the publication's `vaultKey`)
