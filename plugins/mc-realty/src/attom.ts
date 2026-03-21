import { execFileSync } from "node:child_process";
import type { RealtyConfig } from "./config.js";

const ATTOM_BASE = "https://api.gateway.attomdata.com/propertyapi/v1.0.0";

/**
 * Resolve the ATTOM API key from mc-vault at runtime.
 * Never hardcode or cache the key — always read from vault.
 */
export function getAttomApiKey(cfg: RealtyConfig): string {
  try {
    const key = execFileSync(cfg.vaultBin, ["get", cfg.attomApiKeyVault], {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
    if (!key) throw new Error("Empty API key returned from mc-vault");
    return key;
  } catch (e: unknown) {
    throw new Error(
      `Failed to read ATTOM API key from mc-vault (key: ${cfg.attomApiKeyVault}): ${(e as Error).message}`,
    );
  }
}

interface AttomRequestOpts {
  endpoint: string;
  params: Record<string, string | number>;
  apiKey: string;
}

async function attomRequest<T>(opts: AttomRequestOpts): Promise<T> {
  const url = new URL(`${ATTOM_BASE}/${opts.endpoint}`);
  for (const [k, v] of Object.entries(opts.params)) {
    url.searchParams.set(k, String(v));
  }

  const resp = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      apikey: opts.apiKey,
    },
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`ATTOM API ${resp.status}: ${resp.statusText} — ${body}`);
  }

  return resp.json() as Promise<T>;
}

export interface SalesComp {
  address: string;
  city: string;
  state: string;
  zip: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  lotSizeSqft: number;
  yearBuilt: number;
  salePrice: number;
  saleDate: string;
  distanceMiles: number;
}

export interface PropertyDetails {
  address: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number;
  lotSizeSqft: number;
  yearBuilt: number;
  propertyType: string;
  avm: number | null;
  assessedValue: number | null;
  taxAmount: number | null;
  lastSalePrice: number | null;
  lastSaleDate: string | null;
}

/**
 * Search for comparable sales near an address.
 */
export async function searchComps(
  cfg: RealtyConfig,
  opts: {
    address: string;
    city: string;
    state: string;
    zip?: string;
    radiusMiles?: number;
    lookbackMonths?: number;
    maxResults?: number;
  },
): Promise<SalesComp[]> {
  const apiKey = getAttomApiKey(cfg);
  const radius = opts.radiusMiles ?? cfg.compRadiusMiles;
  const lookback = opts.lookbackMonths ?? cfg.compLookbackMonths;
  const maxResults = opts.maxResults ?? cfg.compMaxResults;

  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - lookback);
  const minSaleDate = cutoffDate.toISOString().split("T")[0];

  const params: Record<string, string | number> = {
    address1: opts.address,
    address2: `${opts.city}, ${opts.state}${opts.zip ? " " + opts.zip : ""}`,
    searchType: "radius",
    radius: radius,
    minsalesdate: minSaleDate,
    pagesize: maxResults,
  };

  const data = await attomRequest<Record<string, unknown>>({
    endpoint: "sale/snapshot",
    params,
    apiKey,
  });

  const properties = ((data as Record<string, unknown>).property ?? []) as Record<string, unknown>[];

  return properties.map((p: Record<string, unknown>) => {
    const addr = (p.address ?? {}) as Record<string, unknown>;
    const building = (p.building ?? {}) as Record<string, unknown>;
    const rooms = (building.rooms ?? {}) as Record<string, unknown>;
    const size = (building.size ?? {}) as Record<string, unknown>;
    const summary = (building.summary ?? {}) as Record<string, unknown>;
    const lot = (p.lot ?? {}) as Record<string, unknown>;
    const sale = (p.sale ?? {}) as Record<string, unknown>;
    const amount = (sale.amount ?? {}) as Record<string, unknown>;

    return {
      address: (addr.line1 as string) ?? "",
      city: (addr.locality as string) ?? "",
      state: (addr.countrySubd as string) ?? "",
      zip: (addr.postal1 as string) ?? "",
      bedrooms: (rooms.beds as number) ?? 0,
      bathrooms: (rooms.bathstotal as number) ?? 0,
      sqft: (size.livingsize as number) ?? 0,
      lotSizeSqft: (lot.lotsize1 as number) ?? 0,
      yearBuilt: (summary.yearbuilt as number) ?? 0,
      salePrice: (amount.saleamt as number) ?? 0,
      saleDate: (sale.saleTransDate as string) ?? "",
      distanceMiles: (p.distance as number) ?? 0,
    };
  });
}

/**
 * Get detailed property information by address.
 */
export async function getPropertyDetails(
  cfg: RealtyConfig,
  opts: { address: string; city: string; state: string; zip?: string },
): Promise<PropertyDetails> {
  const apiKey = getAttomApiKey(cfg);

  const params: Record<string, string | number> = {
    address1: opts.address,
    address2: `${opts.city}, ${opts.state}${opts.zip ? " " + opts.zip : ""}`,
  };

  const data = await attomRequest<Record<string, unknown>>({
    endpoint: "property/expandedprofile",
    params,
    apiKey,
  });

  const properties = ((data as Record<string, unknown>).property ?? []) as Record<string, unknown>[];
  const p = properties[0] ?? {};
  const addr = (p.address ?? {}) as Record<string, unknown>;
  const building = (p.building ?? {}) as Record<string, unknown>;
  const rooms = (building.rooms ?? {}) as Record<string, unknown>;
  const size = (building.size ?? {}) as Record<string, unknown>;
  const summary = (building.summary ?? {}) as Record<string, unknown>;
  const lot = (p.lot ?? {}) as Record<string, unknown>;
  const assessment = (p.assessment ?? {}) as Record<string, unknown>;
  const assessed = (assessment.assessed ?? {}) as Record<string, unknown>;
  const tax = (assessment.tax ?? {}) as Record<string, unknown>;
  const avm = (p.avm ?? {}) as Record<string, unknown>;
  const avmAmount = (avm.amount ?? {}) as Record<string, unknown>;
  const sale = (p.sale ?? {}) as Record<string, unknown>;
  const saleAmount = (sale.amount ?? {}) as Record<string, unknown>;

  return {
    address: (addr.line1 as string) ?? "",
    city: (addr.locality as string) ?? "",
    state: (addr.countrySubd as string) ?? "",
    zip: (addr.postal1 as string) ?? "",
    county: (addr.countrySecSubd as string) ?? "",
    bedrooms: (rooms.beds as number) ?? 0,
    bathrooms: (rooms.bathstotal as number) ?? 0,
    sqft: (size.livingsize as number) ?? 0,
    lotSizeSqft: (lot.lotsize1 as number) ?? 0,
    yearBuilt: (summary.yearbuilt as number) ?? 0,
    propertyType: (summary.proptype as string) ?? "",
    avm: (avmAmount.value as number) ?? null,
    assessedValue: (assessed.assdttlvalue as number) ?? null,
    taxAmount: (tax.taxamt as number) ?? null,
    lastSalePrice: (saleAmount.saleamt as number) ?? null,
    lastSaleDate: (sale.saleTransDate as string) ?? null,
  };
}
