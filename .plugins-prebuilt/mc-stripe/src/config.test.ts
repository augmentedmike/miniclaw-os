/**
 * config.test.ts — unit tests for mc-stripe config resolution
 */

import { describe, expect, it } from "vitest";
import { resolveConfig } from "./config.js";

describe("resolveConfig", () => {
  it("returns defaults when raw config is empty", () => {
    const cfg = resolveConfig({});
    expect(cfg.vaultBin).toContain("miniclaw/SYSTEM/bin/mc-vault");
    expect(cfg.testMode).toBe(false);
  });

  it("uses provided vaultBin", () => {
    const cfg = resolveConfig({ vaultBin: "/custom/vault" });
    expect(cfg.vaultBin).toBe("/custom/vault");
  });

  it("uses provided testMode=true", () => {
    const cfg = resolveConfig({ testMode: true });
    expect(cfg.testMode).toBe(true);
  });

  it("defaults testMode to false when not set", () => {
    const cfg = resolveConfig({});
    expect(cfg.testMode).toBe(false);
  });

  it("handles testMode=false explicitly", () => {
    const cfg = resolveConfig({ testMode: false });
    expect(cfg.testMode).toBe(false);
  });

  it("returns StripeConfig shape", () => {
    const cfg = resolveConfig({});
    expect(cfg).toHaveProperty("vaultBin");
    expect(cfg).toHaveProperty("testMode");
    expect(Object.keys(cfg)).toHaveLength(2);
  });
});
