/**
 * definitions.test.ts — tool schema and structure validation for mc-stripe
 *
 * Validates tool definitions have correct names, parameters, and required fields.
 * Does NOT call Stripe API — only validates the tool structure.
 */

import { describe, expect, it } from "vitest";
import { createStripeTools } from "./definitions.js";
import type { StripeConfig } from "../src/config.js";

// Static config — tools don't access Stripe at creation time, only at execute time
const mockCfg: StripeConfig = {
  vaultBin: "/fake/vault",
  testMode: true,
};

const tools = createStripeTools(mockCfg);

describe("createStripeTools", () => {
  it("returns 5 tools", () => {
    expect(tools).toHaveLength(5);
  });

  it("all tools have required fields", () => {
    for (const tool of tools) {
      expect(tool).toHaveProperty("name");
      expect(tool).toHaveProperty("label");
      expect(tool).toHaveProperty("description");
      expect(tool).toHaveProperty("parameters");
      expect(tool).toHaveProperty("execute");
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.label).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.execute).toBe("function");
    }
  });
});

describe("stripe_charge tool", () => {
  const tool = tools.find((t) => t.name === "stripe_charge")!;

  it("exists", () => {
    expect(tool).toBeDefined();
  });

  it("has correct parameter schema", () => {
    const params = tool.parameters as {
      type: string;
      properties: Record<string, unknown>;
      required: string[];
    };
    expect(params.type).toBe("object");
    expect(params.properties).toHaveProperty("amount_cents");
    expect(params.properties).toHaveProperty("currency");
    expect(params.properties).toHaveProperty("description");
    expect(params.properties).toHaveProperty("payment_method_id");
    expect(params.properties).toHaveProperty("customer_id");
    expect(params.required).toContain("amount_cents");
    expect(params.required).toContain("currency");
    expect(params.required).toContain("description");
    expect(params.additionalProperties).toBe(false);
  });
});

describe("stripe_refund tool", () => {
  const tool = tools.find((t) => t.name === "stripe_refund")!;

  it("exists", () => {
    expect(tool).toBeDefined();
  });

  it("requires payment_intent_id", () => {
    const params = tool.parameters as { required: string[] };
    expect(params.required).toContain("payment_intent_id");
  });

  it("has optional amount_cents and reason", () => {
    const params = tool.parameters as { properties: Record<string, unknown> };
    expect(params.properties).toHaveProperty("amount_cents");
    expect(params.properties).toHaveProperty("reason");
  });
});

describe("stripe_status tool", () => {
  const tool = tools.find((t) => t.name === "stripe_status")!;

  it("exists", () => {
    expect(tool).toBeDefined();
  });

  it("requires payment_intent_id", () => {
    const params = tool.parameters as { required: string[] };
    expect(params.required).toContain("payment_intent_id");
  });
});

describe("stripe_customer_create tool", () => {
  const tool = tools.find((t) => t.name === "stripe_customer_create")!;

  it("exists", () => {
    expect(tool).toBeDefined();
  });

  it("requires email", () => {
    const params = tool.parameters as { required: string[] };
    expect(params.required).toContain("email");
  });

  it("has optional name", () => {
    const params = tool.parameters as { properties: Record<string, unknown> };
    expect(params.properties).toHaveProperty("name");
  });
});

describe("stripe_customer_find tool", () => {
  const tool = tools.find((t) => t.name === "stripe_customer_find")!;

  it("exists", () => {
    expect(tool).toBeDefined();
  });

  it("requires email", () => {
    const params = tool.parameters as { required: string[] };
    expect(params.required).toContain("email");
  });
});

describe("tool names are unique", () => {
  it("no duplicate tool names", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("tool names follow naming convention", () => {
  it("all start with stripe_", () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^stripe_/);
    }
  });
});
