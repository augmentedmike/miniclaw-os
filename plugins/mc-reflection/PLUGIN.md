# mc-reflection

Nightly self-reflection engine for Am. Reviews the day's memories, board state, KB entries, and session transcripts — then extracts lessons, creates action items, and builds long-term knowledge.

## Architecture

mc-reflection is the **introspection loop**. It runs nightly at 3am CT as a cron job, giving Am time to process the full day before the next one starts.

### Data Sources (read-only)

| Source | What it provides |
|--------|-----------------|
| Episodic memory (`~/.openclaw/workspace/memory/YYYY-MM-DD.md`) | Raw session notes, decisions, events |
| Board (`board.db`) | Card state, what shipped, what's in progress, work logs |
| KB (`kb.db`) | Lessons/errors/decisions logged during the day |
| Session transcripts (`~/.claude/projects/**/*.jsonl`) | What was discussed with Mike |

### Outputs

| Output | Tool used |
|--------|-----------|
| Board cards (todos, corrections, future protection) | `mc-board create_card` |
| KB entries (lessons, postmortems, decisions) | `mc-kb add` / `kb_add` |
| MEMORY.md updates (curated long-term memory) | Direct file edit |
| Reflection snapshot (stored in SQLite + markdown) | `reflection_save` |

## CLI

```bash
mc mc-reflection gather                    # Print today's gathered context
mc mc-reflection gather --date 2026-03-10  # Print specific date
mc mc-reflection list                      # List past reflections
mc mc-reflection list --limit 7            # Last 7 reflections
mc mc-reflection show refl_a1b2c3d4        # Show by ID
mc mc-reflection show 2026-03-10           # Show by date
```

## Agent Tools

| Tool | Purpose |
|------|---------|
| `reflection_gather` | Collect the day's complete context into formatted markdown |
| `reflection_save` | Save a completed reflection entry |
| `reflection_list` | List past reflections |
| `reflection_show` | Show a specific reflection by ID or date |

## Cron Job

Schedule: **3:00 AM CT daily** (`0 3 * * *`, `America/Chicago`)

The cron prompt instructs Am to:

1. Call `reflection_gather` to collect the day's data
2. Analyze: what went well, what went wrong, patterns, recurring issues
3. Create board cards for actionable follow-ups (todos, corrections, protection)
4. Log significant lessons to KB via `kb_add`
5. Update `~/.openclaw/workspace/MEMORY.md` (distill, don't append)
6. Call `reflection_save` to record the reflection
7. Silent exit unless something urgent needs Mike's attention

## Storage

- **SQLite DB:** `~/.openclaw/miniclaw/USER/reflections/reflections.db`
- **Markdown snapshots:** `~/.openclaw/miniclaw/USER/reflections/entries/YYYY-MM-DD-refl_*.md`

## Config

```json
{
  "reflectionDir": "~/.openclaw/miniclaw/USER/reflections",
  "memoryDir": "~/.openclaw/workspace/memory",
  "boardDbPath": "~/.openclaw/miniclaw/USER/brain",
  "kbDbPath": "~/.openclaw/miniclaw/USER/kb",
  "transcriptsDir": "~/.claude/projects"
}
```
