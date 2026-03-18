import { describe, it, expect } from "vitest";

describe("mc-reflection smoke tests", () => {
  it("plugin exports default function", async () => {
    const mod = await import("./index.ts");
    expect(typeof mod.default).toBe("function");
  });

  it("types module exports generators", async () => {
    const { generateReflectionId, today, yesterday } = await import("./src/types.ts");
    expect(generateReflectionId()).toMatch(/^refl_[0-9a-f]{8}$/);
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(yesterday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("gather module exports functions", async () => {
    const { gather, formatContext } = await import("./src/gather.ts");
    expect(typeof gather).toBe("function");
    expect(typeof formatContext).toBe("function");
  });

  it("store module exports ReflectionStore", async () => {
    const { ReflectionStore } = await import("./src/store.ts");
    expect(typeof ReflectionStore).toBe("function");
  });

  it("tools module exports createReflectionTools", async () => {
    const { createReflectionTools } = await import("./tools/definitions.ts");
    expect(typeof createReflectionTools).toBe("function");
  });

  it("CLI module exports registerReflectionCommands", async () => {
    const { registerReflectionCommands } = await import("./cli/commands.ts");
    expect(typeof registerReflectionCommands).toBe("function");
  });
});
