/**
 * mc-research — agent tool definitions
 */

import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { ResearchConfig } from "../src/config.js";
import { ResearchDb } from "../src/db.js";
import { queryPerplexity } from "../src/perplexity.js";
import { webSearch, type SearchKeys } from "../src/search.js";
import { scrapePage, guessPageUrls, diffSnapshots } from "../src/scraper.js";
import {
  getPerplexityApiKey,
  getSerpApiKey,
  getGoogleSearchApiKey,
  getGoogleSearchCx,
  getBingApiKey,
} from "../src/vault.js";
import {
  formatResearchReport,
  formatSearchResults,
  formatCompetitorList,
  formatSnapshot,
  formatHistory,
} from "../src/reporter.js";
import * as path from "node:path";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

function ok(text: string) {
  return { content: [{ type: "text" as const, text: text.trim() }], details: {} };
}

function err(text: string) {
  return { content: [{ type: "text" as const, text: `ERROR: ${text}` }], details: {} };
}

function getDb(cfg: ResearchConfig): ResearchDb {
  return new ResearchDb(path.join(cfg.stateDir, "research.db"));
}

function getSearchKeys(): SearchKeys {
  return {
    serpApiKey: getSerpApiKey(),
    googleApiKey: getGoogleSearchApiKey(),
    googleCx: getGoogleSearchCx(),
    bingApiKey: getBingApiKey(),
  };
}

export function createResearchTools(cfg: ResearchConfig, logger: Logger): AnyAgentTool[] {
  return [

    // ── research_query ──────────────────────────────────────────────
    {
      name: "research_query",
      label: "research_query",
      description:
        "Deep research via Perplexity sonar API. Returns a synthesized answer with citations " +
        "for any research question, competitive analysis, or market intelligence query.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "Research question or topic" },
          focus: {
            type: "string",
            description: "Focus area: web (default), news, or academic",
            enum: ["web", "news", "academic"],
          },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const query = p["query"] ?? "";
        const focus = p["focus"] ?? "web";

        const apiKey = getPerplexityApiKey();
        if (!apiKey) {
          return err(
            "Perplexity API key not found. Set it with: openclaw mc-vault set research-perplexity-api-key <key>",
          );
        }

        logger.info(`mc-research: research_query "${query}" (focus=${focus})`);

        try {
          const result = await queryPerplexity(apiKey, query, focus, cfg.perplexityModel);
          const db = getDb(cfg);
          const id = db.saveReport(query, focus, "perplexity", result.answer, result.citations);
          const report = db.getReportById(id)!;
          db.close();
          return ok(formatResearchReport(report));
        } catch (e) {
          return err(`Perplexity query failed: ${(e as Error).message}`);
        }
      },
    } as AnyAgentTool,

    // ── research_web_search ─────────────────────────────────────────
    {
      name: "research_web_search",
      label: "research_web_search",
      description:
        "Search the web via Google Custom Search, SerpAPI, or Bing. Returns ranked results " +
        "with titles, URLs, and snippets. Falls back through available providers.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "Search query" },
          num_results: { type: "number", description: "Number of results (default: 5, max: 10)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const query = String(p["query"] ?? "");
        const numResults = Math.min(Number(p["num_results"] ?? 5), 10);

        logger.info(`mc-research: research_web_search "${query}" (n=${numResults})`);

        try {
          const keys = getSearchKeys();
          const result = await webSearch(query, keys, cfg.searchProvider, numResults);
          const db = getDb(cfg);
          db.saveSearch(query, result.provider, result.results);
          db.close();
          return ok(formatSearchResults(result.results, query, result.provider));
        } catch (e) {
          return err(`Web search failed: ${(e as Error).message}`);
        }
      },
    } as AnyAgentTool,

    // ── research_competitor_watch ────────────────────────────────────
    {
      name: "research_competitor_watch",
      label: "research_competitor_watch",
      description:
        "Register a competitor to track. Stores their name, domain, and notes. " +
        "Use research_competitor_snapshot to scrape their pages and detect changes over time.",
      parameters: {
        type: "object",
        required: ["name", "domain"],
        properties: {
          name: { type: "string", description: "Competitor name (e.g. 'Cursor')" },
          domain: { type: "string", description: "Competitor domain (e.g. 'cursor.com')" },
          notes: { type: "string", description: "Optional notes about this competitor" },
          action: {
            type: "string",
            description: "Action: add (default), remove, list",
            enum: ["add", "remove", "list"],
          },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const action = p["action"] ?? "add";
        const db = getDb(cfg);

        try {
          if (action === "list") {
            const competitors = db.getCompetitors();
            db.close();
            return ok(formatCompetitorList(competitors));
          }

          if (action === "remove") {
            const domain = p["domain"] ?? "";
            const removed = db.removeCompetitor(domain);
            db.close();
            return ok(removed ? `Removed competitor: ${domain}` : `No competitor found for domain: ${domain}`);
          }

          // add
          const name = p["name"] ?? "";
          const domain = p["domain"] ?? "";
          const notes = p["notes"] ?? "";

          logger.info(`mc-research: research_competitor_watch add ${name} (${domain})`);
          db.addCompetitor(name, domain, notes);
          const competitors = db.getCompetitors();
          db.close();
          return ok(`Added competitor: ${name} (${domain})\n\n${formatCompetitorList(competitors)}`);
        } catch (e) {
          db.close();
          return err(`Competitor watch failed: ${(e as Error).message}`);
        }
      },
    } as AnyAgentTool,

    // ── research_competitor_snapshot ─────────────────────────────────
    {
      name: "research_competitor_snapshot",
      label: "research_competitor_snapshot",
      description:
        "Scrape a competitor's key pages (homepage, pricing, features, changelog, about) and " +
        "store a structured snapshot. Compares against the previous snapshot to detect changes.",
      parameters: {
        type: "object",
        required: ["domain"],
        properties: {
          domain: { type: "string", description: "Competitor domain (must be registered via research_competitor_watch)" },
          pages: {
            type: "string",
            description: "Comma-separated page types to scrape (default: all). Options: homepage, pricing, features, about, changelog, blog, docs",
          },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const domain = p["domain"] ?? "";

        const db = getDb(cfg);
        const competitor = db.getCompetitorByDomain(domain);
        if (!competitor) {
          db.close();
          return err(`Competitor not found: ${domain}. Add it first with research_competitor_watch.`);
        }

        logger.info(`mc-research: research_competitor_snapshot ${domain}`);

        const pageTypes = p["pages"] ? p["pages"].split(",").map((s) => s.trim()) : undefined;
        const urls = guessPageUrls(domain, cfg.maxSnapshotPages);
        const filtered = pageTypes ? urls.filter((u) => pageTypes.includes(u.type)) : urls;

        const results: string[] = [];

        for (const page of filtered) {
          try {
            const data = await scrapePage(page.url);
            const prevSnapshot = db.getLatestSnapshot(competitor.id, page.type);
            const prevData = prevSnapshot ? (JSON.parse(prevSnapshot.data) as Record<string, unknown>) : null;

            const diff = diffSnapshots(prevData as any, data);
            const snapshotId = db.saveSnapshot(
              competitor.id,
              page.type,
              page.url,
              data,
              diff.hasChanges ? diff.details.join("\n") : "",
            );

            const snap = { id: snapshotId, competitor_id: competitor.id, page_type: page.type, url: page.url, data: JSON.stringify(data), diff_summary: diff.hasChanges ? diff.details.join("\n") : "", fetched_at: Date.now() };
            results.push(formatSnapshot(snap, competitor.name));

            if (diff.hasChanges) {
              results.push(`⚡ Changes detected:\n${diff.details.map((d) => `  - ${d}`).join("\n")}\n`);
            }
          } catch (e) {
            results.push(`⚠️ Failed to scrape ${page.url} (${page.type}): ${(e as Error).message}\n`);
          }
        }

        db.close();
        return ok(results.join("\n---\n\n"));
      },
    } as AnyAgentTool,

    // ── research_report ─────────────────────────────────────────────
    {
      name: "research_report",
      label: "research_report",
      description:
        "Generate a comprehensive competitive intelligence report. Combines Perplexity deep research " +
        "with competitor snapshots and web search results into a formatted markdown report.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "Research topic or competitor name to report on" },
          competitor_domain: { type: "string", description: "Optional: include latest snapshots for this competitor" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const query = p["query"] ?? "";
        const competitorDomain = p["competitor_domain"];

        logger.info(`mc-research: research_report "${query}"`);

        const sections: string[] = [];
        sections.push(`# Competitive Intelligence Report\n**Topic:** ${query}\n**Date:** ${new Date().toISOString().split("T")[0]}\n`);

        // 1. Deep research via Perplexity
        const apiKey = getPerplexityApiKey();
        if (apiKey) {
          try {
            const result = await queryPerplexity(apiKey, query, "web", cfg.perplexityModel);
            const db = getDb(cfg);
            db.saveReport(query, "web", "perplexity", result.answer, result.citations);
            db.close();

            sections.push(`## Deep Research\n\n${result.answer}\n`);
            if (result.citations.length > 0) {
              sections.push(`### Sources\n${result.citations.map((c, i) => `${i + 1}. ${c}`).join("\n")}\n`);
            }
          } catch (e) {
            sections.push(`## Deep Research\n\n⚠️ Perplexity query failed: ${(e as Error).message}\n`);
          }
        } else {
          sections.push(`## Deep Research\n\n⚠️ Perplexity API key not configured. Set via: openclaw mc-vault set research-perplexity-api-key <key>\n`);
        }

        // 2. Web search for recent info
        try {
          const keys = getSearchKeys();
          const searchResult = await webSearch(query, keys, cfg.searchProvider, 5);
          const db = getDb(cfg);
          db.saveSearch(query, searchResult.provider, searchResult.results);
          db.close();
          sections.push(formatSearchResults(searchResult.results, query, searchResult.provider));
        } catch {
          sections.push(`## Web Search\n\n⚠️ No search providers configured.\n`);
        }

        // 3. Competitor snapshots if specified
        if (competitorDomain) {
          const db = getDb(cfg);
          const competitor = db.getCompetitorByDomain(competitorDomain);
          if (competitor) {
            const snapshots = db.getSnapshots(competitor.id);
            if (snapshots.length > 0) {
              sections.push(`## Latest Snapshots: ${competitor.name}\n`);
              // Get latest snapshot per page type
              const seen = new Set<string>();
              for (const snap of snapshots) {
                if (!seen.has(snap.page_type)) {
                  seen.add(snap.page_type);
                  sections.push(formatSnapshot(snap, competitor.name));
                }
              }
            }
          }
          db.close();
        }

        const fullReport = sections.join("\n---\n\n");

        // Save the full report
        const db = getDb(cfg);
        db.saveReport(query, "report", "combined", fullReport, []);
        db.close();

        return ok(fullReport);
      },
    } as AnyAgentTool,
  ];
}
