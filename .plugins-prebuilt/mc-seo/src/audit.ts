/**
 * audit.ts — on-page SEO audit for a single URL
 *
 * Fetches the page, parses HTML, runs ~40 checks across 8 categories,
 * returns a score (0-100) with per-check issues and suggestions.
 */

import { parse } from "node-html-parser";

export type CheckResult = {
  id: string;
  category: string;
  name: string;
  status: "pass" | "warn" | "fail" | "info";
  value?: string;
  issue?: string;
  suggestion?: string;
  points: number;     // points earned
  maxPoints: number;  // max possible
};

export type PageAudit = {
  url: string;
  finalUrl: string;
  statusCode: number;
  responseTimeMs: number;
  score: number;        // 0–100
  grade: string;        // A+ A B C D F
  checks: CheckResult[];
  issues: string[];     // critical issues summary
  suggestions: string[]; // actionable suggestions
  wordCount: number;
  title: string;
  metaDescription: string;
  h1: string;
};

function grade(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function textContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export async function auditPage(url: string, targetKeywords: string[] = []): Promise<PageAudit> {
  const start = Date.now();
  let statusCode = 0;
  let html = "";
  let finalUrl = url;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "mc-seo/1.0 (+https://miniclaw.bot)" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    statusCode = res.status;
    finalUrl = res.url ?? url;
    html = await res.text();
  } catch (err) {
    return {
      url, finalUrl, statusCode: 0, responseTimeMs: Date.now() - start,
      score: 0, grade: "F",
      checks: [{ id: "fetch", category: "Technical", name: "Page reachable", status: "fail",
        issue: `Failed to fetch: ${err}`, suggestion: "Fix server or check URL.", points: 0, maxPoints: 10 }],
      issues: [`Failed to fetch page: ${err}`], suggestions: ["Fix server or check URL."],
      wordCount: 0, title: "", metaDescription: "", h1: "",
    };
  }

  const responseTimeMs = Date.now() - start;
  const root = parse(html);
  const checks: CheckResult[] = [];

  // --- helpers ---
  function check(c: Omit<CheckResult, "points"> & { points?: number }): CheckResult {
    const result = { points: 0, ...c } as CheckResult;
    checks.push(result);
    return result;
  }

  const primaryKeyword = targetKeywords[0]?.toLowerCase() ?? "";

  // ─── CATEGORY: Technical (20 pts) ─────────────────────────────────────────

  // HTTP status
  if (statusCode === 200) {
    check({ id: "http_status", category: "Technical", name: "HTTP 200 OK", status: "pass", value: String(statusCode), points: 5, maxPoints: 5 });
  } else if (statusCode >= 300 && statusCode < 400) {
    check({ id: "http_status", category: "Technical", name: "HTTP status", status: "warn", value: String(statusCode),
      issue: `Page redirects (${statusCode})`, suggestion: "Ensure canonical is set correctly after redirect.", points: 3, maxPoints: 5 });
  } else {
    check({ id: "http_status", category: "Technical", name: "HTTP status", status: "fail", value: String(statusCode),
      issue: `Page returned ${statusCode}`, suggestion: "Fix the server error or remove from sitemap.", points: 0, maxPoints: 5 });
  }

  // Response time
  if (responseTimeMs < 1000) {
    check({ id: "response_time", category: "Technical", name: "Response time", status: "pass", value: `${responseTimeMs}ms`, points: 5, maxPoints: 5 });
  } else if (responseTimeMs < 3000) {
    check({ id: "response_time", category: "Technical", name: "Response time", status: "warn", value: `${responseTimeMs}ms`,
      issue: `Slow response: ${responseTimeMs}ms`, suggestion: "Enable caching, use a CDN, or optimize server.", points: 2, maxPoints: 5 });
  } else {
    check({ id: "response_time", category: "Technical", name: "Response time", status: "fail", value: `${responseTimeMs}ms`,
      issue: `Very slow: ${responseTimeMs}ms`, suggestion: "Page is too slow — use CDN and server-side caching.", points: 0, maxPoints: 5 });
  }

  // HTTPS
  if (url.startsWith("https://")) {
    check({ id: "https", category: "Technical", name: "HTTPS", status: "pass", points: 3, maxPoints: 3 });
  } else {
    check({ id: "https", category: "Technical", name: "HTTPS", status: "fail",
      issue: "Page served over HTTP", suggestion: "Enable SSL/TLS. Google uses HTTPS as a ranking signal.", points: 0, maxPoints: 3 });
  }

  // Viewport meta
  const viewportMeta = root.querySelector('meta[name="viewport"]');
  if (viewportMeta) {
    check({ id: "viewport", category: "Technical", name: "Mobile viewport", status: "pass", points: 3, maxPoints: 3 });
  } else {
    check({ id: "viewport", category: "Technical", name: "Mobile viewport", status: "fail",
      issue: "No viewport meta tag", suggestion: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">', points: 0, maxPoints: 3 });
  }

  // Canonical
  const canonical = root.querySelector('link[rel="canonical"]');
  const canonicalHref = canonical?.getAttribute("href") ?? "";
  if (canonicalHref) {
    const isCanonicalSelf = canonicalHref === finalUrl || canonicalHref === url;
    check({ id: "canonical", category: "Technical", name: "Canonical URL", status: isCanonicalSelf ? "pass" : "warn",
      value: canonicalHref,
      issue: isCanonicalSelf ? undefined : `Canonical points to different URL: ${canonicalHref}`,
      suggestion: isCanonicalSelf ? undefined : "Verify canonical is intentional — it tells Google to index a different URL.",
      points: isCanonicalSelf ? 4 : 2, maxPoints: 4 });
  } else {
    check({ id: "canonical", category: "Technical", name: "Canonical URL", status: "warn",
      issue: "No canonical tag", suggestion: 'Add <link rel="canonical" href="https://yourdomain.com/page">',
      points: 0, maxPoints: 4 });
  }

  // Robots meta
  const robotsMeta = root.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "";
  const isNoindex = /noindex/i.test(robotsMeta);
  if (isNoindex) {
    check({ id: "robots_meta", category: "Technical", name: "Robots meta", status: "fail", value: robotsMeta,
      issue: "Page is set to noindex — Google will not index it",
      suggestion: "Remove noindex unless this page should be excluded from search.",
      points: 0, maxPoints: 0 });
  } else if (robotsMeta) {
    check({ id: "robots_meta", category: "Technical", name: "Robots meta", status: "pass", value: robotsMeta, points: 0, maxPoints: 0 });
  }

  // ─── CATEGORY: Title Tag (15 pts) ──────────────────────────────────────────
  const titleEl = root.querySelector("title");
  const titleText = titleEl?.text?.trim() ?? "";
  const titleLen = titleText.length;

  if (!titleText) {
    check({ id: "title_present", category: "Title", name: "Title tag present", status: "fail",
      issue: "No title tag found", suggestion: "Add a descriptive <title> tag — this is the most important SEO element.",
      points: 0, maxPoints: 15 });
  } else {
    check({ id: "title_present", category: "Title", name: "Title tag present", status: "pass", value: titleText, points: 5, maxPoints: 5 });

    if (titleLen >= 50 && titleLen <= 60) {
      check({ id: "title_length", category: "Title", name: "Title length (50–60 chars)", status: "pass", value: `${titleLen} chars`, points: 5, maxPoints: 5 });
    } else if (titleLen >= 40 && titleLen <= 70) {
      check({ id: "title_length", category: "Title", name: "Title length (50–60 chars)", status: "warn", value: `${titleLen} chars`,
        issue: titleLen < 50 ? "Title is short — consider expanding" : "Title may be truncated in search results",
        suggestion: "Ideal title length is 50–60 characters.", points: 3, maxPoints: 5 });
    } else {
      check({ id: "title_length", category: "Title", name: "Title length (50–60 chars)", status: "fail", value: `${titleLen} chars`,
        issue: titleLen < 40 ? "Title too short — very little signal to Google" : "Title too long — will be truncated",
        suggestion: "Keep titles between 50–60 characters.", points: 0, maxPoints: 5 });
    }

    if (primaryKeyword && titleText.toLowerCase().includes(primaryKeyword)) {
      check({ id: "title_keyword", category: "Title", name: "Target keyword in title", status: "pass", value: primaryKeyword, points: 5, maxPoints: 5 });
    } else if (primaryKeyword) {
      check({ id: "title_keyword", category: "Title", name: "Target keyword in title", status: "warn",
        issue: `"${primaryKeyword}" not found in title`,
        suggestion: `Include your target keyword "${primaryKeyword}" in the title tag, ideally near the start.`,
        points: 0, maxPoints: 5 });
    }
  }

  // ─── CATEGORY: Meta Description (10 pts) ───────────────────────────────────
  const metaDescEl = root.querySelector('meta[name="description"]');
  const metaDesc = metaDescEl?.getAttribute("content")?.trim() ?? "";
  const metaDescLen = metaDesc.length;

  if (!metaDesc) {
    check({ id: "meta_desc_present", category: "Meta Description", name: "Meta description present", status: "fail",
      issue: "No meta description", suggestion: "Add a meta description (150–160 chars) — it appears in search snippets.",
      points: 0, maxPoints: 10 });
  } else {
    check({ id: "meta_desc_present", category: "Meta Description", name: "Meta description present", status: "pass", value: metaDesc, points: 5, maxPoints: 5 });

    if (metaDescLen >= 150 && metaDescLen <= 160) {
      check({ id: "meta_desc_length", category: "Meta Description", name: "Meta description length (150–160)", status: "pass", value: `${metaDescLen} chars`, points: 5, maxPoints: 5 });
    } else if (metaDescLen >= 120 && metaDescLen <= 180) {
      check({ id: "meta_desc_length", category: "Meta Description", name: "Meta description length (150–160)", status: "warn", value: `${metaDescLen} chars`,
        issue: metaDescLen < 150 ? "Description is short — add more context" : "Description may be truncated",
        suggestion: "Ideal meta description is 150–160 characters.", points: 3, maxPoints: 5 });
    } else {
      check({ id: "meta_desc_length", category: "Meta Description", name: "Meta description length (150–160)", status: "fail", value: `${metaDescLen} chars`,
        issue: metaDescLen < 120 ? "Meta description too short" : "Meta description too long — will be truncated",
        suggestion: "Keep meta description between 150–160 characters.", points: 0, maxPoints: 5 });
    }
  }

  // ─── CATEGORY: Headings (15 pts) ───────────────────────────────────────────
  const h1s = root.querySelectorAll("h1");
  const h1Text = h1s[0]?.text?.trim() ?? "";

  if (h1s.length === 0) {
    check({ id: "h1_present", category: "Headings", name: "H1 tag present", status: "fail",
      issue: "No H1 tag found", suggestion: "Add one H1 that describes the page topic and includes your target keyword.",
      points: 0, maxPoints: 15 });
  } else {
    check({ id: "h1_present", category: "Headings", name: "H1 tag present", status: "pass", value: h1Text, points: 5, maxPoints: 5 });

    if (h1s.length === 1) {
      check({ id: "h1_unique", category: "Headings", name: "Only one H1", status: "pass", points: 5, maxPoints: 5 });
    } else {
      check({ id: "h1_unique", category: "Headings", name: "Only one H1", status: "warn", value: `${h1s.length} H1s found`,
        issue: `${h1s.length} H1 tags found — should have exactly one`,
        suggestion: "Use only one H1 per page. Subsequent headings should be H2/H3.", points: 2, maxPoints: 5 });
    }

    if (primaryKeyword && h1Text.toLowerCase().includes(primaryKeyword)) {
      check({ id: "h1_keyword", category: "Headings", name: "Target keyword in H1", status: "pass", value: primaryKeyword, points: 5, maxPoints: 5 });
    } else if (primaryKeyword) {
      check({ id: "h1_keyword", category: "Headings", name: "Target keyword in H1", status: "warn",
        issue: `"${primaryKeyword}" not in H1`,
        suggestion: `Include "${primaryKeyword}" in your H1 heading.`,
        points: 0, maxPoints: 5 });
    }
  }

  // Heading hierarchy
  const headings = root.querySelectorAll("h1,h2,h3,h4,h5,h6");
  const levels = headings.map(h => parseInt(h.tagName.slice(1)));
  let hierarchyOk = true;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] > levels[i - 1] + 1) { hierarchyOk = false; break; }
  }
  if (headings.length > 1) {
    check({ id: "heading_hierarchy", category: "Headings", name: "Heading hierarchy", status: hierarchyOk ? "pass" : "warn",
      issue: hierarchyOk ? undefined : "Heading levels skip (e.g. H1 → H3 without H2)",
      suggestion: hierarchyOk ? undefined : "Don't skip heading levels — use H1 → H2 → H3 in order.",
      points: hierarchyOk ? 0 : 0, maxPoints: 0 });
  }

  // ─── CATEGORY: Content (10 pts) ────────────────────────────────────────────
  const bodyText = textContent(root.querySelector("body")?.innerHTML ?? html);
  const wordCount = countWords(bodyText);

  if (wordCount >= 600) {
    check({ id: "word_count", category: "Content", name: "Word count (600+ recommended)", status: "pass", value: `${wordCount} words`, points: 5, maxPoints: 5 });
  } else if (wordCount >= 300) {
    check({ id: "word_count", category: "Content", name: "Word count (600+ recommended)", status: "warn", value: `${wordCount} words`,
      issue: `Only ${wordCount} words — thin content`,
      suggestion: "Pages with 600+ words rank better. Expand with relevant content, FAQs, or use cases.",
      points: 2, maxPoints: 5 });
  } else {
    check({ id: "word_count", category: "Content", name: "Word count (600+ recommended)", status: "fail", value: `${wordCount} words`,
      issue: `Very thin content: ${wordCount} words`,
      suggestion: "Add substantially more content. Aim for at least 600 meaningful words.",
      points: 0, maxPoints: 5 });
  }

  // Keyword in body
  if (primaryKeyword) {
    const keywordCount = (bodyText.toLowerCase().match(new RegExp(primaryKeyword.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []).length;
    const density = wordCount > 0 ? (keywordCount / wordCount * 100) : 0;
    if (keywordCount === 0) {
      check({ id: "keyword_in_body", category: "Content", name: "Keyword in body content", status: "fail",
        issue: `"${primaryKeyword}" not found in body text`,
        suggestion: `Use "${primaryKeyword}" naturally in your page content, ideally in the first paragraph.`,
        points: 0, maxPoints: 5 });
    } else if (density > 3) {
      check({ id: "keyword_in_body", category: "Content", name: "Keyword in body content", status: "warn", value: `${density.toFixed(1)}% density (${keywordCount}×)`,
        issue: "Keyword density too high — may look like keyword stuffing",
        suggestion: "Reduce keyword repetition. Use natural variations and synonyms instead.",
        points: 3, maxPoints: 5 });
    } else {
      check({ id: "keyword_in_body", category: "Content", name: "Keyword in body content", status: "pass", value: `${density.toFixed(1)}% density (${keywordCount}×)`, points: 5, maxPoints: 5 });
    }
  }

  // ─── CATEGORY: Images (10 pts) ─────────────────────────────────────────────
  const images = root.querySelectorAll("img");
  const imagesWithoutAlt = images.filter(img => !img.getAttribute("alt")?.trim());
  const totalImages = images.length;

  if (totalImages === 0) {
    check({ id: "images", category: "Images", name: "Image alt text", status: "info", value: "No images found", points: 5, maxPoints: 5 });
  } else if (imagesWithoutAlt.length === 0) {
    check({ id: "img_alt", category: "Images", name: "All images have alt text", status: "pass", value: `${totalImages} images`, points: 5, maxPoints: 5 });
  } else {
    check({ id: "img_alt", category: "Images", name: "All images have alt text", status: "fail",
      value: `${imagesWithoutAlt.length}/${totalImages} missing alt`,
      issue: `${imagesWithoutAlt.length} image(s) missing alt text`,
      suggestion: "Add descriptive alt text to all images. Include keywords where relevant.",
      points: Math.floor((totalImages - imagesWithoutAlt.length) / totalImages * 5), maxPoints: 5 });
  }

  // Images with dimensions
  const imagesWithoutDimensions = images.filter(img => !img.getAttribute("width") || !img.getAttribute("height"));
  if (totalImages > 0) {
    if (imagesWithoutDimensions.length === 0) {
      check({ id: "img_dimensions", category: "Images", name: "Images have width/height", status: "pass", points: 5, maxPoints: 5 });
    } else {
      check({ id: "img_dimensions", category: "Images", name: "Images have width/height", status: "warn",
        value: `${imagesWithoutDimensions.length}/${totalImages} missing`,
        issue: `${imagesWithoutDimensions.length} images missing width/height attributes`,
        suggestion: "Set width/height on images to prevent layout shift (CLS).",
        points: 2, maxPoints: 5 });
    }
  }

  // ─── CATEGORY: Schema / Structured Data (10 pts) ───────────────────────────
  const jsonLdScripts = root.querySelectorAll('script[type="application/ld+json"]');
  const schemaTypes: string[] = [];
  let schemaValid = true;

  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.text);
      const graphs = data["@graph"] ? data["@graph"] : [data];
      for (const node of graphs) {
        if (node["@type"]) schemaTypes.push(node["@type"]);
      }
    } catch {
      schemaValid = false;
    }
  }

  if (jsonLdScripts.length === 0) {
    check({ id: "schema", category: "Schema", name: "Structured data (JSON-LD)", status: "fail",
      issue: "No JSON-LD structured data found",
      suggestion: "Add Schema.org JSON-LD markup. At minimum: Organization + WebPage. For products: SoftwareApplication. For articles: Article.",
      points: 0, maxPoints: 10 });
  } else if (!schemaValid) {
    check({ id: "schema", category: "Schema", name: "Structured data (JSON-LD)", status: "fail",
      issue: "JSON-LD contains invalid JSON",
      suggestion: "Fix the JSON syntax in your structured data scripts.",
      points: 2, maxPoints: 10 });
  } else {
    check({ id: "schema", category: "Schema", name: "Structured data (JSON-LD)", status: "pass",
      value: schemaTypes.join(", ") || "present", points: 7, maxPoints: 10 });
    // Bonus: FAQPage = rich snippet eligible
    if (schemaTypes.includes("FAQPage") || schemaTypes.includes("HowTo")) {
      check({ id: "schema_rich", category: "Schema", name: "Rich snippet eligible", status: "pass",
        value: schemaTypes.filter(t => ["FAQPage","HowTo","Review","Product"].includes(t)).join(", "),
        points: 3, maxPoints: 3 });
    }
  }

  // ─── CATEGORY: Open Graph / Social (10 pts) ────────────────────────────────
  const ogTitle = root.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? "";
  const ogDesc = root.querySelector('meta[property="og:description"]')?.getAttribute("content") ?? "";
  const ogImage = root.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? "";
  const ogUrl = root.querySelector('meta[property="og:url"]')?.getAttribute("content") ?? "";
  const twCard = root.querySelector('meta[name="twitter:card"]')?.getAttribute("content") ?? "";

  const ogScore = [ogTitle, ogDesc, ogImage, ogUrl, twCard].filter(Boolean).length;
  const ogMax = 5;

  if (ogScore === ogMax) {
    check({ id: "og_tags", category: "Open Graph", name: "OG + Twitter Card tags", status: "pass",
      value: "og:title, og:description, og:image, og:url, twitter:card — all present",
      points: 10, maxPoints: 10 });
  } else {
    const missing = [
      !ogTitle && "og:title", !ogDesc && "og:description",
      !ogImage && "og:image", !ogUrl && "og:url", !twCard && "twitter:card",
    ].filter(Boolean);
    check({ id: "og_tags", category: "Open Graph", name: "OG + Twitter Card tags", status: "warn",
      value: `${ogScore}/${ogMax} present`,
      issue: `Missing: ${missing.join(", ")}`,
      suggestion: "Add all OG and Twitter Card meta tags for proper social sharing previews.",
      points: Math.floor(ogScore / ogMax * 10), maxPoints: 10 });
  }

  // ─── CALCULATE SCORE ───────────────────────────────────────────────────────
  const totalPoints = checks.reduce((sum, c) => sum + c.points, 0);
  const totalMax = checks.reduce((sum, c) => sum + c.maxPoints, 0);
  const score = totalMax > 0 ? Math.round((totalPoints / totalMax) * 100) : 0;

  const issues = checks
    .filter(c => c.status === "fail" && c.issue)
    .map(c => `[${c.category}] ${c.issue!}`);

  const suggestions = checks
    .filter(c => (c.status === "fail" || c.status === "warn") && c.suggestion)
    .map(c => `[${c.category}] ${c.suggestion!}`);

  return {
    url, finalUrl, statusCode, responseTimeMs,
    score, grade: grade(score),
    checks, issues, suggestions,
    wordCount, title: titleText, metaDescription: metaDesc, h1: h1Text,
  };
}
