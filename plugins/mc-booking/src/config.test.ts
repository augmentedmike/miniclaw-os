/**
 * config.test.ts — unit tests for mc-booking config resolution
 */

import { describe, expect, it } from "vitest";
import { resolveConfig } from "./config.js";

describe("resolveConfig", () => {
  it("returns defaults when raw config is empty", () => {
    const cfg = resolveConfig({});
    expect(cfg.vaultBin).toContain("miniclaw/SYSTEM/bin/mc-vault");
    expect(cfg.paymentProvider).toBe("stripe");
    expect(cfg.port).toBe(4221);
    expect(cfg.origins).toContain("https://miniclaw.bot");
    expect(cfg.origins).toContain("https://augmentedmike.com");
    expect(cfg.availableDays).toEqual([1, 2, 3]);
    expect(cfg.timeSlots).toEqual([17, 18, 19]);
    expect(cfg.durationMinutes).toBe(90);
    expect(cfg.priceCents).toBe(19900);
    expect(cfg.maxPerDay).toBe(1);
    expect(cfg.windowWeeks).toBe(4);
  });

  it("uses provided paymentProvider", () => {
    expect(resolveConfig({ paymentProvider: "square" }).paymentProvider).toBe("square");
    expect(resolveConfig({ paymentProvider: "none" }).paymentProvider).toBe("none");
  });

  it("uses provided port", () => {
    expect(resolveConfig({ port: 5000 }).port).toBe(5000);
  });

  it("uses provided origins", () => {
    const cfg = resolveConfig({ origins: ["https://custom.com"] });
    expect(cfg.origins).toEqual(["https://custom.com"]);
  });

  it("uses provided availability settings", () => {
    const cfg = resolveConfig({
      availableDays: [4, 5],
      timeSlots: [14, 15],
      durationMinutes: 60,
      priceCents: 9900,
      maxPerDay: 3,
      windowWeeks: 8,
    });
    expect(cfg.availableDays).toEqual([4, 5]);
    expect(cfg.timeSlots).toEqual([14, 15]);
    expect(cfg.durationMinutes).toBe(60);
    expect(cfg.priceCents).toBe(9900);
    expect(cfg.maxPerDay).toBe(3);
    expect(cfg.windowWeeks).toBe(8);
  });

  it("returns BookingConfig shape with all fields", () => {
    const cfg = resolveConfig({});
    const keys = Object.keys(cfg);
    expect(keys).toContain("vaultBin");
    expect(keys).toContain("paymentProvider");
    expect(keys).toContain("port");
    expect(keys).toContain("origins");
    expect(keys).toContain("availableDays");
    expect(keys).toContain("timeSlots");
    expect(keys).toContain("durationMinutes");
    expect(keys).toContain("priceCents");
    expect(keys).toContain("maxPerDay");
    expect(keys).toContain("windowWeeks");
  });
});
