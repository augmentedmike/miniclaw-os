/**
 * config.test.ts — unit tests for mc-square config resolution
 */

import { describe, expect, it } from "vitest";
import { resolveConfig } from "./config.js";

describe("resolveConfig", () => {
  it("returns defaults when raw config is empty", () => {
    const cfg = resolveConfig({});
    expect(cfg.vaultBin).toContain("miniclaw/SYSTEM/bin/mc-vault");
    expect(cfg.environment).toBe("sandbox");
    expect(cfg.locationId).toBe("");
    expect(cfg.currency).toBe("USD");
  });

  it("uses provided vaultBin", () => {
    const cfg = resolveConfig({ vaultBin: "/custom/vault" });
    expect(cfg.vaultBin).toBe("/custom/vault");
  });

  it("uses provided environment", () => {
    const cfg = resolveConfig({ environment: "production" });
    expect(cfg.environment).toBe("production");
  });

  it("uses provided locationId", () => {
    const cfg = resolveConfig({ locationId: "LOC_ABC123" });
    expect(cfg.locationId).toBe("LOC_ABC123");
  });

  it("uses provided currency", () => {
    const cfg = resolveConfig({ currency: "EUR" });
    expect(cfg.currency).toBe("EUR");
  });

  it("returns SquareConfig shape", () => {
    const cfg = resolveConfig({});
    expect(cfg).toHaveProperty("vaultBin");
    expect(cfg).toHaveProperty("environment");
    expect(cfg).toHaveProperty("locationId");
    expect(cfg).toHaveProperty("currency");
    expect(Object.keys(cfg)).toHaveLength(4);
  });
});
