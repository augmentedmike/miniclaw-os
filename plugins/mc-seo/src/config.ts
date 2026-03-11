import * as path from "node:path";
import * as os from "node:os";

export type DomainConfig = {
  sitemapUrl?: string;
  targetKeywords: string[];
  devUrl?: string;
};

export type SeoConfig = {
  stateDir: string;
  indexNowKey?: string;
  googleSearchApiKey?: string;
  googleSearchCx?: string;
  bingApiKey?: string;
  domains: Record<string, DomainConfig>;
};

export function resolveConfig(raw: Record<string, unknown>, botId = "augmentedmike_bot"): SeoConfig {
  const defaultStateDir = path.join(os.homedir(), "am", "USER", botId, "seo");

  const domains: Record<string, DomainConfig> = {};
  const rawDomains = (raw["domains"] ?? {}) as Record<string, Record<string, unknown>>;
  for (const [domain, cfg] of Object.entries(rawDomains)) {
    domains[domain] = {
      sitemapUrl: cfg["sitemapUrl"] as string | undefined,
      targetKeywords: (cfg["targetKeywords"] as string[] | undefined) ?? [],
      devUrl: cfg["devUrl"] as string | undefined,
    };
  }

  return {
    stateDir: (raw["stateDir"] as string | undefined) ?? defaultStateDir,
    indexNowKey: raw["indexNowKey"] as string | undefined,
    googleSearchApiKey: raw["googleSearchApiKey"] as string | undefined,
    googleSearchCx: raw["googleSearchCx"] as string | undefined,
    bingApiKey: raw["bingApiKey"] as string | undefined,
    domains,
  };
}
