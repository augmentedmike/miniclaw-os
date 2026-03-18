/**
 * scraper.ts — Competitor page scraper with change detection
 */

import * as cheerio from "cheerio";

export type PageData = {
  url: string;
  title: string;
  headings: string[];
  textContent: string;
  links: string[];
  meta: Record<string, string>;
  fetchedAt: number;
};

export type SnapshotDiff = {
  hasChanges: boolean;
  summary: string;
  details: string[];
};

const USER_AGENT = "Mozilla/5.0 (compatible; mc-research/0.1; +https://miniclaw.bot)";

/**
 * Fetch and parse a page into structured data
 */
export async function scrapePage(url: string): Promise<PageData> {
  const resp = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch ${url}: ${resp.status} ${resp.statusText}`);
  }

  const html = await resp.text();
  const $ = cheerio.load(html);

  // Remove scripts and styles
  $("script, style, noscript").remove();

  const title = $("title").text().trim();
  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const text = $(el).text().trim();
    if (text) headings.push(text);
  });

  const textContent = $("body").text().replace(/\s+/g, " ").trim().slice(0, 10_000);

  const links: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href && href.startsWith("http")) links.push(href);
  });

  const meta: Record<string, string> = {};
  $("meta[name], meta[property]").each((_, el) => {
    const name = $(el).attr("name") ?? $(el).attr("property") ?? "";
    const content = $(el).attr("content") ?? "";
    if (name && content) meta[name] = content;
  });

  return {
    url,
    title,
    headings,
    textContent,
    links: [...new Set(links)].slice(0, 50),
    meta,
    fetchedAt: Date.now(),
  };
}

/**
 * Guess common page URLs for a competitor domain
 */
export function guessPageUrls(domain: string, maxPages: number = 5): Array<{ url: string; type: string }> {
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  const candidates = [
    { url: base, type: "homepage" },
    { url: `${base}/pricing`, type: "pricing" },
    { url: `${base}/features`, type: "features" },
    { url: `${base}/about`, type: "about" },
    { url: `${base}/changelog`, type: "changelog" },
    { url: `${base}/blog`, type: "blog" },
    { url: `${base}/docs`, type: "docs" },
    { url: `${base}/product`, type: "product" },
  ];
  return candidates.slice(0, maxPages);
}

/**
 * Compare two snapshots and produce a diff summary
 */
export function diffSnapshots(prev: PageData | null, curr: PageData): SnapshotDiff {
  if (!prev) {
    return {
      hasChanges: true,
      summary: "Initial snapshot captured",
      details: [`Title: ${curr.title}`, `Headings: ${curr.headings.length}`, `Links: ${curr.links.length}`],
    };
  }

  const details: string[] = [];

  if (prev.title !== curr.title) {
    details.push(`Title changed: "${prev.title}" → "${curr.title}"`);
  }

  const newHeadings = curr.headings.filter((h) => !prev.headings.includes(h));
  const removedHeadings = prev.headings.filter((h) => !curr.headings.includes(h));
  if (newHeadings.length > 0) details.push(`New headings: ${newHeadings.join(", ")}`);
  if (removedHeadings.length > 0) details.push(`Removed headings: ${removedHeadings.join(", ")}`);

  const newLinks = curr.links.filter((l) => !prev.links.includes(l));
  const removedLinks = prev.links.filter((l) => !curr.links.includes(l));
  if (newLinks.length > 0) details.push(`New links: +${newLinks.length}`);
  if (removedLinks.length > 0) details.push(`Removed links: -${removedLinks.length}`);

  // Simple text similarity check
  const prevWords = new Set(prev.textContent.split(/\s+/).slice(0, 500));
  const currWords = new Set(curr.textContent.split(/\s+/).slice(0, 500));
  const overlap = [...prevWords].filter((w) => currWords.has(w)).length;
  const similarity = prevWords.size > 0 ? overlap / prevWords.size : 1;
  if (similarity < 0.8) {
    details.push(`Significant content change detected (${Math.round(similarity * 100)}% overlap)`);
  }

  return {
    hasChanges: details.length > 0,
    summary: details.length > 0 ? `${details.length} change(s) detected` : "No changes detected",
    details,
  };
}
