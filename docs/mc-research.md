# mc-research

> Competitive intelligence and deep research — query Perplexity, search the web, track competitors, and generate reports.

## Overview

mc-research provides deep research capabilities via the Perplexity sonar API, multi-provider
web search (Google, SerpAPI, Bing), competitor tracking with change detection, and comprehensive
report generation. Research history is stored in a SQLite database.

## Installation

```bash
cd ~/.openclaw/miniclaw/plugins/mc-research
npm install
npm run build
```

### Prerequisites

- Perplexity API key in mc-vault: `openclaw mc-vault set research-perplexity-api-key <key>`
- Web search API key (one of): Google Custom Search, SerpAPI, or Bing
- Network access to search providers

## CLI Usage

```bash
# Deep research via Perplexity
openclaw mc-research query "What are the latest LLM benchmarks?" [--focus web|news|academic]

# Web search
openclaw mc-research search "keyword" [--num N]

# Competitor tracking
openclaw mc-research watch add <name> <domain> [--notes "..."]
openclaw mc-research watch remove <domain>
openclaw mc-research watch list

# Scrape competitor pages
openclaw mc-research snapshot <domain> [--pages pricing,about,features]

# Full competitive intelligence report
openclaw mc-research report "query" [--competitor domain]

# View past research
openclaw mc-research history [--num N]
```

### Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `query` | Deep research via Perplexity sonar | `openclaw mc-research query "React vs Svelte 2026" --focus web` |
| `search` | Web search | `openclaw mc-research search "agent frameworks" --num 10` |
| `watch add` | Register a competitor | `openclaw mc-research watch add "Acme" acme.dev` |
| `watch remove` | Remove a competitor | `openclaw mc-research watch remove acme.dev` |
| `watch list` | List tracked competitors | `openclaw mc-research watch list` |
| `snapshot` | Scrape competitor pages | `openclaw mc-research snapshot acme.dev --pages pricing,features` |
| `report` | Full intelligence report | `openclaw mc-research report "AI agent market" --competitor acme.dev` |
| `history` | List past research | `openclaw mc-research history --num 5` |

## Tool API

| Tool | Description | Required Params | Optional Params |
|------|-------------|-----------------|-----------------|
| `research_query` | Deep research via Perplexity | `query` | `focus` (web/news/academic), `card_id` |
| `research_web_search` | Search the web | `query` | `num_results` (default 5), `card_id` |
| `research_competitor_watch` | Register/list/remove competitors | `action` (add/remove/list) | `name`, `domain`, `notes` |
| `research_competitor_snapshot` | Scrape competitor pages | `domain` | `pages` |
| `research_report` | Generate comprehensive report | `query` | `competitor_domain`, `card_id` |

### Example tool call (agent perspective)

```
Use the research_query tool to find out what agent benchmarks are trending in 2026.
```

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `stateDir` | `string` | `~/.openclaw/USER/research` | Directory for research.db |
| `perplexityModel` | `string` | `sonar` | Perplexity model to use |
| `searchProvider` | `string` | `google` | Search provider: serp, google, or bing |
| `maxSnapshotPages` | `number` | `5` | Max pages to scrape per snapshot |

## Examples

### Example 1 — Research a topic

```bash
openclaw mc-research query "What are the best practices for LLM agent memory systems?" --focus academic
```

### Example 2 — Track and monitor a competitor

```bash
openclaw mc-research watch add "LangChain" langchain.com --notes "Python agent framework"
openclaw mc-research snapshot langchain.com --pages pricing,docs,changelog
openclaw mc-research report "agent framework comparison" --competitor langchain.com
```

## Architecture

- `index.ts` — Plugin entry point
- `cli/commands.ts` — CLI command registration
- `tools/definitions.ts` — 5 agent tools with optional board card attachment
- `src/config.js` — Configuration resolution
- `src/db.js` — SQLite research database (reports, searches, competitors, snapshots)
- `src/perplexity.js` — Perplexity API client
- `src/search.js` — Multi-provider web search (Google, SerpAPI, Bing)
- `src/scraper.js` — Page scraping and change detection
- `src/vault.js` — API key retrieval from mc-vault

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Perplexity API key not found" | Run `openclaw mc-vault set research-perplexity-api-key <key>` |
| Search returns no results | Check which `searchProvider` is configured and ensure its API key is in vault |
| Snapshot fails | Verify the domain is accessible and `maxSnapshotPages` is sufficient |
