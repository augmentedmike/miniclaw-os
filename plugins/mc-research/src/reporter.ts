/**
 * reporter.ts — Format competitive intelligence reports
 */

import type { ReportRow, CompetitorRow, SnapshotRow } from "./db.js";

export function formatResearchReport(report: ReportRow): string {
  const citations = JSON.parse(report.citations) as string[];
  const date = new Date(report.created_at).toISOString().split("T")[0];

  let out = `## Research Report #${report.id}\n`;
  out += `**Query:** ${report.query}\n`;
  out += `**Focus:** ${report.focus} | **Source:** ${report.source} | **Date:** ${date}\n\n`;
  out += report.result + "\n";

  if (citations.length > 0) {
    out += "\n### Sources\n";
    citations.forEach((c, i) => {
      out += `${i + 1}. ${c}\n`;
    });
  }

  return out;
}

export function formatCompetitorList(competitors: CompetitorRow[]): string {
  if (competitors.length === 0) return "No competitors tracked yet. Use `research_competitor_watch` to add one.";

  let out = "## Tracked Competitors\n\n";
  out += "| # | Name | Domain | Notes | Added |\n";
  out += "|---|------|--------|-------|-------|\n";
  competitors.forEach((c, i) => {
    const date = new Date(c.created_at).toISOString().split("T")[0];
    out += `| ${i + 1} | ${c.name} | ${c.domain} | ${c.notes || "—"} | ${date} |\n`;
  });
  return out;
}

export function formatSnapshot(snapshot: SnapshotRow, competitorName: string): string {
  const data = JSON.parse(snapshot.data) as Record<string, unknown>;
  const date = new Date(snapshot.fetched_at).toISOString().split("T")[0];

  let out = `## Snapshot: ${competitorName} — ${snapshot.page_type}\n`;
  out += `**URL:** ${snapshot.url} | **Date:** ${date}\n\n`;

  if (snapshot.diff_summary) {
    out += `### Changes\n${snapshot.diff_summary}\n\n`;
  }

  if (data["title"]) out += `**Title:** ${data["title"]}\n`;
  if (Array.isArray(data["headings"]) && (data["headings"] as string[]).length > 0) {
    out += `**Headings:** ${(data["headings"] as string[]).join(" | ")}\n`;
  }

  return out;
}

export function formatSearchResults(results: Array<{ title: string; url: string; snippet: string }>, query: string, provider: string): string {
  if (results.length === 0) return `No results found for "${query}" via ${provider}.`;

  let out = `## Web Search: "${query}"\n`;
  out += `**Provider:** ${provider} | **Results:** ${results.length}\n\n`;

  results.forEach((r, i) => {
    out += `${i + 1}. **${r.title}**\n`;
    out += `   ${r.url}\n`;
    out += `   ${r.snippet}\n\n`;
  });

  return out;
}

export function formatHistory(reports: ReportRow[]): string {
  if (reports.length === 0) return "No research history yet.";

  let out = "## Research History\n\n";
  out += "| # | Date | Type | Query |\n";
  out += "|---|------|------|-------|\n";
  reports.forEach((r) => {
    const date = new Date(r.created_at).toISOString().split("T")[0];
    out += `| ${r.id} | ${date} | ${r.source}/${r.focus} | ${r.query.slice(0, 60)}${r.query.length > 60 ? "…" : ""} |\n`;
  });
  return out;
}
