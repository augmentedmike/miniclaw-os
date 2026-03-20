# mc-memory

> Unified memory gateway — smart routing, unified recall, and memo-to-KB promotion.

## Overview

mc-memory provides a single interface over three memory stores: mc-kb (long-term knowledge base),
mc-memo (card-scoped memos), and episodic memory (daily observations). It auto-routes writes to the
appropriate store, searches all stores with a single query, and promotes short-term memories to
permanent KB entries. Relevant memories are injected before each prompt via the `before_prompt_build` hook.

## Installation

```bash
cd ~/.openclaw/miniclaw/plugins/mc-memory
npm install
npm run build
```

### Prerequisites

- mc-kb plugin installed (provides SQLite + vector search backend)
- Embedding model GGUF file (auto-downloaded on first use)

## CLI Usage

```bash
# Write to memory (auto-routes to memo/kb/episodic)
openclaw mc-memory write "content here" [--card ID] [--force memo|kb|episodic] [--source SRC]

# Search all memory stores
openclaw mc-memory recall "query" [--card ID] [-n COUNT] [--days DAYS] [--type TYPE] [--tag TAG] [--json]

# List episodic memory entries
openclaw mc-memory list [--days DAYS] [--page N] [--limit N] [--json]

# Promote memo or episodic entry to KB
openclaw mc-memory promote --content TEXT --from memo|episodic --ref ID|DATE [--title T] [--type T] [--tags TAGS]
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `write` | Write to memory with auto-routing | `openclaw mc-memory write "Next.js 14 requires Node 18+" --force kb` |
| `recall` | Search all memory stores | `openclaw mc-memory recall "database migration" -n 5` |
| `list` | List episodic memory entries | `openclaw mc-memory list --days 3` |
| `promote` | Promote to permanent KB entry | `openclaw mc-memory promote --content "..." --from memo --ref crd_abc123` |

## Tool API

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `memory_write` | Write with auto-routing (memo for card-scoped, KB for generalizable, episodic for daily) | `content` | `cardId`, `forceTarget`, `source` |
| `memory_recall` | Unified search across KB + memos + episodic | `query` | `cardId`, `type`, `tag`, `n` (default 10), `daysBack` (default 7) |
| `memory_promote` | Graduate memo/episodic to permanent KB | `content`, `source_type`, `source_ref` | `title`, `type`, `tags` |

### Example tool call (agent perspective)

```
Use the memory_recall tool to search for any past notes about deploying to Tailscale.
```

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `memoDir` | `string` | `~/.openclaw/USER/memos` | Directory for per-card memo files |
| `kbDbDir` | `string` | `~/.openclaw/USER/kb` | Directory for KB SQLite database |
| `episodicDir` | `string` | `~/.openclaw/USER/memory` | Directory for daily episodic memory files |
| `modelPath` | `string` | `~/.cache/qmd/models/...embeddinggemma-300M-Q8_0.gguf` | Path to embedding model |
| `contextN` | `number` | `5` | Number of memory entries injected into context |
| `contextThreshold` | `number` | `0.75` | Cosine distance threshold for context injection (0–2) |

## Examples

### Example 1 — Write a card-scoped memo

```bash
openclaw mc-memory write "Tried SQLite — works, no Docker needed" --card crd_abc123
```

### Example 2 — Search and promote

```bash
openclaw mc-memory recall "tailscale funnel setup" -n 3
openclaw mc-memory promote --content "Homebrew Tailscale doesn't support Funnel" \
  --from episodic --ref 2026-03-15 --tags "tailscale,gotcha"
```

## Architecture

- `index.ts` — Plugin entry point, `before_prompt_build` hook for context injection
- `cli/commands.ts` — Write, recall, list, promote commands
- `tools/definitions.ts` — Three primary agent tools
- `src/writer.js` — Smart routing logic (memo/kb/episodic)
- `src/recall.js` — Unified search across all memory stores
- `src/promote.js` — Graduates short-term to long-term memory

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Vector search not working | Ensure embedding model GGUF exists at `modelPath` |
| No memories injected | Check `contextThreshold` — lower values (e.g. 0.5) are more permissive |
| Wrong store targeted | Use `--force` flag to override auto-routing |
