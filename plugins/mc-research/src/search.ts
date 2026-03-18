/**
 * search.ts — Web search via multiple providers (Google Custom Search, SerpAPI, Bing)
 */

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export type SearchResponse = {
  provider: string;
  results: SearchResult[];
};

// ── Google Custom Search ────────────────────────────────────────────

async function searchGoogle(
  query: string,
  apiKey: string,
  cx: string,
  numResults: number,
): Promise<SearchResponse> {
  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("q", query);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("num", String(Math.min(numResults, 10)));

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    throw new Error(`Google CSE error ${resp.status}: ${await resp.text()}`);
  }

  const data = (await resp.json()) as {
    items?: Array<{ title: string; link: string; snippet: string }>;
  };

  return {
    provider: "google",
    results: (data.items ?? []).map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet ?? "",
    })),
  };
}

// ── SerpAPI ─────────────────────────────────────────────────────────

async function searchSerp(
  query: string,
  apiKey: string,
  numResults: number,
): Promise<SearchResponse> {
  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("engine", "google");
  url.searchParams.set("num", String(Math.min(numResults, 10)));

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    throw new Error(`SerpAPI error ${resp.status}: ${await resp.text()}`);
  }

  const data = (await resp.json()) as {
    organic_results?: Array<{ title: string; link: string; snippet: string }>;
  };

  return {
    provider: "serp",
    results: (data.organic_results ?? []).map((r) => ({
      title: r.title,
      url: r.link,
      snippet: r.snippet ?? "",
    })),
  };
}

// ── Bing Web Search ─────────────────────────────────────────────────

async function searchBing(
  query: string,
  apiKey: string,
  numResults: number,
): Promise<SearchResponse> {
  const url = new URL("https://api.bing.microsoft.com/v7.0/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(Math.min(numResults, 10)));

  const resp = await fetch(url.toString(), {
    headers: { "Ocp-Apim-Subscription-Key": apiKey },
  });
  if (!resp.ok) {
    throw new Error(`Bing API error ${resp.status}: ${await resp.text()}`);
  }

  const data = (await resp.json()) as {
    webPages?: { value: Array<{ name: string; url: string; snippet: string }> };
  };

  return {
    provider: "bing",
    results: (data.webPages?.value ?? []).map((r) => ({
      title: r.name,
      url: r.url,
      snippet: r.snippet ?? "",
    })),
  };
}

// ── Unified search with fallback chain ──────────────────────────────

export type SearchKeys = {
  serpApiKey?: string | null;
  googleApiKey?: string | null;
  googleCx?: string | null;
  bingApiKey?: string | null;
};

export async function webSearch(
  query: string,
  keys: SearchKeys,
  preferred: "serp" | "google" | "bing" = "google",
  numResults: number = 5,
): Promise<SearchResponse> {
  const providers: Array<() => Promise<SearchResponse>> = [];

  const addGoogle = () => {
    if (keys.googleApiKey && keys.googleCx) {
      providers.push(() => searchGoogle(query, keys.googleApiKey!, keys.googleCx!, numResults));
    }
  };
  const addSerp = () => {
    if (keys.serpApiKey) {
      providers.push(() => searchSerp(query, keys.serpApiKey!, numResults));
    }
  };
  const addBing = () => {
    if (keys.bingApiKey) {
      providers.push(() => searchBing(query, keys.bingApiKey!, numResults));
    }
  };

  // Order by preference
  if (preferred === "serp") { addSerp(); addGoogle(); addBing(); }
  else if (preferred === "bing") { addBing(); addGoogle(); addSerp(); }
  else { addGoogle(); addSerp(); addBing(); }

  for (const search of providers) {
    try {
      return await search();
    } catch {
      // Try next provider
    }
  }

  throw new Error(
    "No search providers available. Set API keys in vault: research-google-api-key + research-google-cx, research-serp-api-key, or research-bing-api-key",
  );
}
