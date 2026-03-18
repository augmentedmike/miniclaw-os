/**
 * definitions.test.ts — tool schema validation for mc-square
 */

import { describe, expect, it } from "vitest";
import { createSquareTools } from "./definitions.js";
import type { SquareConfig } from "../src/config.js";

// Static config — tools don't access vault at creation time, only at execute time
const mockCfg: SquareConfig = {
  vaultBin: "/fake/vault",
  environment: "sandbox",
  locationId: "LOC_TEST",
  currency: "USD",
};

const tools = createSquareTools(mockCfg);

describe("createSquareTools", () => {
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
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("no duplicate tool names", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all start with square_", () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^square_/);
    }
  });
});

describe("square_charge tool", () => {
  const tool = tools.find((t) => t.name === "square_charge")!;

  it("requires amount_cents", () => {
    const params = tool.parameters as { required: string[] };
    expect(params.required).toContain("amount_cents");
  });

  it("has optional currency, note, customer_id", () => {
    const params = tool.parameters as { properties: Record<string, unknown> };
    expect(params.properties).toHaveProperty("currency");
    expect(params.properties).toHaveProperty("note");
    expect(params.properties).toHaveProperty("customer_id");
  });
});

describe("square_refund tool", () => {
  const tool = tools.find((t) => t.name === "square_refund")!;

  it("requires payment_id", () => {
    const params = tool.parameters as { required: string[] };
    expect(params.required).toContain("payment_id");
  });
});

describe("square_status tool", () => {
  const tool = tools.find((t) => t.name === "square_status")!;

  it("requires payment_id", () => {
    const params = tool.parameters as { required: string[] };
    expect(params.required).toContain("payment_id");
  });
});

describe("square_payment_link tool", () => {
  const tool = tools.find((t) => t.name === "square_payment_link")!;

  it("requires amount_cents and title", () => {
    const params = tool.parameters as { required: string[] };
    expect(params.required).toContain("amount_cents");
    expect(params.required).toContain("title");
  });
});

describe("square_list_payments tool", () => {
  const tool = tools.find((t) => t.name === "square_list_payments")!;

  it("has optional limit", () => {
    const params = tool.parameters as { properties: Record<string, unknown>; required: string[] };
    expect(params.properties).toHaveProperty("limit");
    expect(params.required).toEqual([]);
  });
});
