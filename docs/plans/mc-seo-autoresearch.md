# Plan: mc-seo + autoresearch — Autonomous SEO Experimentation

## The Idea

Apply Karpathy's autoresearch pattern to SEO: the agent proposes changes to your websites, measures their impact on rankings, keeps what works, reverts what doesn't, and repeats. Overnight, your agent runs 20-50 SEO experiments while you sleep.

## What mc-seo already has

- **Crawl** — full site audit, 40 checks, 0-100 score per page
- **Rank check** — Google/Bing/scrape for keyword positions
- **Audit** — on-page SEO scoring (title, meta, headings, content, schema, images, OG)
- **Board integration** — auto-creates mc-board cards from audit issues
- **Telegram alerts** — notify when brand terms drop
- **Weekly reports** — automated rank tracking + audit summaries
- **Sitemap submission** — Google, Bing, IndexNow

## What's missing (the autoresearch layer)

mc-seo can **observe** but can't **act**. It tells you "your title is too short" but doesn't fix it. The autoresearch pattern closes the loop:

```
audit → identify worst-scoring page → propose change → implement change →
wait for indexing → re-check rank → measure impact → keep or revert → repeat
```

---

## Implementation

### New: Experiment engine (`src/experiment.ts`)

```typescript
interface SeoExperiment {
  id: string;
  domain: string;
  url: string;
  hypothesis: string;          // "Adding keyword to H1 will improve ranking"
  change: {
    type: "title" | "meta" | "h1" | "content" | "schema" | "og" | "new-page";
    before: string;
    after: string;
    file?: string;             // which file was modified
    commit?: string;           // git commit hash
  };
  metric: string;              // "rank:miniclaw" or "score" or "traffic"
  baselineValue: number;       // rank position or audit score before
  resultValue?: number;        // after re-check
  status: "proposed" | "applied" | "waiting" | "measured" | "kept" | "reverted";
  appliedAt?: string;
  measuredAt?: string;
  waitDays: number;            // how long to wait before measuring (default 7)
}
```

### New: Strategy engine (`src/strategy.ts`)

Reads past experiments from the DB + mc-kb, decides what to try next:

1. **Audit-driven** — fix the lowest-scoring check on the lowest-scoring page
2. **Rank-driven** — target keywords where you're position 5-20 (within striking distance)
3. **Content-driven** — identify thin pages (<600 words), expand them
4. **Schema-driven** — add structured data to pages missing it
5. **Competitive** — check what competitors rank for that you don't, create content
6. **Title/meta optimization** — A/B test title tag variations (change, wait, measure)

The strategy reads `program.md` (autoresearch pattern) — human writes the research priorities, agent executes.

### New: Actor (`src/actor.ts`)

The agent actually makes changes. How depends on the site:

**For sites in mc-board projects (git repos):**
1. Clone/pull the repo
2. Edit the file (HTML, markdown, Next.js page)
3. Commit with experiment ID in the message
4. Push to deploy branch
5. Wait for deploy (Vercel, Netlify, etc.)
6. Ping sitemap

**For sites managed by mc-blog/mc-substack:**
1. Create or edit post via the plugin
2. Publish

**For sites the agent can't edit directly:**
1. Create a mc-board card with the recommended change
2. Notify human via Telegram
3. Wait for human to implement
4. Re-check after implementation

### New: Scheduler (`src/scheduler.ts`)

Cron job that:
1. Checks experiments in "waiting" status whose wait period has elapsed
2. Re-runs rank check and audit for those URLs
3. Compares to baseline
4. Marks as "kept" (improved) or "reverted" (no change or worse)
5. For reverted: git revert the commit
6. Stores finding in mc-kb
7. Proposes next experiment

---

## The Experiment Loop

```
┌─────────────────────────────────────────────────┐
│  1. AUDIT                                        │
│     mc-seo crawl → find worst pages              │
│                                                  │
│  2. STRATEGIZE                                   │
│     read mc-kb for past experiments              │
│     read program.md for research priorities      │
│     pick best experiment to run                  │
│                                                  │
│  3. PROPOSE                                      │
│     "Change title of /pricing from 'Pricing'     │
│      to 'MiniClaw Pricing — Free AI for Mac'"   │
│                                                  │
│  4. IMPLEMENT                                    │
│     git commit + deploy                          │
│     or: create board card for human              │
│                                                  │
│  5. WAIT                                         │
│     7 days for Google to re-index                │
│     ping sitemap to speed it up                  │
│                                                  │
│  6. MEASURE                                      │
│     re-check rank for target keyword             │
│     re-audit the page                            │
│                                                  │
│  7. DECIDE                                       │
│     improved? → keep, store finding in mc-kb     │
│     no change? → keep (not harmful)              │
│     worse? → revert commit, store lesson         │
│                                                  │
│  8. REPEAT                                       │
│     propose next experiment                      │
└─────────────────────────────────────────────────┘
```

---

## Agent tools (additions to mc-seo)

| Tool | Description |
|------|-------------|
| `seo_experiment_propose` | Agent proposes a change based on audit + strategy |
| `seo_experiment_apply` | Implement the change (edit file, commit, deploy) |
| `seo_experiment_check` | Re-measure after wait period |
| `seo_experiment_revert` | Undo a failed experiment |
| `seo_experiment_history` | List all experiments for a domain |
| `seo_experiment_report` | Generate findings report |

## CLI commands (additions)

```bash
mc mc-seo experiment propose miniclaw.bot    # suggest next experiment
mc mc-seo experiment list miniclaw.bot       # all experiments
mc mc-seo experiment check                   # re-measure waiting experiments
mc mc-seo experiment report miniclaw.bot     # findings report
```

---

## program.md (human-written research strategy)

```markdown
# SEO Research Strategy — miniclaw.bot

## Priority 1: Brand keywords
Target: "miniclaw", "personal ai mac", "local ai assistant"
Goal: position 1-3 for all brand terms
Method: optimize title tags, H1s, meta descriptions

## Priority 2: Long-tail content
Target: "how to run ai on mac mini", "self-hosted ai assistant"
Goal: create blog posts targeting these terms
Method: mc-blog posts with keyword-optimized titles

## Priority 3: Technical SEO
Target: all pages score 90+
Method: fix audit issues, add schema markup, optimize images

## Constraints
- Never change the homepage title without human approval
- Max 3 experiments per week (don't trigger Google spam filters)
- Always git commit changes so they can be reverted
- Notify via Telegram before making any content changes
```

---

## What this gives you

**Before:** mc-seo tells you what's wrong. You fix it manually. Maybe.

**After:** mc-seo fixes it automatically, measures the impact, keeps what works, reverts what doesn't, learns from every experiment, and runs 24/7.

**Concrete example overnight:**
1. 10pm: Agent audits miniclaw.bot, finds /pricing scores 45/100 (missing H1, no schema, weak title)
2. 10:05pm: Agent changes title to "MiniClaw Pricing — Free AI Agent for Your Mac"
3. 10:06pm: Agent adds FAQ schema with 5 Q&As from GitHub discussions
4. 10:07pm: Agent commits, pushes, Vercel deploys
5. 10:08pm: Agent pings sitemap to Google
6. 7 days later: Agent re-checks. Rank for "miniclaw pricing" improved from #18 to #7
7. Agent stores finding: "Adding FAQ schema + keyword in title improved rank by 11 positions"
8. Agent proposes next experiment for /features page

---

## Dependencies

- mc-seo (existing — audit, crawl, rank check)
- mc-board (existing — experiment cards)
- mc-kb (existing — findings storage)
- mc-blog (existing — content creation)
- mc-github (existing — git operations for site repos)
- Git access to site repos (for implementing changes)

## DB additions

```sql
CREATE TABLE experiments (
  id TEXT PRIMARY KEY,
  domain TEXT NOT NULL,
  url TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  change_type TEXT NOT NULL,
  change_before TEXT,
  change_after TEXT,
  change_file TEXT,
  change_commit TEXT,
  metric TEXT NOT NULL,
  baseline_value REAL,
  result_value REAL,
  status TEXT NOT NULL DEFAULT 'proposed',
  wait_days INTEGER NOT NULL DEFAULT 7,
  applied_at TEXT,
  measured_at TEXT,
  created_at TEXT NOT NULL,
  card_id TEXT
);

CREATE TABLE IF NOT EXISTS ranks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  keyword TEXT NOT NULL,
  engine TEXT NOT NULL,
  position INTEGER,
  url TEXT,
  checked_at TEXT NOT NULL
);
```

Note: the `ranks` table is also needed to fix the existing rank history bug (methods called but table missing).

## Estimated effort

- Experiment DB + CRUD: half session
- Strategy engine: 1 session
- Actor (git commit/deploy): 1 session
- Scheduler (cron re-check): half session
- Fix missing ranks table: 15 minutes
- program.md template: 15 minutes
- Integration tests: half session

Total: ~3 sessions to have it running autonomously.

## First step

Fix the missing `ranks` table in mc-seo db.ts, then build the experiment table and a single experiment type (title tag optimization). The rest builds on that foundation.
