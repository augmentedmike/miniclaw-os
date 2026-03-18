/**
 * mc-seo — agent tool definitions
 */

import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { SeoConfig } from "../src/config.js";
import { auditPage } from "../src/audit.js";
import { crawlSite } from "../src/crawler.js";
import { checkRank } from "../src/rank-checker.js";
import { pingSitemaps } from "../src/sitemap.js";
import { formatPageAudit, formatSiteSummary } from "../src/reporter.js";
import { SeoDb } from "../src/db.js";
import * as path from "node:path";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

function ok(text: string) {
  return { content: [{ type: "text" as const, text: text.trim() }], details: {} };
}

function getDb(cfg: SeoConfig): SeoDb {
  return new SeoDb(path.join(cfg.stateDir, "seo.db"));
}

export function createSeoTools(cfg: SeoConfig, logger: Logger): AnyAgentTool[] {
  return [

    // ── seo_audit ──────────────────────────────────────────────────────────
    {
      name: "seo_audit",
      label: "seo_audit",
      description:
        "Run a full on-page SEO audit on a URL. Returns a score (0-100), grade (A-F), " +
        "detailed check results for title, meta description, headings, content, images, schema, " +
        "Open Graph tags, and a list of specific issues and suggestions.",
      parameters: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", description: "URL to audit (must include https://)" },
          keyword: { type: "string", description: "Primary target keyword to check against" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        let url = p["url"] ?? "";
        if (!url.startsWith("http")) url = `https://${url}`;
        const domainName = new URL(url).hostname.replace(/^www\./, "");
        const domCfg = cfg.domains[domainName] ?? { targetKeywords: [] };
        const keywords = p["keyword"] ? [p["keyword"]] : domCfg.targetKeywords;

        logger.info(`mc-seo: seo_audit ${url}`);
        const audit = await auditPage(url, keywords);

        const db = getDb(cfg);
        db.saveAudit(domainName, url, audit.score, audit.issues, audit.suggestions, audit);
        db.close();

        return ok(formatPageAudit(audit, false));
      },
    } as AnyAgentTool,

    // ── seo_crawl ──────────────────────────────────────────────────────────
    {
      name: "seo_crawl",
      label: "seo_crawl",
      description:
        "Crawl an entire site and audit every page. Returns a site-wide SEO health summary " +
        "with scores, grade distribution, broken links, orphaned pages, and top issues.",
      parameters: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", description: "Seed URL to start crawling from" },
          max_pages: { type: "number", description: "Max pages to crawl (default: 50)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        let url = String(p["url"] ?? "");
        if (!url.startsWith("http")) url = `https://${url}`;
        const maxPages = typeof p["max_pages"] === "number" ? p["max_pages"] : 50;
        const domainName = new URL(url).hostname.replace(/^www\./, "");
        const domCfg = cfg.domains[domainName] ?? { targetKeywords: [] };

        logger.info(`mc-seo: seo_crawl ${url} maxPages=${maxPages}`);
        const crawl = await crawlSite(url, { maxPages });

        const db = getDb(cfg);
        const audits = await Promise.all(
          crawl.pages.filter(p => p.status === 200).map(p => auditPage(p.url, domCfg.targetKeywords))
        );
        for (const a of audits) {
          db.saveAudit(domainName, a.url, a.score, a.issues, a.suggestions, a);
        }
        db.close();

        return ok(formatSiteSummary(crawl, audits));
      },
    } as AnyAgentTool,

    // ── seo_rank_check ─────────────────────────────────────────────────────
    {
      name: "seo_rank_check",
      label: "seo_rank_check",
      description:
        "Check where a domain ranks on Google (or Bing) for a specific keyword. " +
        "Returns position number (1-100) or null if not in top 100.",
      parameters: {
        type: "object",
        required: ["domain", "keyword"],
        properties: {
          domain: { type: "string", description: "Domain to check (e.g. helloam.bot)" },
          keyword: { type: "string", description: "Search keyword to look up" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const domain = p["domain"].replace(/^www\./, "");
        const keyword = p["keyword"];

        logger.info(`mc-seo: seo_rank_check domain=${domain} keyword="${keyword}"`);
        const result = await checkRank(keyword, domain, {
          googleApiKey: cfg.googleSearchApiKey,
          googleCx: cfg.googleSearchCx,
          bingApiKey: cfg.bingApiKey,
        });

        if (result.error) return ok(`Error checking rank: ${result.error}`);
        if (result.position === null) return ok(`"${keyword}" — not found in top 100 on ${result.engine}`);

        const medal = result.position === 1 ? "🥇" : result.position <= 3 ? "🏅" : result.position <= 10 ? "🟢" : "🟡";
        return ok(`${medal} Position #${result.position} for "${keyword}" on ${result.engine}\nURL: ${result.url}`);
      },
    } as AnyAgentTool,

    // ── seo_ping_sitemap ───────────────────────────────────────────────────
    {
      name: "seo_ping_sitemap",
      label: "seo_ping_sitemap",
      description: "Submit a sitemap URL to Google, Bing, and IndexNow for immediate indexing.",
      parameters: {
        type: "object",
        required: ["sitemap_url"],
        properties: {
          sitemap_url: { type: "string", description: "Full sitemap URL (e.g. https://helloam.bot/sitemap.xml)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const sitemapUrl = p["sitemap_url"];
        logger.info(`mc-seo: seo_ping_sitemap ${sitemapUrl}`);
        const results = await pingSitemaps(sitemapUrl, cfg.indexNowKey);
        const lines = results.map(r => `${r.status === "ok" ? "✅" : "❌"} ${r.engine}: ${r.message}`);
        return ok(lines.join("\n"));
      },
    } as AnyAgentTool,

    // ── seo_track_submission ───────────────────────────────────────────────
    {
      name: "seo_track_submission",
      label: "seo_track_submission",
      description:
        "Record or update a directory/outreach submission for tracking. " +
        "Use to log when you submit to Futurepedia, ProductHunt, newsletters, etc.",
      parameters: {
        type: "object",
        required: ["domain", "service", "status"],
        properties: {
          domain: { type: "string", description: "Domain (e.g. helloam.bot)" },
          service: { type: "string", description: "Service/directory name (e.g. Futurepedia)" },
          service_url: { type: "string", description: "Listing URL if known" },
          status: { type: "string", enum: ["pending", "submitted", "live", "rejected", "n/a"] },
          notes: { type: "string", description: "Any notes (pitch sent, contact info, etc.)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const db = getDb(cfg);
        db.upsertSubmission(p["domain"], p["service"], p["service_url"] ?? "", p["status"], p["notes"] ?? "");
        db.close();
        return ok(`Tracked: ${p["domain"]} → ${p["service"]} [${p["status"]}]`);
      },
    } as AnyAgentTool,

  ];
}
