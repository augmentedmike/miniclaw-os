import { describe, expect, it } from "vitest";
import { createAuthTools } from "./definitions.js";

const fakeCfg = { vaultBin: "/nonexistent/vault" };

describe("tool definitions", () => {
  const tools = createAuthTools(fakeCfg);

  it("exports exactly 3 tools", () => {
    expect(tools).toHaveLength(3);
  });

  it("all tool names follow auth_ prefix convention", () => {
    for (const tool of tools) {
      expect(tool.name).toMatch(/^auth_/);
    }
  });

  it("auth_code requires service param", () => {
    const tool = tools.find((t) => t.name === "auth_code");
    expect(tool).toBeDefined();
    const params = tool!.parameters as { required: string[] };
    expect(params.required).toContain("service");
  });

  it("auth_list has no required params", () => {
    const tool = tools.find((t) => t.name === "auth_list");
    expect(tool).toBeDefined();
    const params = tool!.parameters as { required: string[] };
    expect(params.required).toEqual([]);
  });

  it("auth_time_remaining requires service param", () => {
    const tool = tools.find((t) => t.name === "auth_time_remaining");
    expect(tool).toBeDefined();
    const params = tool!.parameters as { required: string[] };
    expect(params.required).toContain("service");
  });

  it("all tools have label, description, and execute", () => {
    for (const tool of tools) {
      expect(tool.label).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(typeof tool.execute).toBe("function");
    }
  });

  it("all tools have additionalProperties: false in schema", () => {
    for (const tool of tools) {
      const params = tool.parameters as { additionalProperties: boolean };
      expect(params.additionalProperties).toBe(false);
    }
  });
});
