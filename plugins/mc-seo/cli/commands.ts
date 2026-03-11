/**
 * mc-seo — CLI commands
 *
 *   mc mc-seo check <url>              — full on-page audit of a single URL
 *   mc mc-seo crawl <url>             — crawl entire site, score all pages
 *   mc mc-seo rank <domain> <kw>      — check SERP ranking for keyword
 *   mc mc-seo rank-all <domain>       — check all configured keywords
 *   mc mc-seo rank-history <domain> <kw> — show position trend over time
 *   mc mc-seo ping <sitemap-url>      — submit sitemap to Google/Bing/IndexNow
 *   mc mc-seo track add               — record a directory/outreach submission
 *   mc mc-seo track list [domain]     — list tracked submissions
 *   mc mc-seo board <domain>          — auto-create mc-board cards from audit
 *   mc mc-seo domains                 — list configured domains
 */

import type { Command } from "commander";
import type { SeoConfig } from "../src/config.js";
import { auditPage, type PageAudit } from "../src/audit.js";
import { crawlSite } from "../src/crawler.js";
import { checkRank } from "../src/rank-checker.js";
import { pingSitemaps, fetchSitemap } from "../src/sitemap.js";
import { formatPageAudit, formatSiteSummary } from "../src/reporter.js";
import { SeoDb } from "../src/db.js";
import * as path from "node:path";
import * as child_process from "node:child_process";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

function getDb(cfg: SeoConfig): SeoDb {
  return new SeoDb(path.join(cfg.stateDir, "seo.db"));
}

function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function getDomainConfig(cfg: SeoConfig, domain: string) {
  return cfg.domains[domain] ?? cfg.domains[`www.${domain}`] ?? { targetKeywords: [] };
}

function deltaStr(prev: number | null, curr: number | null): string {
  if (prev === null && curr === null) return "";
  if (prev === null) return curr !== null ? " (new)" : "";
  if (curr === null) return " (dropped out)";
  const diff = prev - curr; // positive = moved up
  if (diff === 0) return " (no change)";
  return diff > 0 ? ` (↑${diff})` : ` (↓${Math.abs(diff)})`;
}

function positionMedal(pos: number | null): string {
  if (pos === null) return "📉";
  if (pos === 1) return "🥇";
  if (pos <= 3) return "🥈";
  if (pos <= 10) return "🟢";
  return "🟡";
}

// Telegram chat ID for Michael (augmentedmike)
const TG_CHAT_ID = "8755232806";

// Resolve TG bot token: env var > vault > error
function getTgBotToken(): string {
  if (process.env.TG_BOT_TOKEN) return process.env.TG_BOT_TOKEN;
  const vaultRoot = process.env.OPENCLAW_VAULT_ROOT
    ?? `${process.env.HOME}/am/miniclaw/SYSTEM/vault`;
  const vaultBin = `${process.env.HOME}/am/miniclaw/SYSTEM/bin/mc-vault`;
  const result = child_process.spawnSync(
    vaultBin, ["export", "telegram-bot-token"],
    { encoding: "utf8", env: { ...process.env, OPENCLAW_VAULT_ROOT: vaultRoot } }
  );
  const token = result.stdout?.trim();
  if (!token) throw new Error("TG_BOT_TOKEN not set and vault lookup failed");
  return token;
}

// Send Telegram message via direct Bot API (bypasses openclaw subprocess to avoid nested-instance conflicts)
function sendTelegramAlert(message: string): void {
  const token = getTgBotToken();
  const chatId = TG_CHAT_ID;
  const pyScript = `
import urllib.request, json, sys
payload = json.dumps({"chat_id":"${chatId}","text":sys.argv[1],"disable_web_page_preview":True}).encode()
req = urllib.request.Request(
  "https://api.telegram.org/bot" + sys.argv[2] + "/sendMessage",
  data=payload, headers={"Content-Type":"application/json"}, method="POST"
)
try:
  with urllib.request.urlopen(req, timeout=10) as r:
    d = json.load(r)
    print("ok" if d.get("ok") else f"tg error: {d}", file=sys.stderr)
except Exception as e:
  print(f"tg send failed: {e}", file=sys.stderr)
`.trim();
  child_process.spawnSync("python3", ["-c", pyScript, message, token], { encoding: "utf8" });
}

export function registerSeoCommands(
  ctx: { program: Command; logger: Logger },
  cfg: SeoConfig
): void {
  const { program, logger } = ctx;

  const seo = program
    .command("mc-seo")
    .description("SEO automation — audit, crawl, rank check, sitemap submission, backlink tracking");

  // ── mc mc-seo check <url> ────────────────────────────────────────────────
  seo
    .command("check <url>")
    .description("Full on-page SEO audit of a single URL")
    .option("-v, --verbose", "Show all checks including passes")
    .option("-k, --keyword <kw>", "Primary target keyword to check against")
    .option("--json", "Output raw JSON")
    .action(async (url: string, opts: { verbose?: boolean; keyword?: string; json?: boolean }) => {
      if (!url.startsWith("http")) url = `https://${url}`;
      const domain = domainOf(url);
      const domCfg = getDomainConfig(cfg, domain);
      const keywords = opts.keyword ? [opts.keyword] : domCfg.targetKeywords;

      logger.info(`mc-seo: auditing ${url}${keywords.length ? ` (keyword: ${keywords[0]})` : ""}`);
      const audit = await auditPage(url, keywords);

      if (opts.json) {
        console.log(JSON.stringify(audit, null, 2));
      } else {
        console.log("\n" + formatPageAudit(audit, opts.verbose));
      }

      // Save to db
      const db = getDb(cfg);
      db.saveAudit(domain, url, audit.score, audit.issues, audit.suggestions, audit);
      db.close();
    });

  // ── mc mc-seo crawl <url> ────────────────────────────────────────────────
  seo
    .command("crawl <url>")
    .description("Crawl entire site and audit every page")
    .option("--max-pages <n>", "Max pages to crawl", "100")
    .option("--max-depth <n>", "Max crawl depth", "10")
    .option("-v, --verbose", "Show full audit for each page")
    .option("--json", "Output raw JSON")
    .action(async (url: string, opts: { maxPages: string; maxDepth: string; verbose?: boolean; json?: boolean }) => {
      if (!url.startsWith("http")) url = `https://${url}`;
      const domain = domainOf(url);
      const domCfg = getDomainConfig(cfg, domain);

      console.log(`\n🕷️  Crawling ${url} (max ${opts.maxPages} pages)…\n`);

      const crawl = await crawlSite(url, {
        maxPages: parseInt(opts.maxPages),
        maxDepth: parseInt(opts.maxDepth),
        onProgress: (done, total, current) => {
          process.stdout.write(`\r  ${done}/${total} pages… ${current.slice(0, 60)}`);
        },
      });

      console.log(`\n\n📊 Auditing ${crawl.pages.filter(p => p.status === 200).length} pages…\n`);

      const db = getDb(cfg);
      const audits = await Promise.all(
        crawl.pages
          .filter(p => p.status === 200 && !p.error)
          .map(p => auditPage(p.url, domCfg.targetKeywords))
      );

      for (const audit of audits) {
        db.saveAudit(domain, audit.url, audit.score, audit.issues, audit.suggestions, audit);
        if (opts.verbose) {
          console.log(formatPageAudit(audit, false));
          console.log("─".repeat(60));
        }
      }
      db.close();

      if (opts.json) {
        console.log(JSON.stringify({ crawl, audits }, null, 2));
      } else {
        console.log(formatSiteSummary(crawl, audits));
      }
    });

  // ── mc mc-seo rank <domain> <keyword> ───────────────────────────────────
  seo
    .command("rank <domain> <keyword>")
    .description("Check SERP ranking for a keyword (DuckDuckGo, no API key needed)")
    .option("--alert", "Send Telegram alert if brand term below #3")
    .action(async (domain: string, keyword: string, opts: { alert?: boolean }) => {
      const cleanDomain = domain.replace(/^www\./, "");
      console.log(`\n🔍 Checking rank for "${keyword}" on ${cleanDomain}…\n`);

      const db = getDb(cfg);
      const prev = db.getLatestRank(cleanDomain, keyword);

      const result = await checkRank(keyword, cleanDomain, {
        googleApiKey: cfg.googleSearchApiKey,
        googleCx: cfg.googleSearchCx,
        bingApiKey: cfg.bingApiKey,
      });

      if (result.error) {
        console.log(`❌ Error: ${result.error}`);
        db.close();
        return;
      }

      const delta = deltaStr(prev?.position ?? null, result.position);
      const medal = positionMedal(result.position);

      if (result.position === null) {
        console.log(`${medal} "${keyword}" — Not found in top results on ${result.engine}${delta}`);
      } else {
        console.log(`${medal} Position #${result.position} on ${result.engine}${delta}`);
        if (result.url) console.log(`   URL: ${result.url}`);
      }

      // Save to ranks table
      db.saveRank(cleanDomain, keyword, result.engine, result.position, result.url);
      db.close();

      // Brand drop alert — fire when dropped off results OR position > 3
      if (opts.alert && (result.position === null || result.position > 3)) {
        const isBrandTerm = cfg.domains[cleanDomain]?.targetKeywords?.includes(keyword);
        if (isBrandTerm) {
          const posDesc = result.position === null ? "dropped out of top results" : `dropped to #${result.position}`;
          sendTelegramAlert(
            `⚠️ SEO Alert: "${keyword}" ${posDesc} on ${result.engine} for ${cleanDomain}. Was: ${prev?.position ?? "unknown"}.`
          );
        }
      }
    });

  // ── mc mc-seo rank-all <domain> ─────────────────────────────────────────
  seo
    .command("rank-all <domain>")
    .description("Check rankings for all configured target keywords")
    .option("--alert", "Send Telegram alert for brand terms below #3")
    .option("--report", "Send full Telegram summary after checking all keywords")
    .action(async (domain: string, opts: { alert?: boolean; report?: boolean }) => {
      const cleanDomain = domain.replace(/^www\./, "");
      const domCfg = getDomainConfig(cfg, cleanDomain);

      if (domCfg.targetKeywords.length === 0) {
        console.log(`No target keywords configured for ${cleanDomain}. Add them to mc-seo.domains in openclaw.json`);
        return;
      }

      console.log(`\n🔍 Checking ${domCfg.targetKeywords.length} keywords for ${cleanDomain}…\n`);
      const db = getDb(cfg);

      const lines: string[] = [`📊 Rank Report — ${cleanDomain} — ${new Date().toLocaleDateString()}`];
      const alerts: string[] = [];

      for (const kw of domCfg.targetKeywords) {
        const prev = db.getLatestRank(cleanDomain, kw);
        const result = await checkRank(kw, cleanDomain, {
          googleApiKey: cfg.googleSearchApiKey,
          googleCx: cfg.googleSearchCx,
          bingApiKey: cfg.bingApiKey,
        });

        const delta = deltaStr(prev?.position ?? null, result.position);
        const medal = positionMedal(result.position);

        if (result.error) {
          console.log(`  ❌ "${kw}" — ${result.error}`);
          lines.push(`  ❌ "${kw}" — error`);
        } else if (result.position === null) {
          console.log(`  ${medal} "${kw}" — Not in top results (${result.engine})${delta}`);
          lines.push(`  ${medal} "${kw}" — not ranked`);
        } else {
          console.log(`  ${medal} #${result.position} — "${kw}" (${result.engine})${delta}`);
          lines.push(`  ${medal} #${result.position} — "${kw}"${delta}`);
        }

        db.saveRank(cleanDomain, kw, result.engine, result.position, result.url);

        // Brand drop alert — fire when dropped off results OR position > 3
        if ((opts.alert || opts.report) && (result.position === null || result.position > 3)) {
          const posDesc = result.position === null ? "not ranked" : `#${result.position}`;
          alerts.push(`⚠️ "${kw}" ${posDesc} (${result.engine})${delta}`);
        }

        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 2000));
      }

      db.close();

      if (opts.report) {
        const reportMsg = lines.join("\n");
        const alertSection = alerts.length > 0 ? `\n\n🚨 Alerts:\n${alerts.join("\n")}` : "";
        sendTelegramAlert(reportMsg + alertSection);
        console.log("\n📱 Report sent to Telegram");
      } else if (opts.alert && alerts.length > 0) {
        sendTelegramAlert(`⚠️ SEO Brand Alerts for ${cleanDomain}:\n${alerts.join("\n")}`);
      }
    });

  // ── mc mc-seo weekly-report ───────────────────────────────────────────────
  seo
    .command("weekly-report")
    .description("Run weekly SEO report: rank-all + homepage audit for all configured domains → Telegram")
    .option("--dry-run", "Print report to stdout only, do not send Telegram")
    .action(async (opts: { dryRun?: boolean }) => {
      const domains = Object.keys(cfg.domains);
      if (domains.length === 0) {
        console.log("No domains configured. Add mc-seo.domains to openclaw.json");
        return;
      }

      const date = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
      const sections: string[] = [`📊 *Weekly SEO Report — ${date}*`];
      const globalAlerts: string[] = [];

      const db = getDb(cfg);

      for (const domain of domains) {
        const domCfg = getDomainConfig(cfg, domain);
        const domainLines: string[] = [`\n🌐 *${domain}*`];
        const domainAlerts: string[] = [];

        // ── Rank checks ──
        if (domCfg.targetKeywords.length > 0) {
          for (const kw of domCfg.targetKeywords) {
            const prev = db.getLatestRank(domain, kw);
            const result = await checkRank(kw, domain, {
              googleApiKey: cfg.googleSearchApiKey,
              googleCx: cfg.googleSearchCx,
              bingApiKey: cfg.bingApiKey,
            });

            const delta = deltaStr(prev?.position ?? null, result.position);
            const medal = positionMedal(result.position);

            if (result.error) {
              domainLines.push(`  ❌ "${kw}" — error`);
            } else if (result.position === null) {
              domainLines.push(`  ${medal} "${kw}" — not ranked${delta}`);
              domainAlerts.push(`⚠️ "${kw}" — not ranked`);
            } else {
              domainLines.push(`  ${medal} #${result.position} — "${kw}"${delta}`);
              if (result.position > 3) {
                domainAlerts.push(`⚠️ "${kw}" at #${result.position}${delta}`);
              }
            }

            db.saveRank(domain, kw, result.engine, result.position, result.url);
            await new Promise(r => setTimeout(r, 2000));
          }
        } else {
          domainLines.push(`  (no keywords configured)`);
        }

        // ── Homepage audit ──
        const homeUrl = `https://${domain}`;
        try {
          const { auditPage } = await import("../src/audit.js");
          const audit = await auditPage(homeUrl, domCfg.targetKeywords);
          db.saveAudit(domain, homeUrl, audit.score, audit.issues, audit.suggestions, audit);

          const grade = audit.score >= 90 ? "🟢" : audit.score >= 70 ? "🟡" : "🔴";
          domainLines.push(`  ${grade} Homepage audit: ${audit.score}/100`);
          if (audit.score < 70 && audit.issues.length > 0) {
            domainLines.push(`  Issues: ${audit.issues.slice(0, 3).join(", ")}`);
            globalAlerts.push(`🔴 ${domain} homepage score: ${audit.score}/100 — ${audit.issues[0]}`);
          }
        } catch {
          domainLines.push(`  ⚠️ Homepage audit failed`);
        }

        if (domainAlerts.length > 0) {
          globalAlerts.push(...domainAlerts.map(a => `  ${domain}: ${a}`));
        }

        sections.push(domainLines.join("\n"));
        // Delay between domains
        await new Promise(r => setTimeout(r, 3000));
      }

      db.close();

      if (globalAlerts.length > 0) {
        sections.push(`\n🚨 *Alerts:*\n${globalAlerts.join("\n")}`);
      } else {
        sections.push(`\n✅ All brand keywords in top 3, no critical page issues.`);
      }

      const report = sections.join("\n");
      console.log(report);

      if (!opts.dryRun) {
        sendTelegramAlert(report);
        console.log("\n📱 Report sent to Telegram");
      } else {
        console.log("\n[dry-run] Telegram send skipped");
      }
    });

  // ── mc mc-seo rank-history <domain> <keyword> ────────────────────────────
  seo
    .command("rank-history <domain> <keyword>")
    .description("Show SERP position trend over time for a keyword")
    .option("--limit <n>", "Number of historical records to show", "20")
    .option("--json", "Output raw JSON")
    .action((domain: string, keyword: string, opts: { limit: string; json?: boolean }) => {
      const cleanDomain = domain.replace(/^www\./, "");
      const db = getDb(cfg);
      const history = db.getRankHistory(cleanDomain, keyword, parseInt(opts.limit));
      db.close();

      if (history.length === 0) {
        console.log(`No rank history for "${keyword}" on ${cleanDomain}. Run: openclaw mc-seo rank ${cleanDomain} "${keyword}" first.`);
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(history, null, 2));
        return;
      }

      console.log(`\n📈 Rank History — "${keyword}" on ${cleanDomain}\n`);
      console.log(`${"Date".padEnd(22)} ${"Engine".padEnd(14)} ${"Position".padEnd(10)} URL`);
      console.log("─".repeat(80));

      for (const row of history) {
        const date = new Date(row.checked_at).toLocaleString();
        const pos = row.position === null ? "not ranked" : `#${row.position}`;
        const url = row.url ?? "";
        console.log(`${date.padEnd(22)} ${row.engine.padEnd(14)} ${pos.padEnd(10)} ${url.slice(0, 40)}`);
      }

      // Show trend summary
      const ranked = history.filter(r => r.position !== null);
      if (ranked.length >= 2) {
        const newest = ranked[0].position!;
        const oldest = ranked[ranked.length - 1].position!;
        const trend = oldest - newest; // positive = improved
        const trendStr = trend > 0 ? `↑${trend} positions improved` : trend < 0 ? `↓${Math.abs(trend)} positions dropped` : "no change";
        console.log(`\n  Trend over ${ranked.length} checks: ${trendStr} (was #${oldest}, now #${newest})`);
      }
      console.log("");
    });

  // ── mc mc-seo ping <sitemap-url> ─────────────────────────────────────────
  seo
    .command("ping <sitemapUrl>")
    .description("Submit sitemap to Google, Bing, and IndexNow")
    .action(async (sitemapUrl: string) => {
      console.log(`\n📡 Submitting sitemap: ${sitemapUrl}\n`);

      // Validate first
      const validation = await fetchSitemap(sitemapUrl);
      if (!validation.valid) {
        console.log(`❌ Sitemap invalid: ${validation.error}`);
        return;
      }
      console.log(`✅ Sitemap valid — ${validation.urls.length} URLs found\n`);

      const results = await pingSitemaps(sitemapUrl, cfg.indexNowKey);
      for (const r of results) {
        const icon = r.status === "ok" ? "✅" : "❌";
        console.log(`${icon} ${r.engine}: ${r.message}`);
      }
    });

  // ── mc mc-seo track add ──────────────────────────────────────────────────
  seo
    .command("track-add")
    .description("Record a directory/outreach submission")
    .requiredOption("--domain <domain>")
    .requiredOption("--service <service>", "e.g. Futurepedia, ProductHunt, BensBites")
    .option("--url <url>", "Listing URL")
    .option("--status <status>", "pending|submitted|live|rejected|n/a", "submitted")
    .option("--notes <notes>", "Any notes")
    .action((opts: { domain: string; service: string; url?: string; status: string; notes?: string }) => {
      const db = getDb(cfg);
      db.upsertSubmission(opts.domain, opts.service, opts.url ?? "", opts.status, opts.notes ?? "");
      db.close();
      console.log(`✅ Tracked: ${opts.domain} → ${opts.service} [${opts.status}]`);
    });

  // ── mc mc-seo track list ─────────────────────────────────────────────────
  seo
    .command("track-list [domain]")
    .description("List all tracked submissions")
    .action((domain?: string) => {
      const db = getDb(cfg);
      const rows = db.getSubmissions(domain);
      db.close();

      if (rows.length === 0) {
        console.log("No submissions tracked yet.");
        return;
      }

      const statusIcon = (s: string) =>
        s === "live" ? "🟢" : s === "submitted" ? "🟡" : s === "rejected" ? "🔴" : s === "n/a" ? "⚪" : "⏳";

      let lastDomain = "";
      for (const row of rows) {
        if (row.domain !== lastDomain) {
          console.log(`\n📍 ${row.domain}`);
          lastDomain = row.domain;
        }
        const date = row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : "–";
        console.log(`  ${statusIcon(row.status)} ${row.service.padEnd(25)} [${row.status}]  ${date}  ${row.notes || ""}`);
      }
      console.log("");
    });

  // ── mc mc-seo board <domain> ─────────────────────────────────────────────
  seo
    .command("board <domain>")
    .description("Run a full site audit then auto-create mc-board cards from findings")
    .option("--project <id>", "mc-board project ID (auto-detected if not set)")
    .option("--skip-crawl", "Skip crawl, use existing audit data from DB")
    .option("--max-pages <n>", "Max pages to crawl", "50")
    .action(async (domain: string, opts: { project?: string; skipCrawl?: boolean; maxPages: string }) => {
      const cleanDomain = domain.replace(/^www\./, "");

      // Determine project
      const projectMap: Record<string, string> = {
        "helloam.bot": "prj_c115269f",
        "miniclaw.bot": "prj_aeaba884",
        "augmentedmike.com": "prj_c7043d4f",
        "blog.helloam.bot": "prj_983dfad4",
      };
      const projectId = opts.project ?? projectMap[cleanDomain];
      if (!projectId) {
        console.log(`Unknown domain ${cleanDomain}. Pass --project <id>`);
        return;
      }

      const db = getDb(cfg);
      const domCfg = getDomainConfig(cfg, cleanDomain);

      // Run fresh crawl+audit unless --skip-crawl
      if (!opts.skipCrawl) {
        const seedUrl = `https://${cleanDomain}`;
        const maxPages = parseInt(opts.maxPages);
        console.log(`\n🕷️  Crawling ${seedUrl} (max ${maxPages} pages)…\n`);
        const crawl = await crawlSite(seedUrl, {
          maxPages,
          onProgress: (done, total, current) => {
            process.stdout.write(`\r  ${done}/${total} pages… ${current.slice(0, 60)}`);
          },
        });
        const pages = crawl.pages.filter(p => p.status === 200 && !p.error);
        console.log(`\n\n📊 Auditing ${pages.length} pages…`);
        const audits = await Promise.all(pages.map(p => auditPage(p.url, domCfg.targetKeywords)));
        for (const audit of audits) {
          db.saveAudit(cleanDomain, audit.url, audit.score, audit.issues, audit.suggestions, audit);
        }
        console.log(`✅ Audit complete — ${audits.length} pages saved\n`);
      }

      const auditRows = db.getLatestAudits(cleanDomain);
      db.close();

      if (auditRows.length === 0) {
        console.log(`No audit data for ${cleanDomain}. Run without --skip-crawl first.`);
        return;
      }

      // Group checks by check.id+status across pages, using raw PageAudit data
      type CheckGroup = {
        name: string;
        category: string;
        status: "fail" | "warn";
        pages: string[];
        issue: string;
      };
      const groups = new Map<string, CheckGroup>();

      for (const row of auditRows) {
        let raw: PageAudit;
        try { raw = JSON.parse(row.raw) as PageAudit; } catch { continue; }
        for (const check of raw.checks) {
          if (check.status !== "fail" && check.status !== "warn") continue;
          const key = `${check.id}:${check.status}`;
          if (!groups.has(key)) {
            groups.set(key, {
              name: check.name,
              category: check.category,
              status: check.status,
              pages: [],
              issue: check.issue ?? check.name,
            });
          }
          groups.get(key)!.pages.push(row.url);
        }
      }

      let created = 0;
      let skipped = 0;
      for (const g of groups.values()) {
        const pageCount = g.pages.length;

        // Priority rules:
        // FAIL → critical (>=3 pages) or high (1-2 pages)
        // WARN >3 pages → medium; 1-2 pages → low
        let priority: string;
        if (g.status === "fail") {
          priority = pageCount >= 3 ? "critical" : "high";
        } else {
          priority = pageCount > 3 ? "medium" : "low";
        }

        const pageNames = g.pages.slice(0, 5).map(p => {
          try { return new URL(p).pathname || "/"; } catch { return p; }
        }).join(", ");
        const moreNote = g.pages.length > 5 ? ` (+${g.pages.length - 5} more)` : "";

        const title = `[${cleanDomain}] ${g.name} (${pageCount} page${pageCount > 1 ? "s" : ""})`;
        const problem = `${g.issue}\n\nAffected pages: ${pageNames}${moreNote}`;
        const plan = `Fix: ${g.issue}\n\nAffected pages:\n${g.pages.slice(0, 10).map(p => `- ${p}`).join("\n")}`;
        const categorySlug = g.category.toLowerCase().replace(/\s+/g, "-");
        const tags = `seo,${cleanDomain},${categorySlug}`;

        const result = child_process.spawnSync("mc", [
          "mc-board", "create",
          "--project", projectId,
          "--title", title,
          "--priority", priority,
          "--tags", tags,
          "--problem", problem,
          "--plan", plan,
        ], { encoding: "utf8" });

        if (result.status === 0) {
          created++;
          console.log(`✅ [${priority}] ${title}`);
        } else if ((result.stdout + result.stderr).toLowerCase().includes("similar") ||
                   (result.stdout + result.stderr).toLowerCase().includes("duplicate")) {
          skipped++;
          console.log(`⏭️  Skipped (duplicate): ${title}`);
        } else {
          console.log(`❌ Failed: ${title}`);
          if (result.stderr) console.log(`   ${result.stderr.trim().slice(0, 120)}`);
        }
      }

      console.log(`\nCreated ${created} cards, skipped ${skipped} duplicates for ${cleanDomain}`);
    });

  // ── mc mc-seo domains ────────────────────────────────────────────────────
  seo
    .command("domains")
    .description("List configured domains")
    .action(() => {
      if (Object.keys(cfg.domains).length === 0) {
        console.log("No domains configured. Add mc-seo.domains to openclaw.json");
        return;
      }
      for (const [domain, dcfg] of Object.entries(cfg.domains)) {
        console.log(`\n📍 ${domain}`);
        if (dcfg.sitemapUrl) console.log(`   Sitemap:  ${dcfg.sitemapUrl}`);
        if (dcfg.devUrl) console.log(`   Dev URL:  ${dcfg.devUrl}`);
        if (dcfg.targetKeywords.length > 0) {
          console.log(`   Keywords: ${dcfg.targetKeywords.join(", ")}`);
        }
      }
    });
}
