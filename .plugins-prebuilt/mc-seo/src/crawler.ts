/**
 * crawler.ts — recursive site crawler
 *
 * Follows internal links from a seed URL, collects all unique page URLs,
 * respects robots.txt, and returns a list of discovered pages.
 */

import { parse } from "node-html-parser";

export type CrawlResult = {
  url: string;
  status: number;
  redirectedTo?: string;
  linkedFrom: string[];
  internalLinks: string[];
  externalLinks: string[];
  error?: string;
};

export type CrawlSummary = {
  seedUrl: string;
  origin: string;
  pages: CrawlResult[];
  brokenLinks: { url: string; linkedFrom: string; status: number }[];
  orphanedPages: string[];
  durationMs: number;
};

function normalizeUrl(url: string, base: string): string | null {
  try {
    const u = new URL(url, base);
    // Strip hash, normalize trailing slash for root only
    u.hash = "";
    if (u.pathname === "/" || u.pathname === "") u.pathname = "/";
    return u.href;
  } catch {
    return null;
  }
}

function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function isHtmlUrl(url: string): boolean {
  const ext = url.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
  if (!ext) return true; // no extension, likely HTML
  const nonHtml = ["css","js","png","jpg","jpeg","gif","webp","svg","ico","pdf","zip","woff","woff2","ttf","mp4","mp3","xml","json"];
  return !nonHtml.includes(ext);
}

async function fetchRobotsTxt(origin: string): Promise<string> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { "User-Agent": "mc-seo/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) return await res.text();
  } catch {}
  return "";
}

function isDisallowedByRobots(url: string, robotsTxt: string): boolean {
  if (!robotsTxt) return false;
  const path = new URL(url).pathname;
  const lines = robotsTxt.split("\n").map(l => l.trim());
  let inRelevantAgent = false;
  for (const line of lines) {
    if (/^User-agent:\s*\*/i.test(line) || /^User-agent:\s*mc-seo/i.test(line)) {
      inRelevantAgent = true;
    } else if (/^User-agent:/i.test(line)) {
      inRelevantAgent = false;
    }
    if (inRelevantAgent && /^Disallow:/i.test(line)) {
      const disPath = line.replace(/^Disallow:\s*/i, "").trim();
      if (disPath && path.startsWith(disPath)) return true;
    }
  }
  return false;
}

export async function crawlSite(
  seedUrl: string,
  opts: {
    maxPages?: number;
    maxDepth?: number;
    concurrency?: number;
    onProgress?: (done: number, total: number, url: string) => void;
  } = {}
): Promise<CrawlSummary> {
  const start = Date.now();
  const maxPages = opts.maxPages ?? 200;
  const maxDepth = opts.maxDepth ?? 10;
  const concurrency = opts.concurrency ?? 3;

  const origin = new URL(seedUrl).origin;
  const robotsTxt = await fetchRobotsTxt(origin);

  const queue: { url: string; depth: number; from: string }[] = [{ url: seedUrl, depth: 0, from: "" }];
  const visited = new Set<string>();
  const results: CrawlResult[] = [];
  const inboundLinks = new Map<string, Set<string>>(); // url → set of pages linking to it

  while (queue.length > 0 && visited.size < maxPages) {
    // Process `concurrency` pages at a time
    const batch = queue.splice(0, concurrency);

    await Promise.all(batch.map(async ({ url, depth, from }) => {
      if (visited.has(url)) return;
      if (isDisallowedByRobots(url, robotsTxt)) return;
      visited.add(url);

      opts.onProgress?.(visited.size, visited.size + queue.length, url);

      const result: CrawlResult = {
        url,
        status: 0,
        linkedFrom: from ? [from] : [],
        internalLinks: [],
        externalLinks: [],
      };

      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "mc-seo/1.0 (+https://miniclaw.bot)" },
          redirect: "follow",
          signal: AbortSignal.timeout(10000),
        });
        result.status = res.status;
        if (res.url !== url) result.redirectedTo = res.url;

        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("text/html")) {
          results.push(result);
          return;
        }

        const html = await res.text();
        const root = parse(html);

        // Extract all links
        for (const el of root.querySelectorAll("a[href]")) {
          const href = el.getAttribute("href");
          if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href === "#") continue;

          const normalized = normalizeUrl(href, url);
          if (!normalized) continue;

          if (isSameOrigin(normalized, origin)) {
            if (!result.internalLinks.includes(normalized)) result.internalLinks.push(normalized);

            // Track inbound links
            if (!inboundLinks.has(normalized)) inboundLinks.set(normalized, new Set());
            inboundLinks.get(normalized)!.add(url);

            // Enqueue if not visited, not queued, is HTML, within depth
            if (!visited.has(normalized) && isHtmlUrl(normalized) && depth < maxDepth) {
              const alreadyQueued = queue.some(q => q.url === normalized);
              if (!alreadyQueued) {
                queue.push({ url: normalized, depth: depth + 1, from: url });
              }
            }
          } else {
            if (!result.externalLinks.includes(normalized)) result.externalLinks.push(normalized);
          }
        }
      } catch (err) {
        result.error = String(err);
        result.status = 0;
      }

      results.push(result);
    }));
  }

  // Enrich linkedFrom using inboundLinks map
  for (const result of results) {
    const inbound = inboundLinks.get(result.url);
    if (inbound) result.linkedFrom = Array.from(inbound);
  }

  // Find broken links (pages that returned 4xx/5xx or failed)
  const brokenLinks: CrawlSummary["brokenLinks"] = [];
  for (const result of results) {
    if (result.status >= 400 || result.status === 0) {
      for (const from of result.linkedFrom) {
        brokenLinks.push({ url: result.url, linkedFrom: from, status: result.status });
      }
    }
  }

  // Find orphaned pages (no inbound internal links, not the seed)
  const crawledUrls = new Set(results.map(r => r.url));
  const orphanedPages = results
    .filter(r => r.url !== seedUrl && r.linkedFrom.length === 0 && r.status === 200)
    .map(r => r.url);

  return {
    seedUrl, origin, pages: results, brokenLinks, orphanedPages,
    durationMs: Date.now() - start,
  };
}
