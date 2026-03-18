/**
 * sitemap.ts — sitemap fetching, validation, and search engine submission
 */

export type SitemapPingResult = {
  engine: string;
  url: string;
  status: "ok" | "error";
  httpStatus?: number;
  message: string;
};

export async function fetchSitemap(url: string): Promise<{ valid: boolean; urls: string[]; error?: string }> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "mc-seo/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { valid: false, urls: [], error: `HTTP ${res.status}` };

    const xml = await res.text();
    if (!xml.includes("<urlset") && !xml.includes("<sitemapindex")) {
      return { valid: false, urls: [], error: "Not a valid sitemap XML" };
    }

    const urlMatches = xml.match(/<loc>([^<]+)<\/loc>/g) ?? [];
    const urls = urlMatches.map(m => m.replace(/<\/?loc>/g, "").trim());
    return { valid: true, urls };
  } catch (err) {
    return { valid: false, urls: [], error: String(err) };
  }
}

export async function pingSitemaps(sitemapUrl: string, indexNowKey?: string): Promise<SitemapPingResult[]> {
  const results: SitemapPingResult[] = [];

  // Google
  try {
    const googleUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
    const res = await fetch(googleUrl, { signal: AbortSignal.timeout(10000) });
    results.push({
      engine: "Google",
      url: googleUrl,
      status: res.ok ? "ok" : "error",
      httpStatus: res.status,
      message: res.ok ? "Google accepted sitemap ping" : `Google returned ${res.status}`,
    });
  } catch (err) {
    results.push({ engine: "Google", url: sitemapUrl, status: "error", message: String(err) });
  }

  // Bing (sitemap ping — no API key needed)
  try {
    const bingUrl = `https://www.bing.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
    const res = await fetch(bingUrl, { signal: AbortSignal.timeout(10000) });
    results.push({
      engine: "Bing",
      url: bingUrl,
      status: res.ok ? "ok" : "error",
      httpStatus: res.status,
      message: res.ok ? "Bing accepted sitemap ping" : `Bing returned ${res.status}`,
    });
  } catch (err) {
    results.push({ engine: "Bing", url: sitemapUrl, status: "error", message: String(err) });
  }

  // IndexNow (instant Bing + Yandex indexing)
  if (indexNowKey) {
    try {
      const sitemapData = await fetchSitemap(sitemapUrl);
      if (sitemapData.valid && sitemapData.urls.length > 0) {
        const origin = new URL(sitemapUrl).origin;
        const host = new URL(sitemapUrl).hostname;
        const body = JSON.stringify({
          host,
          key: indexNowKey,
          keyLocation: `${origin}/${indexNowKey}.txt`,
          urlList: sitemapData.urls.slice(0, 10000), // IndexNow limit
        });
        const res = await fetch("https://api.indexnow.org/IndexNow", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body,
          signal: AbortSignal.timeout(10000),
        });
        results.push({
          engine: "IndexNow (Bing+Yandex)",
          url: "https://api.indexnow.org/IndexNow",
          status: res.ok ? "ok" : "error",
          httpStatus: res.status,
          message: res.ok
            ? `IndexNow submitted ${sitemapData.urls.length} URLs`
            : `IndexNow returned ${res.status}`,
        });
      }
    } catch (err) {
      results.push({ engine: "IndexNow", url: sitemapUrl, status: "error", message: String(err) });
    }
  }

  return results;
}

export function generateSitemapXml(urls: Array<{ loc: string; lastmod?: string; changefreq?: string; priority?: number }>): string {
  const entries = urls.map(u => `
  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}
    ${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ""}
    ${u.priority !== undefined ? `<priority>${u.priority}</priority>` : ""}
  </url>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>`;
}
