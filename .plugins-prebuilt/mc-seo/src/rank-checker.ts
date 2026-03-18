/**
 * rank-checker.ts — check SERP position for a domain + keyword
 *
 * Methods (tried in order based on config):
 *   1. Google Custom Search JSON API (100 free queries/day)
 *   2. Bing Web Search API (1000 free queries/month)
 *   3. Fallback: scrape Google SERP HTML directly
 */

export type RankResult = {
  keyword: string;
  domain: string;
  engine: "google" | "bing" | "google-scrape";
  position: number | null; // 1-based, null = not in top 100
  url: string | null;      // the ranking URL
  checkedAt: number;
  error?: string;
};

function extractDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

// ── Google Custom Search API ──────────────────────────────────────────────────

export async function checkRankGoogle(
  keyword: string,
  domain: string,
  apiKey: string,
  cx: string
): Promise<RankResult> {
  const base: RankResult = { keyword, domain, engine: "google", position: null, url: null, checkedAt: Date.now() };

  try {
    // Search up to 3 pages (30 results) to find ranking
    for (let start = 1; start <= 91; start += 10) {
      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(keyword)}&start=${start}&num=10`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

      if (!res.ok) {
        const err = await res.text();
        return { ...base, error: `Google API error ${res.status}: ${err.slice(0, 200)}` };
      }

      const data = await res.json() as { items?: Array<{ link: string }> };
      if (!data.items?.length) break;

      for (let i = 0; i < data.items.length; i++) {
        const itemDomain = extractDomain(data.items[i].link);
        if (itemDomain === domain || itemDomain.endsWith(`.${domain}`)) {
          return { ...base, position: start + i, url: data.items[i].link };
        }
      }
    }
    return base; // not found in top 100
  } catch (err) {
    return { ...base, error: String(err) };
  }
}

// ── Bing Web Search API ───────────────────────────────────────────────────────

export async function checkRankBing(
  keyword: string,
  domain: string,
  apiKey: string
): Promise<RankResult> {
  const base: RankResult = { keyword, domain, engine: "bing", position: null, url: null, checkedAt: Date.now() };

  try {
    let position = 0;
    for (let offset = 0; offset < 50; offset += 10) {
      const url = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(keyword)}&count=10&offset=${offset}&responseFilter=Webpages`;
      const res = await fetch(url, {
        headers: { "Ocp-Apim-Subscription-Key": apiKey },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const err = await res.text();
        return { ...base, error: `Bing API error ${res.status}: ${err.slice(0, 200)}` };
      }

      const data = await res.json() as { webPages?: { value: Array<{ url: string }> } };
      const items = data.webPages?.value ?? [];
      if (!items.length) break;

      for (const item of items) {
        position++;
        const itemDomain = extractDomain(item.url);
        if (itemDomain === domain || itemDomain.endsWith(`.${domain}`)) {
          return { ...base, position, url: item.url };
        }
      }
    }
    return base;
  } catch (err) {
    return { ...base, error: String(err) };
  }
}

// ── Google SERP scraper (no API key needed) ───────────────────────────────────

export async function checkRankGoogleScrape(
  keyword: string,
  domain: string
): Promise<RankResult> {
  const base: RankResult = { keyword, domain, engine: "google-scrape", position: null, url: null, checkedAt: Date.now() };

  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(keyword)}&num=30&hl=en&gl=us`;
    const res = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return { ...base, error: `HTTP ${res.status}` };

    const html = await res.text();

    // Extract URLs from Google result divs
    // Google wraps results in <div class="g"> or similar, with <a href="/url?q=..."> or direct hrefs
    const urlPattern = /href="(https?:\/\/[^"]+)"/g;
    let match: RegExpExecArray | null;
    let position = 0;
    const seen = new Set<string>();

    while ((match = urlPattern.exec(html)) !== null) {
      const href = match[1];
      if (href.includes("google.com") || href.includes("googleapis")) continue;
      if (seen.has(href)) continue;
      seen.add(href);

      const itemDomain = extractDomain(href);
      if (itemDomain && !itemDomain.includes("google") && !itemDomain.includes("youtube")) {
        position++;
        if (itemDomain === domain || itemDomain.endsWith(`.${domain}`)) {
          return { ...base, position, url: href };
        }
        if (position >= 30) break;
      }
    }

    return base;
  } catch (err) {
    return { ...base, error: String(err) };
  }
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

export async function checkRank(
  keyword: string,
  domain: string,
  config: {
    googleApiKey?: string;
    googleCx?: string;
    bingApiKey?: string;
  } = {}
): Promise<RankResult> {
  if (config.googleApiKey && config.googleCx) {
    return checkRankGoogle(keyword, domain, config.googleApiKey, config.googleCx);
  }
  if (config.bingApiKey) {
    return checkRankBing(keyword, domain, config.bingApiKey);
  }
  return checkRankGoogleScrape(keyword, domain);
}
