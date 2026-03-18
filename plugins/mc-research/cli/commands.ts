/**
 * mc-research — CLI commands
 *
 *   mc mc-research query '<question>'          — deep research via Perplexity
 *   mc mc-research search '<keyword>'          — web search
 *   mc mc-research watch add <name> <domain>   — register a competitor
 *   mc mc-research watch remove <domain>       — remove a competitor
 *   mc mc-research watch list                  — list tracked competitors
 *   mc mc-research snapshot <domain>           — scrape competitor pages
 *   mc mc-research report '<query>'            — full competitive intelligence report
 *   mc mc-research history                     — list past research
 */

import type { Command } from "commander";
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

export function registerResearchCommands(
  ctx: { program: Command; logger: Logger },
  cfg: ResearchConfig,
): void {
  const cmd = ctx.program
    .command("mc-research")
    .description("Competitive intelligence and deep research");

  // ── query ──────────────────────────────────────────────────────────
  cmd
    .command("query <question>")
    .description("Deep research via Perplexity sonar API")
    .option("-f, --focus <focus>", "Focus area: web, news, academic", "web")
    .action(async (question: string, opts: { focus: string }) => {
      const apiKey = getPerplexityApiKey();
      if (!apiKey) {
        console.error("ERROR: Perplexity API key not found. Set it with: openclaw mc-vault set research-perplexity-api-key <key>");
        process.exitCode = 1;
        return;
      }

      ctx.logger.info(`mc-research: query "${question}" (focus=${opts.focus})`);
      try {
        const result = await queryPerplexity(apiKey, question, opts.focus, cfg.perplexityModel);
        const db = getDb(cfg);
        const id = db.saveReport(question, opts.focus, "perplexity", result.answer, result.citations);
        const report = db.getReportById(id)!;
        db.close();
        console.log(formatResearchReport(report));
      } catch (e) {
        console.error(`ERROR: ${(e as Error).message}`);
        process.exitCode = 1;
      }
    });

  // ── search ─────────────────────────────────────────────────────────
  cmd
    .command("search <query>")
    .description("Web search via Google/SerpAPI/Bing")
    .option("-n, --num <number>", "Number of results", "5")
    .action(async (query: string, opts: { num: string }) => {
      ctx.logger.info(`mc-research: search "${query}"`);
      try {
        const keys = getSearchKeys();
        const result = await webSearch(query, keys, cfg.searchProvider, parseInt(opts.num, 10));
        const db = getDb(cfg);
        db.saveSearch(query, result.provider, result.results);
        db.close();
        console.log(formatSearchResults(result.results, query, result.provider));
      } catch (e) {
        console.error(`ERROR: ${(e as Error).message}`);
        process.exitCode = 1;
      }
    });

  // ── watch ──────────────────────────────────────────────────────────
  const watchCmd = cmd.command("watch").description("Manage competitor tracking");

  watchCmd
    .command("add <name> <domain>")
    .description("Register a competitor to track")
    .option("--notes <notes>", "Notes about this competitor", "")
    .action((name: string, domain: string, opts: { notes: string }) => {
      ctx.logger.info(`mc-research: watch add ${name} (${domain})`);
      const db = getDb(cfg);
      db.addCompetitor(name, domain, opts.notes);
      const competitors = db.getCompetitors();
      db.close();
      console.log(`Added competitor: ${name} (${domain})`);
      console.log(formatCompetitorList(competitors));
    });

  watchCmd
    .command("remove <domain>")
    .description("Remove a tracked competitor")
    .action((domain: string) => {
      const db = getDb(cfg);
      const removed = db.removeCompetitor(domain);
      db.close();
      console.log(removed ? `Removed: ${domain}` : `Not found: ${domain}`);
    });

  watchCmd
    .command("list")
    .description("List all tracked competitors")
    .action(() => {
      const db = getDb(cfg);
      const competitors = db.getCompetitors();
      db.close();
      console.log(formatCompetitorList(competitors));
    });

  // ── snapshot ───────────────────────────────────────────────────────
  cmd
    .command("snapshot <domain>")
    .description("Scrape competitor pages and detect changes")
    .option("-p, --pages <pages>", "Comma-separated page types (default: all)")
    .action(async (domain: string, opts: { pages?: string }) => {
      const db = getDb(cfg);
      const competitor = db.getCompetitorByDomain(domain);
      if (!competitor) {
        console.error(`ERROR: Competitor not found: ${domain}. Add it first with: mc mc-research watch add <name> ${domain}`);
        db.close();
        process.exitCode = 1;
        return;
      }

      ctx.logger.info(`mc-research: snapshot ${domain}`);
      const pageTypes = opts.pages ? opts.pages.split(",").map((s) => s.trim()) : undefined;
      const urls = guessPageUrls(domain, cfg.maxSnapshotPages);
      const filtered = pageTypes ? urls.filter((u) => pageTypes.includes(u.type)) : urls;

      for (const page of filtered) {
        try {
          const data = await scrapePage(page.url);
          const prevSnapshot = db.getLatestSnapshot(competitor.id, page.type);
          const prevData = prevSnapshot ? (JSON.parse(prevSnapshot.data) as Record<string, unknown>) : null;
          const diff = diffSnapshots(prevData as any, data);

          db.saveSnapshot(
            competitor.id,
            page.type,
            page.url,
            data,
            diff.hasChanges ? diff.details.join("\n") : "",
          );

          console.log(`✅ ${page.type} (${page.url}): ${diff.summary}`);
          if (diff.hasChanges) {
            diff.details.forEach((d) => console.log(`   - ${d}`));
          }
        } catch (e) {
          console.log(`⚠️  ${page.type} (${page.url}): ${(e as Error).message}`);
        }
      }

      db.close();
    });

  // ── report ─────────────────────────────────────────────────────────
  cmd
    .command("report <query>")
    .description("Generate a full competitive intelligence report")
    .option("-c, --competitor <domain>", "Include competitor snapshots")
    .action(async (query: string, opts: { competitor?: string }) => {
      ctx.logger.info(`mc-research: report "${query}"`);

      const sections: string[] = [];
      sections.push(`# Competitive Intelligence Report\n**Topic:** ${query}\n**Date:** ${new Date().toISOString().split("T")[0]}\n`);

      // Deep research
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
          sections.push(`## Deep Research\n\n⚠️ ${(e as Error).message}\n`);
        }
      }

      // Web search
      try {
        const keys = getSearchKeys();
        const result = await webSearch(query, keys, cfg.searchProvider, 5);
        const db = getDb(cfg);
        db.saveSearch(query, result.provider, result.results);
        db.close();
        sections.push(formatSearchResults(result.results, query, result.provider));
      } catch { /* no search providers */ }

      // Competitor snapshots
      if (opts.competitor) {
        const db = getDb(cfg);
        const comp = db.getCompetitorByDomain(opts.competitor);
        if (comp) {
          const snapshots = db.getSnapshots(comp.id);
          if (snapshots.length > 0) {
            sections.push(`## Competitor Snapshots: ${comp.name}\n`);
            const seen = new Set<string>();
            for (const snap of snapshots) {
              if (!seen.has(snap.page_type)) {
                seen.add(snap.page_type);
                sections.push(formatSnapshot(snap, comp.name));
              }
            }
          }
        }
        db.close();
      }

      const fullReport = sections.join("\n---\n\n");
      const db = getDb(cfg);
      db.saveReport(query, "report", "combined", fullReport, []);
      db.close();

      console.log(fullReport);
    });

  // ── history ────────────────────────────────────────────────────────
  cmd
    .command("history")
    .description("List past research queries and reports")
    .option("-n, --num <number>", "Number of recent items", "20")
    .action((opts: { num: string }) => {
      const db = getDb(cfg);
      const reports = db.getReports(parseInt(opts.num, 10));
      db.close();
      console.log(formatHistory(reports));
    });
}
