/**
 * stripe-bridge.test.ts — unit tests for payment provider bridge
 *
 * Tests calculateRefundAmount logic (no subprocess calls).
 */

import { describe, expect, it } from "vitest";
import { calculateRefundAmount } from "./stripe-bridge.js";

describe("calculateRefundAmount", () => {
  const priceCents = 19900;

  it("returns full refund when 48h+ before appointment", () => {
    const futureTime = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(); // 72h ahead
    expect(calculateRefundAmount(futureTime, priceCents)).toBe(priceCents);
  });

  it("returns 50% refund when less than 48h before appointment", () => {
    const futureTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h ahead
    expect(calculateRefundAmount(futureTime, priceCents)).toBe(Math.round(priceCents * 0.5));
  });

  it("returns 50% refund at exactly 47h", () => {
    const futureTime = new Date(Date.now() + 47 * 60 * 60 * 1000).toISOString();
    expect(calculateRefundAmount(futureTime, priceCents)).toBe(Math.round(priceCents * 0.5));
  });

  it("returns full refund at exactly 48h", () => {
    const futureTime = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    expect(calculateRefundAmount(futureTime, priceCents)).toBe(priceCents);
  });

  it("returns 50% for past appointments", () => {
    const pastTime = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
    expect(calculateRefundAmount(pastTime, priceCents)).toBe(Math.round(priceCents * 0.5));
  });

  it("handles different price points", () => {
    const futureTime = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    expect(calculateRefundAmount(futureTime, 5000)).toBe(5000);
    expect(calculateRefundAmount(futureTime, 100)).toBe(100);
  });

  it("rounds correctly for odd amounts", () => {
    const soon = new Date(Date.now() + 1 * 60 * 60 * 1000).toISOString();
    // 19900 * 0.5 = 9950 — exact
    expect(calculateRefundAmount(soon, 19900)).toBe(9950);
    // 19999 * 0.5 = 9999.5 → 10000
    expect(calculateRefundAmount(soon, 19999)).toBe(10000);
  });
});
