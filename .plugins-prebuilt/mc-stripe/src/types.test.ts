/**
 * types.test.ts — type shape validation for mc-stripe
 */

import { describe, expect, it } from "vitest";
import type { ChargeResult, RefundResult, CustomerResult } from "./types.js";

describe("ChargeResult shape", () => {
  it("accepts valid charge result", () => {
    const result: ChargeResult = {
      id: "pi_test123",
      status: "requires_payment_method",
      amount: 1999,
      currency: "usd",
      description: "Test charge",
      created: "2026-03-11T00:00:00Z",
    };
    expect(result.id).toBe("pi_test123");
    expect(result.amount).toBe(1999);
    expect(result.currency).toBe("usd");
  });
});

describe("RefundResult shape", () => {
  it("accepts valid refund result", () => {
    const result: RefundResult = {
      id: "re_test123",
      paymentIntentId: "pi_test123",
      amount: 1999,
      status: "succeeded",
      reason: "requested_by_customer",
    };
    expect(result.id).toBe("re_test123");
    expect(result.paymentIntentId).toBe("pi_test123");
  });
});

describe("CustomerResult shape", () => {
  it("accepts valid customer result", () => {
    const result: CustomerResult = {
      id: "cus_test123",
      email: "test@example.com",
      name: "Test User",
      created: "2026-03-11T00:00:00Z",
    };
    expect(result.email).toBe("test@example.com");
    expect(result.name).toBe("Test User");
  });
});
