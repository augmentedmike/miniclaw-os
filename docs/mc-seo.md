# mc-seo — SEO Automation

mc-seo provides on-page SEO auditing, site crawling, keyword rank checking, sitemap submission, and directory/outreach tracking. Audit results are stored in SQLite for historical comparison.

---

## Overview

The plugin manages SEO for multiple domains. Each domain can have configured target keywords, a sitemap URL, and a dev URL. Audit scores (0-100, grade A-F) are computed from checks on title, meta description, headings, content, images, schema markup, and Open Graph tags. The `board` command bridges SEO findings into mc-board cards for the agent's task pipeline.

---

## CLI Commands

All commands use `openclaw mc-seo <subcommand>`.

### `check <url>`
Full on-page SEO audit of a single URL.

```
openclaw mc-seo check <url> [options]

Options:
  -v, --verbose       Show all checks including passes
  -k, --keyword <kw>  Primary target keyword to check against
  --json              Output raw JSON

Example:
  openclaw mc-seo check https://helloam.bot --keyword "helloam"
```

### `crawl <url>`
Crawl an entire site and audit every page.

```
openclaw mc-seo crawl <url> [options]

Options:
  --max-pages <n>     Max pages to crawl (default: 100)
  --max-depth <n>     Max crawl depth (default: 10)
  -v, --verbose       Show full audit for each page
  --json              Output raw JSON
```

### `rank <domain> <keyword>`
Check Google/Bing ranking for a keyword.

```
openclaw mc-seo rank helloam.bot "helloam"
```

### `rank-all <domain>`
Check rankings for all configured target keywords on a domain.

```
openclaw mc-seo rank-all helloam.bot
```

Includes a 1.5s delay between requests to avoid rate limiting.

### `ping <sitemapUrl>`
Submit a sitemap to Google, Bing, and IndexNow.

```
openclaw mc-seo ping https://helloam.bot/sitemap.xml
```

Validates the sitemap first, then submits to all engines.

### `track-add`
Record a directory/outreach submission.

```
openclaw mc-seo track-add --domain helloam.bot --service Futurepedia --status submitted [--url <url>] [--notes <text>]
```

### `track-list [domain]`
List all tracked directory/outreach submissions.

```
openclaw mc-seo track-list
openclaw mc-seo track-list helloam.bot
```

### `board <domain>`
Auto-create mc-board cards from the latest audit findings.

```
openclaw mc-seo board helloam.bot [--project <id>]
```

Groups issues by type across pages and creates one card per issue type. Auto-detects project ID for known domains.

### `domains`
List configured domains with their sitemaps, dev URLs, and target keywords.

```
openclaw mc-seo domains
```

---

## Agent Tools

| Tool | Description |
|------|-------------|
| `seo_audit` | Run a full on-page SEO audit. Returns score (0-100), grade, issues, and suggestions. Parameters: `url` (required), `keyword` (optional). |
| `seo_crawl` | Crawl a site and audit every page. Returns site-wide health summary. Parameters: `url` (required), `max_pages` (optional, default: 50). |
| `seo_rank_check` | Check where a domain ranks for a keyword on Google/Bing. Parameters: `domain`, `keyword` (both required). |
| `seo_ping_sitemap` | Submit a sitemap URL to Google, Bing, and IndexNow. Parameter: `sitemap_url` (required). |
| `seo_track_submission` | Record a directory/outreach submission. Parameters: `domain`, `service`, `status` (required); `service_url`, `notes` (optional). |

---

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `stateDir` | string | `$OPENCLAW_STATE_DIR/USER/seo` | Directory for the SQLite database |
| `indexNowKey` | string | — | IndexNow API key for instant indexing |
| `googleSearchApiKey` | string | — | Google Custom Search API key for rank checking |
| `googleSearchCx` | string | — | Google Custom Search engine ID |
| `bingApiKey` | string | — | Bing Web Search API key for rank checking |
| `domains` | object | `{}` | Per-domain configuration (see below) |

### Domain configuration

```json
{
  "domains": {
    "helloam.bot": {
      "sitemapUrl": "https://helloam.bot/sitemap.xml",
      "targetKeywords": ["helloam", "am bot", "ai assistant"],
      "devUrl": "http://localhost:3000"
    }
  }
}
```

---

## State Storage

```
$OPENCLAW_STATE_DIR/USER/seo/
  seo.db       SQLite database (audits, rank checks, submission tracking)
```
