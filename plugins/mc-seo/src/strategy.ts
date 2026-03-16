/**
 * strategy.ts — SEO experiment strategy engine
 *
 * Reads audit results + rank data, returns prioritized opportunities,
 * and proposes the next best experiment to run.
 */

import { SeoDb, type AuditRow, type RankRow, type ExperimentRow } from "./db.js";

export type StrategyType = "audit-driven" | "rank-driven" | "content-driven" | "schema-driven";

export type Opportunity = {
  strategy: StrategyType;
  domain: string;
  url: string;
  issue: string;
  impact: number; // 0-100, higher = more impactful
  suggestion: string;
  changeType: string;
};

export type ExperimentProposal = {
  domain: string;
  url: string;
  hypothesis: string;
  changeType: string;
  metric: string;
  baselineValue: number;
  strategy: StrategyType;
  waitDays: number;
};

/**
 * Analyze all opportunities for a domain, across all strategy types.
 * Returns a prioritized list (highest impact first).
 */
export function analyzeOpportunities(db: SeoDb, domain: string): Opportunity[] {
  const opportunities: Opportunity[] = [];

  // Audit-driven: find failing checks on low-scoring pages
  const audits = db.getLatestAudits(domain);
  for (const audit of audits) {
    const raw = parseRaw(audit);
    if (!raw) continue;

    for (const check of raw.checks) {
      if (check.status !== "fail") continue;
      const lostPoints = check.maxPoints - check.points;
      opportunities.push({
        strategy: "audit-driven",
        domain,
        url: audit.url,
        issue: check.issue ?? check.name,
        impact: Math.min(100, lostPoints * 10 + (100 - audit.score)),
        suggestion: check.suggestion ?? `Fix: ${check.name}`,
        changeType: mapCheckToChangeType(check.id),
      });
    }

    // Content-driven: thin pages
    if (raw.wordCount !== undefined && raw.wordCount < 600) {
      opportunities.push({
        strategy: "content-driven",
        domain,
        url: audit.url,
        issue: `Thin content: only ${raw.wordCount} words`,
        impact: Math.min(100, 60 + (600 - raw.wordCount) / 10),
        suggestion: "Expand page content to 600+ words with relevant information, FAQs, or use cases.",
        changeType: "content",
      });
    }

    // Schema-driven: pages without structured data
    const schemaCheck = raw.checks.find((c: { id: string }) => c.id === "schema");
    if (schemaCheck && schemaCheck.status === "fail") {
      opportunities.push({
        strategy: "schema-driven",
        domain,
        url: audit.url,
        issue: "No structured data (JSON-LD)",
        impact: 55,
        suggestion: "Add Schema.org JSON-LD markup (Organization, WebPage, FAQPage).",
        changeType: "schema",
      });
    }
  }

  // Rank-driven: keywords in striking distance (position 5-20)
  const keywords = getTrackedKeywords(db, domain);
  for (const kw of keywords) {
    const latest = db.getLatestRank(domain, kw);
    if (latest && latest.position !== null && latest.position >= 5 && latest.position <= 20) {
      opportunities.push({
        strategy: "rank-driven",
        domain,
        url: latest.url ?? `https://${domain}`,
        issue: `"${kw}" at position #${latest.position} — within striking distance`,
        impact: Math.min(100, 80 - (latest.position - 5) * 3),
        suggestion: `Optimize title, H1, and content for "${kw}" to push into top 5.`,
        changeType: "title",
      });
    }
  }

  // Sort by impact descending
  opportunities.sort((a, b) => b.impact - a.impact);

  // Filter out opportunities that match already-active experiments
  const active = db.getActiveExperiments();
  const activeUrls = new Set(active.map(e => `${e.url}:${e.change_type}`));
  return opportunities.filter(o => !activeUrls.has(`${o.url}:${o.changeType}`));
}

/**
 * Propose the single highest-impact experiment to run next.
 * Skips opportunities that have already been tried (same url + changeType with status kept/reverted).
 */
export function proposeNextExperiment(db: SeoDb, domain: string): ExperimentProposal | null {
  const opportunities = analyzeOpportunities(db, domain);
  if (opportunities.length === 0) return null;

  // Filter out experiments already tried for the same url+changeType
  const pastExperiments = db.listExperiments(domain);
  const triedKeys = new Set(
    pastExperiments
      .filter(e => e.status === "kept" || e.status === "reverted" || e.status === "measured")
      .map(e => `${e.url}:${e.change_type}`)
  );

  const best = opportunities.find(o => !triedKeys.has(`${o.url}:${o.changeType}`));
  if (!best) return null;

  // Determine baseline
  let baselineValue = 0;
  let metric = "score";

  if (best.strategy === "rank-driven") {
    // Use rank as the metric
    const kw = extractKeywordFromIssue(best.issue);
    if (kw) {
      metric = `rank:${kw}`;
      const latest = db.getLatestRank(domain, kw);
      baselineValue = latest?.position ?? 101;
    }
  } else {
    // Use audit score as the metric
    const audits = db.getLatestAudits(domain);
    const pageAudit = audits.find(a => a.url === best.url);
    baselineValue = pageAudit?.score ?? 0;
  }

  return {
    domain,
    url: best.url,
    hypothesis: `${best.suggestion} — expected to improve ${metric === "score" ? "page score" : "ranking"}`,
    changeType: best.changeType,
    metric,
    baselineValue,
    strategy: best.strategy,
    waitDays: 7,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseRaw(row: AuditRow): {
  checks: Array<{ id: string; name: string; status: string; value?: string; issue?: string; suggestion?: string; maxPoints: number; points: number }>;
  wordCount?: number;
} | null {
  try {
    return JSON.parse(row.raw);
  } catch {
    return null;
  }
}

function mapCheckToChangeType(checkId: string): string {
  if (checkId.startsWith("title")) return "title";
  if (checkId.startsWith("meta_desc")) return "meta";
  if (checkId.startsWith("h1")) return "h1";
  if (checkId.startsWith("schema")) return "schema";
  if (checkId.startsWith("og")) return "og";
  if (checkId.startsWith("word_count") || checkId.startsWith("keyword_in_body")) return "content";
  return "content";
}

function getTrackedKeywords(db: SeoDb, domain: string): string[] {
  return db.getTrackedKeywords(domain);
}

function extractKeywordFromIssue(issue: string): string | null {
  // Extract keyword from: `"keyword" at position #N — within striking distance`
  const match = issue.match(/^"([^"]+)"/);
  return match ? match[1] : null;
}
