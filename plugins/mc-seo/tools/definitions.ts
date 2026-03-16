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
import { createExperiment, applyExperiment, measureExperiment, revertExperiment, rowToExperiment } from "../src/experiment.js";
import { proposeNextExperiment } from "../src/strategy.js";
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

    // ── seo_experiment_propose ─────────────────────────────────────────────
    {
      name: "seo_experiment_propose",
      label: "seo_experiment_propose",
      description:
        "Propose the next SEO experiment for a domain based on audit data and rank history. " +
        "Analyzes opportunities and returns the highest-impact change to try.",
      parameters: {
        type: "object",
        required: ["domain"],
        properties: {
          domain: { type: "string", description: "Domain to analyze (e.g. miniclaw.bot)" },
        },
      },
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, string>;
        const domain = p["domain"].replace(/^www\./, "");
        const db = getDb(cfg);

        logger.info(`mc-seo: seo_experiment_propose domain=${domain}`);
        const proposal = proposeNextExperiment(db, domain);
        if (!proposal) {
          db.close();
          return ok("No experiment opportunities found. Run seo_crawl first to generate audit data.");
        }

        const exp = createExperiment(db, domain);
        db.close();

        if (!exp) return ok("Audit data exists but no actionable experiment could be generated.");

        return ok(
          `Proposed experiment: ${exp.id}\n` +
          `URL: ${exp.url}\n` +
          `Type: ${exp.change.type}\n` +
          `Hypothesis: ${exp.hypothesis}\n` +
          `Metric: ${exp.metric} (baseline: ${exp.baselineValue})\n` +
          `Status: ${exp.status}\n` +
          `Wait: ${exp.waitDays} days after applying`
        );
      },
    } as AnyAgentTool,

    // ── seo_experiment_apply ──────────────────────────────────────────────
    {
      name: "seo_experiment_apply",
      label: "seo_experiment_apply",
      description:
        "Apply a proposed SEO experiment. For git-based sites: edits the file, commits, and pushes. " +
        "Requires experiment_id, repo_dir, file, before text, and after text.",
      parameters: {
        type: "object",
        required: ["experiment_id", "repo_dir", "file", "before", "after"],
        properties: {
          experiment_id: { type: "string", description: "Experiment ID (e.g. exp_abc123)" },
          repo_dir: { type: "string", description: "Absolute path to the git repo" },
          file: { type: "string", description: "Relative path to the file to modify" },
          before: { type: "string", description: "Text to find and replace" },
          after: { type: "string", description: "Replacement text" },
        },
      },
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, string>;
        const db = getDb(cfg);

        logger.info(`mc-seo: seo_experiment_apply id=${p["experiment_id"]}`);
        const result = applyExperiment(db, p["experiment_id"], {
          repoDir: p["repo_dir"],
          file: p["file"],
          before: p["before"],
          after: p["after"],
        });
        db.close();

        if (!result.ok) return ok(`Failed to apply experiment: ${result.error}`);
        return ok(`Experiment ${p["experiment_id"]} applied and pushed. Status: waiting. Will measure in 7 days.`);
      },
    } as AnyAgentTool,

    // ── seo_experiment_check ──────────────────────────────────────────────
    {
      name: "seo_experiment_check",
      label: "seo_experiment_check",
      description:
        "Re-measure a waiting SEO experiment. Runs audit/rank check and compares to baseline. " +
        "If no experiment_id given, checks all experiments past their wait period.",
      parameters: {
        type: "object",
        required: [],
        properties: {
          experiment_id: { type: "string", description: "Specific experiment ID to check (optional)" },
        },
      },
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, string>;
        const db = getDb(cfg);
        const lines: string[] = [];

        if (p["experiment_id"]) {
          logger.info(`mc-seo: seo_experiment_check id=${p["experiment_id"]}`);
          const result = await measureExperiment(db, p["experiment_id"], cfg);
          if (!result.ok) {
            lines.push(`Error: ${result.error}`);
          } else {
            lines.push(`Experiment ${p["experiment_id"]}: ${result.improved ? "IMPROVED" : "no improvement"} (delta: ${result.delta})`);
          }
        } else {
          logger.info("mc-seo: seo_experiment_check (all waiting)");
          const active = db.getActiveExperiments();
          const now = Date.now();
          let checked = 0;

          for (const exp of active) {
            if (!exp.applied_at) continue;
            const appliedMs = new Date(exp.applied_at).getTime();
            const waitMs = exp.wait_days * 24 * 60 * 60 * 1000;
            if (now - appliedMs < waitMs) {
              const daysLeft = Math.ceil((waitMs - (now - appliedMs)) / (24 * 60 * 60 * 1000));
              lines.push(`${exp.id}: still waiting (${daysLeft} days left)`);
              continue;
            }

            const result = await measureExperiment(db, exp.id, cfg);
            checked++;
            if (!result.ok) {
              lines.push(`${exp.id}: error — ${result.error}`);
            } else {
              lines.push(`${exp.id}: ${result.improved ? "IMPROVED" : "no improvement"} (delta: ${result.delta})`);
            }
          }

          if (active.length === 0) lines.push("No active experiments to check.");
          else if (checked === 0 && lines.length > 0) lines.unshift("All experiments still within wait period:");
        }

        db.close();
        return ok(lines.join("\n"));
      },
    } as AnyAgentTool,

    // ── seo_experiment_revert ─────────────────────────────────────────────
    {
      name: "seo_experiment_revert",
      label: "seo_experiment_revert",
      description: "Revert a failed SEO experiment by git-reverting its commit.",
      parameters: {
        type: "object",
        required: ["experiment_id", "repo_dir"],
        properties: {
          experiment_id: { type: "string", description: "Experiment ID to revert" },
          repo_dir: { type: "string", description: "Absolute path to the git repo" },
        },
      },
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, string>;
        const db = getDb(cfg);

        logger.info(`mc-seo: seo_experiment_revert id=${p["experiment_id"]}`);
        const result = revertExperiment(db, p["experiment_id"], p["repo_dir"]);
        db.close();

        if (!result.ok) return ok(`Failed to revert: ${result.error}`);
        return ok(`Experiment ${p["experiment_id"]} reverted successfully.`);
      },
    } as AnyAgentTool,

    // ── seo_experiment_history ─────────────────────────────────────────────
    {
      name: "seo_experiment_history",
      label: "seo_experiment_history",
      description: "List all SEO experiments for a domain with their status and results.",
      parameters: {
        type: "object",
        required: ["domain"],
        properties: {
          domain: { type: "string", description: "Domain to list experiments for" },
        },
      },
      async execute(_id: string, _input: unknown) {
        const p = _input as Record<string, string>;
        const domain = p["domain"].replace(/^www\./, "");
        const db = getDb(cfg);

        logger.info(`mc-seo: seo_experiment_history domain=${domain}`);
        const experiments = db.listExperiments(domain);
        db.close();

        if (experiments.length === 0) return ok(`No experiments found for ${domain}.`);

        const lines = experiments.map(e => {
          const exp = rowToExperiment(e);
          const result = exp.resultValue !== undefined ? ` → result: ${exp.resultValue}` : "";
          return `${exp.id} [${exp.status}] ${exp.change.type} on ${exp.url} (baseline: ${exp.baselineValue}${result})`;
        });

        return ok(`Experiments for ${domain} (${experiments.length}):\n${lines.join("\n")}`);
      },
    } as AnyAgentTool,

  ];
}
