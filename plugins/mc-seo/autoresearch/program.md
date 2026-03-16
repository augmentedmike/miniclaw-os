# SEO Autoresearch

This is an experiment to have the LLM autonomously optimize a website's SEO.

## Setup

To set up a new SEO experiment run, work with the user to:

1. **Agree on a run tag**: propose a tag based on today's date (e.g. `seo-mar16`). The branch `autoresearch/<tag>` must not already exist in the SITE repo — this is a fresh run.
2. **Identify the site repo**: The user will tell you which repo contains the website source. Clone it or confirm it exists locally.
3. **Create the branch**: `git checkout -b autoresearch/<tag>` from the site repo's main branch.
4. **Read the tools**: You have these immutable tools available (do NOT modify them):
   - `mc mc-seo check <url>` — audit a single page (score 0-100, issues, suggestions)
   - `mc mc-seo crawl <url>` — crawl entire site, audit all pages
   - `mc mc-seo rank <domain> <keyword>` — check Google/Bing ranking for a keyword
   - `mc mc-seo rank-all <domain>` — check all configured keywords
   - `mc mc-seo ping <sitemap-url>` — submit sitemap to search engines
5. **Run baseline audit**: `mc mc-seo crawl <site-url> --json > baseline.json`
6. **Initialize results.tsv**: Create `results.tsv` with the header row. Record the baseline.
7. **Confirm and go**: Confirm setup looks good.

Once you get confirmation, kick off the experimentation.

## Experimentation

Each experiment modifies the website source, deploys it, and measures the impact on SEO score and/or search rankings.

**What you CAN do:**
- Modify any file in the site repo — HTML, CSS, JS, markdown, config files
- Change page titles, meta descriptions, headings, content, schema markup, Open Graph tags
- Create new pages (blog posts, landing pages)
- Modify robots.txt, sitemap.xml
- Add structured data (JSON-LD)

**What you CANNOT do:**
- Modify mc-seo itself. The audit tools are read-only — they are your ground truth.
- Break the site. Every change must leave the site functional.
- Make changes that violate Google's webmaster guidelines (no keyword stuffing, no cloaking, no hidden text)

**The goal is simple: get the highest audit score and the best keyword rankings.**

**Time budget**: Each experiment's effect on rankings takes 3-7 days to appear. For audit score improvements, results are immediate. Run audit-score experiments in rapid succession (deploy → re-audit → compare). Run ranking experiments in batches with a wait period.

**Simplicity criterion**: All else being equal, simpler is better. A title change that improves score by 5 points is better than adding 200 lines of schema that improves it by 6. Removing unnecessary code that maintains the same score is a win.

## Output format

After each experiment, record the audit results:

```
mc mc-seo check <url> --json
```

Key metrics:
- `score` (0-100)
- `grade` (A+ to F)
- `issues` (array of problems)

For rankings:
```
mc mc-seo rank <domain> <keyword>
```

Key metric: position (1-100, lower is better)

## Logging results

Log every experiment to `results.tsv` (tab-separated).

The TSV has a header row and 6 columns:

```
commit	score	rank_change	status	page	description
```

1. git commit hash (short, 7 chars)
2. audit score after change (0-100)
3. rank change for target keyword (+N improved, -N dropped, = unchanged, ? not checked)
4. status: `keep`, `discard`, or `crash`
5. page URL that was modified
6. short text description of what this experiment tried

Example:

```
commit	score	rank_change	status	page	description
a1b2c3d	87	=	keep	/	baseline
b2c3d4e	92	=	keep	/	shorten title to 55 chars
c3d4e5f	92	=	discard	/	add FAQ schema (no score change, added complexity)
d4e5f6g	95	=	keep	/pricing	add meta description and H1
```

## The experiment loop

LOOP FOREVER:

1. Look at the current state: `mc mc-seo crawl <site-url>` — find the lowest-scoring page
2. Read that page's audit: identify the highest-impact issue to fix
3. Modify the site source to fix the issue
4. `git commit` with a descriptive message
5. Deploy: `git push` (assumes Vercel/Netlify auto-deploy, or manual deploy)
6. Wait for deploy (10-30 seconds for Vercel)
7. Re-audit: `mc mc-seo check <page-url>`
8. Record results in results.tsv (do NOT commit results.tsv)
9. If score improved: keep the commit, move to the next issue or page
10. If score unchanged: keep if the change is a simplification, otherwise discard (`git revert`)
11. If score decreased: `git revert` the commit, record as discard
12. After fixing all audit issues on a page, run `mc mc-seo rank <domain> <keyword>` to check rankings
13. Submit sitemap: `mc mc-seo ping <sitemap-url>`

**Prioritization:**
- Fix pages scoring below 80 first
- Fix critical issues before warnings
- Title and H1 changes have the highest ranking impact
- Schema markup has high impact for rich snippets
- Content length affects both score and rankings

**NEVER STOP**: Once the experiment loop has begun, do NOT pause to ask the human if you should continue. The human might be asleep. You are autonomous. If every page scores 95+, start optimizing for rankings — create content targeting keywords where you rank 5-20, optimize existing content for keywords where you're close to page 1. The loop runs until the human interrupts you, period.

## When you run out of audit fixes

Once all pages score 90+, shift to ranking optimization:

1. Run `mc mc-seo rank-all <domain>` — identify keywords where you rank 5-20
2. For each "striking distance" keyword:
   - Find the page that should rank for it
   - Optimize that page's title, H1, content for the keyword
   - Create internal links to that page from other pages
   - Deploy, wait, re-check rank
3. For keywords where you don't rank at all:
   - Create a new page targeting that keyword
   - Write quality content (500+ words)
   - Add schema markup
   - Link from existing pages
   - Submit sitemap

## Knowledge base

After each experiment, store key findings:
```
mc mc-kb add --type fact --title "Title length affects ranking" --content "Shortening title from 76 to 55 chars improved score by 5 points on augmentedmike.com"
```

Before proposing a new experiment, check what's been learned:
```
mc mc-kb search "seo title optimization"
```

This prevents repeating failed experiments and builds institutional knowledge.
