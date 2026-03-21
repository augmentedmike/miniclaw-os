import { test, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveConfig } from "./src/config.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

/* ── Structure tests ──────────────────────────────────────────────── */

test("index.ts exists", () => {
  expect(existsSync(__dirname + "/index.ts")).toBe(true);
});

test("openclaw.plugin.json exists and has required fields", async () => {
  const pluginJson = await import("./openclaw.plugin.json", { with: { type: "json" } });
  const cfg = pluginJson.default;
  expect(cfg.id).toBe("mc-realty");
  expect(cfg.name).toBeDefined();
  expect(cfg.description).toBeDefined();
  expect(cfg.configSchema).toBeDefined();
  expect(cfg.configSchema.properties.attom_api_key_vault).toBeDefined();
  expect(cfg.configSchema.properties.comp_radius_miles).toBeDefined();
  expect(cfg.configSchema.properties.comp_lookback_months).toBeDefined();
});

test("plugin files all exist", () => {
  const files = [
    "index.ts",
    "cli/commands.ts",
    "tools/definitions.ts",
    "src/attom.ts",
    "src/config.ts",
    "openclaw.plugin.json",
    "package.json",
  ];
  for (const f of files) {
    expect(existsSync(`${__dirname}/${f}`), `${f} should exist`).toBe(true);
  }
});

/* ── Config tests ─────────────────────────────────────────────────── */

test("resolveConfig returns defaults", () => {
  const cfg = resolveConfig({});
  expect(cfg).toBeDefined();
  expect(cfg.compRadiusMiles).toBe(1.5);
  expect(cfg.compLookbackMonths).toBe(6);
  expect(cfg.compMaxResults).toBe(10);
  expect(cfg.bookingDurationMinutes).toBe(30);
  expect(cfg.autoSyndicate).toBe(true);
  expect(cfg.transactionStages).toEqual([
    "listed", "showings", "offers", "under-contract",
    "inspection", "appraisal", "closing", "sold",
  ]);
  expect(cfg.syndicatePlatforms).toEqual(["instagram", "facebook", "twitter"]);
  expect(cfg.attomApiKeyVault).toBe("attom_api_key");
  expect(typeof cfg.dataDir).toBe("string");
  expect(typeof cfg.vaultBin).toBe("string");
});

test("resolveConfig accepts overrides", () => {
  const cfg = resolveConfig({
    default_market: "Miami-Fort Lauderdale",
    comp_radius_miles: 3,
    comp_lookback_months: 12,
    comp_max_results: 20,
    booking_duration_minutes: 45,
    auto_syndicate: false,
    notification_email: "test@example.com",
    transaction_stages: ["listed", "sold"],
    syndicate_platforms: ["instagram"],
  });
  expect(cfg.defaultMarket).toBe("Miami-Fort Lauderdale");
  expect(cfg.compRadiusMiles).toBe(3);
  expect(cfg.compLookbackMonths).toBe(12);
  expect(cfg.compMaxResults).toBe(20);
  expect(cfg.bookingDurationMinutes).toBe(45);
  expect(cfg.autoSyndicate).toBe(false);
  expect(cfg.notificationEmail).toBe("test@example.com");
  expect(cfg.transactionStages).toEqual(["listed", "sold"]);
  expect(cfg.syndicatePlatforms).toEqual(["instagram"]);
});

/* ── ATTOM client tests (mocked fetch) ────────────────────────────── */

const MOCK_SALE_RESPONSE = {
  property: [
    {
      address: { line1: "100 Oak Ave", locality: "Miami", countrySubd: "FL", postal1: "33101" },
      building: {
        rooms: { beds: 3, bathstotal: 2 },
        size: { livingsize: 1800 },
        summary: { yearbuilt: 2005 },
      },
      lot: { lotsize1: 5000 },
      sale: {
        amount: { saleamt: 425000 },
        saleTransDate: "2025-11-15",
      },
      distance: 0.8,
    },
    {
      address: { line1: "200 Pine St", locality: "Miami", countrySubd: "FL", postal1: "33101" },
      building: {
        rooms: { beds: 4, bathstotal: 3 },
        size: { livingsize: 2200 },
        summary: { yearbuilt: 2010 },
      },
      lot: { lotsize1: 6000 },
      sale: {
        amount: { saleamt: 550000 },
        saleTransDate: "2025-10-22",
      },
      distance: 1.2,
    },
    {
      address: { line1: "300 Elm Dr", locality: "Miami", countrySubd: "FL", postal1: "33102" },
      building: {
        rooms: { beds: 3, bathstotal: 2 },
        size: { livingsize: 1650 },
        summary: { yearbuilt: 2000 },
      },
      lot: { lotsize1: 4500 },
      sale: {
        amount: { saleamt: 390000 },
        saleTransDate: "2025-09-05",
      },
      distance: 1.4,
    },
  ],
};

const MOCK_PROPERTY_RESPONSE = {
  property: [
    {
      address: { line1: "123 Main St", locality: "Miami", countrySubd: "FL", postal1: "33101", countrySecSubd: "Miami-Dade" },
      building: {
        rooms: { beds: 3, bathstotal: 2 },
        size: { livingsize: 1900 },
        summary: { yearbuilt: 2008, proptype: "SFR" },
      },
      lot: { lotsize1: 5500 },
      assessment: {
        assessed: { assdttlvalue: 320000 },
        tax: { taxamt: 4800 },
      },
      avm: { amount: { value: 475000 } },
      sale: {
        amount: { saleamt: 350000 },
        saleTransDate: "2020-03-15",
      },
    },
  ],
};

// Mock getAttomApiKey to avoid vault dependency
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(() => "mock-attom-api-key-12345"),
  execSync: vi.fn(() => "mock-value"),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  // Re-mock execFileSync after restore
  const cp = require("node:child_process");
  cp.execFileSync = vi.fn(() => "mock-attom-api-key-12345");
});

test("searchComps parses ATTOM sale/snapshot response correctly", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(MOCK_SALE_RESPONSE),
    text: () => Promise.resolve(""),
  });
  vi.stubGlobal("fetch", mockFetch);

  const { searchComps } = await import("./src/attom.ts");
  const cfg = resolveConfig({});

  const comps = await searchComps(cfg, {
    address: "123 Main St",
    city: "Miami",
    state: "FL",
  });

  expect(comps).toHaveLength(3);

  // First comp
  expect(comps[0].address).toBe("100 Oak Ave");
  expect(comps[0].city).toBe("Miami");
  expect(comps[0].state).toBe("FL");
  expect(comps[0].zip).toBe("33101");
  expect(comps[0].bedrooms).toBe(3);
  expect(comps[0].bathrooms).toBe(2);
  expect(comps[0].sqft).toBe(1800);
  expect(comps[0].salePrice).toBe(425000);
  expect(comps[0].saleDate).toBe("2025-11-15");
  expect(comps[0].distanceMiles).toBe(0.8);

  // Second comp
  expect(comps[1].address).toBe("200 Pine St");
  expect(comps[1].salePrice).toBe(550000);
  expect(comps[1].bedrooms).toBe(4);
  expect(comps[1].bathrooms).toBe(3);

  // Third comp
  expect(comps[2].address).toBe("300 Elm Dr");
  expect(comps[2].salePrice).toBe(390000);

  // Verify fetch was called with correct URL structure
  expect(mockFetch).toHaveBeenCalledTimes(1);
  const callUrl = mockFetch.mock.calls[0][0];
  expect(callUrl).toContain("sale/snapshot");
  expect(callUrl).toContain("address1=123+Main+St");
  expect(callUrl).toContain("searchType=radius");

  // Verify API key header
  const callOpts = mockFetch.mock.calls[0][1];
  expect(callOpts.headers.apikey).toBe("mock-attom-api-key-12345");

  vi.unstubAllGlobals();
});

test("getPropertyDetails parses ATTOM expandedprofile response correctly", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(MOCK_PROPERTY_RESPONSE),
    text: () => Promise.resolve(""),
  });
  vi.stubGlobal("fetch", mockFetch);

  const { getPropertyDetails } = await import("./src/attom.ts");
  const cfg = resolveConfig({});

  const details = await getPropertyDetails(cfg, {
    address: "123 Main St",
    city: "Miami",
    state: "FL",
  });

  expect(details.address).toBe("123 Main St");
  expect(details.city).toBe("Miami");
  expect(details.state).toBe("FL");
  expect(details.county).toBe("Miami-Dade");
  expect(details.bedrooms).toBe(3);
  expect(details.bathrooms).toBe(2);
  expect(details.sqft).toBe(1900);
  expect(details.yearBuilt).toBe(2008);
  expect(details.propertyType).toBe("SFR");
  expect(details.avm).toBe(475000);
  expect(details.assessedValue).toBe(320000);
  expect(details.taxAmount).toBe(4800);
  expect(details.lastSalePrice).toBe(350000);
  expect(details.lastSaleDate).toBe("2020-03-15");

  // Verify fetch called expandedprofile endpoint
  const callUrl = mockFetch.mock.calls[0][0];
  expect(callUrl).toContain("property/expandedprofile");

  vi.unstubAllGlobals();
});

test("searchComps returns empty array when no properties", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ property: [] }),
    text: () => Promise.resolve(""),
  });
  vi.stubGlobal("fetch", mockFetch);

  const { searchComps } = await import("./src/attom.ts");
  const cfg = resolveConfig({});

  const comps = await searchComps(cfg, {
    address: "999 Nowhere Rd",
    city: "Nowhere",
    state: "ZZ",
  });

  expect(comps).toHaveLength(0);
  vi.unstubAllGlobals();
});

test("searchComps throws on ATTOM API error", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    text: () => Promise.resolve("Invalid API key"),
  });
  vi.stubGlobal("fetch", mockFetch);

  const { searchComps } = await import("./src/attom.ts");
  const cfg = resolveConfig({});

  await expect(
    searchComps(cfg, { address: "123 Main St", city: "Miami", state: "FL" }),
  ).rejects.toThrow("ATTOM API 401");

  vi.unstubAllGlobals();
});

test("searchComps uses config defaults for radius and lookback", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ property: [] }),
    text: () => Promise.resolve(""),
  });
  vi.stubGlobal("fetch", mockFetch);

  const { searchComps } = await import("./src/attom.ts");
  const cfg = resolveConfig({ comp_radius_miles: 2.5, comp_lookback_months: 3, comp_max_results: 5 });

  await searchComps(cfg, { address: "123 Main St", city: "Miami", state: "FL" });

  const callUrl = mockFetch.mock.calls[0][0];
  expect(callUrl).toContain("radius=2.5");
  expect(callUrl).toContain("pagesize=5");

  vi.unstubAllGlobals();
});

test("searchComps overrides config with explicit params", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ property: [] }),
    text: () => Promise.resolve(""),
  });
  vi.stubGlobal("fetch", mockFetch);

  const { searchComps } = await import("./src/attom.ts");
  const cfg = resolveConfig({});

  await searchComps(cfg, {
    address: "123 Main St",
    city: "Miami",
    state: "FL",
    radiusMiles: 5,
    lookbackMonths: 12,
    maxResults: 25,
  });

  const callUrl = mockFetch.mock.calls[0][0];
  expect(callUrl).toContain("radius=5");
  expect(callUrl).toContain("pagesize=25");

  vi.unstubAllGlobals();
});

/* ── CMA statistics ───────────────────────────────────────────────── */

test("CMA statistics calculated correctly from mock comps", () => {
  const prices = [425000, 550000, 390000];
  const sorted = [...prices].sort((a, b) => a - b); // [390000, 425000, 550000]
  const median = sorted[Math.floor(sorted.length / 2)]; // 425000
  const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length); // 455000

  expect(median).toBe(425000);
  expect(avg).toBe(455000);
  expect(Math.min(...prices)).toBe(390000);
  expect(Math.max(...prices)).toBe(550000);

  // Price per sqft
  const sqfts = [1800, 2200, 1650];
  const ppsf = prices.map((p, i) => Math.round(p / sqfts[i])); // [236, 250, 236]
  expect(ppsf[0]).toBe(236);
  expect(ppsf[1]).toBe(250);
  expect(ppsf[2]).toBe(236);
});

/* ── Tools definitions ────────────────────────────────────────────── */

test("createRealtyTools returns all expected tools", async () => {
  const { createRealtyTools } = await import("./tools/definitions.ts");
  const cfg = resolveConfig({});
  const tools = createRealtyTools(cfg);

  const toolNames = tools.map((t) => t.name);
  expect(toolNames).toContain("realty_comp_analysis");
  expect(toolNames).toContain("realty_list_property");
  expect(toolNames).toContain("realty_schedule_showing");
  expect(toolNames).toContain("realty_generate_listing");
  expect(toolNames).toContain("realty_track_transaction");
  expect(toolNames).toContain("realty_market_report");
  expect(tools.length).toBe(6);

  // Each tool has required fields
  for (const tool of tools) {
    expect(tool.name).toBeDefined();
    expect(tool.label).toBeDefined();
    expect(tool.description).toBeDefined();
    expect(tool.parameters).toBeDefined();
    expect(typeof tool.execute).toBe("function");
  }
});

test("realty_comp_analysis tool has correct parameter schema", async () => {
  const { createRealtyTools } = await import("./tools/definitions.ts");
  const cfg = resolveConfig({});
  const tools = createRealtyTools(cfg);

  const compTool = tools.find((t) => t.name === "realty_comp_analysis");
  expect(compTool).toBeDefined();
  const params = compTool!.parameters as { properties: Record<string, unknown>; required: string[] };
  expect(params.properties).toHaveProperty("address");
  expect(params.properties).toHaveProperty("city");
  expect(params.properties).toHaveProperty("state");
  expect(params.properties).toHaveProperty("zip");
  expect(params.properties).toHaveProperty("radius_miles");
  expect(params.properties).toHaveProperty("lookback_months");
  expect(params.required).toContain("address");
  expect(params.required).toContain("city");
  expect(params.required).toContain("state");
});
