/**
 * reporter.ts — format audit results for terminal output and Telegram
 */

import type { PageAudit, CheckResult } from "./audit.js";
import type { CrawlSummary } from "./crawler.js";

const PASS = "✅";
const WARN = "⚠️ ";
const FAIL = "❌";
const INFO = "ℹ️ ";

function statusIcon(s: CheckResult["status"]): string {
  return s === "pass" ? PASS : s === "warn" ? WARN : s === "fail" ? FAIL : INFO;
}

function gradeColor(grade: string): string {
  const colors: Record<string, string> = { "A+": "🟢", A: "🟢", B: "🟡", C: "🟠", D: "🔴", F: "🔴" };
  return colors[grade] ?? "⚪";
}

export function formatPageAudit(audit: PageAudit, verbose = false): string {
  const lines: string[] = [];
  const gc = gradeColor(audit.grade);

  lines.push(`${gc} ${audit.grade} — Score: ${audit.score}/100`);
  lines.push(`URL: ${audit.url}`);
  if (audit.statusCode) lines.push(`HTTP: ${audit.statusCode} | Response: ${audit.responseTimeMs}ms | Words: ${audit.wordCount}`);
  if (audit.title) lines.push(`Title: "${audit.title}"`);
  lines.push("");

  // Group checks by category
  const byCategory = new Map<string, CheckResult[]>();
  for (const c of audit.checks) {
    if (!byCategory.has(c.category)) byCategory.set(c.category, []);
    byCategory.get(c.category)!.push(c);
  }

  for (const [category, checks] of byCategory) {
    const catScore = checks.reduce((s, c) => s + c.points, 0);
    const catMax = checks.reduce((s, c) => s + c.maxPoints, 0);
    const catPct = catMax > 0 ? Math.round(catScore / catMax * 100) : 100;
    lines.push(`── ${category} (${catScore}/${catMax} pts, ${catPct}%)`);

    for (const c of checks) {
      if (c.status === "pass" && !verbose) continue;
      const icon = statusIcon(c.status);
      const val = c.value ? ` → ${c.value}` : "";
      lines.push(`  ${icon} ${c.name}${val}`);
      if (c.issue) lines.push(`     Issue: ${c.issue}`);
      if (c.suggestion && (verbose || c.status === "fail")) lines.push(`     Fix:   ${c.suggestion}`);
    }
    lines.push("");
  }

  if (audit.issues.length > 0) {
    lines.push("🚨 Critical Issues:");
    for (const issue of audit.issues) lines.push(`  • ${issue}`);
    lines.push("");
  }

  if (audit.suggestions.length > 0) {
    lines.push("💡 Suggestions:");
    for (const s of audit.suggestions.slice(0, 5)) lines.push(`  • ${s}`);
    if (audit.suggestions.length > 5) lines.push(`  … and ${audit.suggestions.length - 5} more`);
  }

  return lines.join("\n");
}

export function formatSiteSummary(
  crawl: CrawlSummary,
  audits: PageAudit[]
): string {
  const lines: string[] = [];
  const total = audits.length;
  const avg = total > 0 ? Math.round(audits.reduce((s, a) => s + a.score, 0) / total) : 0;

  const grades = { "A+": 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const a of audits) grades[a.grade as keyof typeof grades]++;

  lines.push(`╔══════════════════════════════════════════╗`);
  lines.push(`  Site Audit: ${crawl.origin}`);
  lines.push(`  Pages crawled: ${total} | Avg score: ${avg}/100`);
  lines.push(`  Duration: ${(crawl.durationMs / 1000).toFixed(1)}s`);
  lines.push(`╚══════════════════════════════════════════╝`);
  lines.push("");

  lines.push(`Grade distribution:`);
  for (const [g, count] of Object.entries(grades)) {
    if (count > 0) lines.push(`  ${gradeColor(g)} ${g}: ${count} page${count !== 1 ? "s" : ""}`);
  }
  lines.push("");

  if (crawl.brokenLinks.length > 0) {
    lines.push(`🚨 Broken Links (${crawl.brokenLinks.length}):`);
    for (const bl of crawl.brokenLinks.slice(0, 10)) {
      lines.push(`  ${FAIL} ${bl.url} (${bl.status}) ← linked from ${bl.linkedFrom}`);
    }
    if (crawl.brokenLinks.length > 10) lines.push(`  … and ${crawl.brokenLinks.length - 10} more`);
    lines.push("");
  }

  if (crawl.orphanedPages.length > 0) {
    lines.push(`⚠️  Orphaned Pages (no inbound links) (${crawl.orphanedPages.length}):`);
    for (const p of crawl.orphanedPages.slice(0, 5)) lines.push(`  • ${p}`);
    lines.push("");
  }

  // Pages needing work (score < 80), sorted worst first
  const needsWork = audits.filter(a => a.score < 80).sort((a, b) => a.score - b.score);
  if (needsWork.length > 0) {
    lines.push(`📋 Pages needing work:`);
    for (const a of needsWork.slice(0, 10)) {
      const gc = gradeColor(a.grade);
      lines.push(`  ${gc} ${a.grade} (${a.score}) ${a.url}`);
      if (a.issues.length > 0) lines.push(`     ↳ ${a.issues[0]}`);
    }
    lines.push("");
  }

  // Top performing pages
  const topPages = [...audits].sort((a, b) => b.score - a.score).slice(0, 3);
  if (topPages.length > 0) {
    lines.push(`🏆 Top pages:`);
    for (const a of topPages) {
      lines.push(`  ${gradeColor(a.grade)} ${a.grade} (${a.score}) ${a.url}`);
    }
  }

  return lines.join("\n");
}

export function formatChecklistTable(audits: PageAudit[]): string {
  if (audits.length === 0) return "No pages audited.";

  // Collect all unique check IDs
  const checkIds = [...new Set(audits.flatMap(a => a.checks.map(c => c.id)))];

  // Header
  const urlMaxLen = Math.min(50, Math.max(...audits.map(a => a.url.length)));
  const header = `${"Page".padEnd(urlMaxLen)} | Score | ${checkIds.slice(0, 10).map(id => id.slice(0, 5).padEnd(5)).join(" | ")}`;
  const divider = "─".repeat(header.length);

  const rows = audits.map(a => {
    const checkMap = new Map(a.checks.map(c => [c.id, c.status]));
    const url = a.url.slice(0, urlMaxLen).padEnd(urlMaxLen);
    const score = String(a.score).padStart(5);
    const cols = checkIds.slice(0, 10).map(id => {
      const s = checkMap.get(id);
      return (s === "pass" ? "  ✅ " : s === "warn" ? "  ⚠️ " : s === "fail" ? "  ❌ " : "  -- ").padEnd(5);
    });
    return `${url} | ${score} | ${cols.join(" | ")}`;
  });

  return [header, divider, ...rows].join("\n");
}
