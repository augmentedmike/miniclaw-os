import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolvePluginConfig, type TransduckPluginConfig } from "./client.js";

describe("resolvePluginConfig", () => {
  it("returns defaults when no config provided", () => {
    const cfg = resolvePluginConfig({});
    expect(cfg.provider).toBe("openai");
    expect(cfg.apiKeyEnv).toBe("OPENAI_API_KEY");
    expect(cfg.defaultSourceLang).toBe("EN");
    expect(cfg.defaultTargetLangs).toEqual(["DE", "ES", "FR"]);
    expect(cfg.backendModel).toBe("gpt-4o-mini");
    expect(cfg.dbDir).toContain("transduck");
  });

  it("overrides defaults with provided values", () => {
    const cfg = resolvePluginConfig({
      provider: "anthropic",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      defaultSourceLang: "DE",
      defaultTargetLangs: ["EN", "FR"],
      backendModel: "claude-sonnet-4-20250514",
    });
    expect(cfg.provider).toBe("anthropic");
    expect(cfg.apiKeyEnv).toBe("ANTHROPIC_API_KEY");
    expect(cfg.defaultSourceLang).toBe("DE");
    expect(cfg.defaultTargetLangs).toEqual(["EN", "FR"]);
    expect(cfg.backendModel).toBe("claude-sonnet-4-20250514");
  });

  it("resolves ~ in dbDir path", () => {
    const cfg = resolvePluginConfig({ dbDir: "~/custom/path" });
    expect(cfg.dbDir).not.toContain("~");
    expect(cfg.dbDir).toContain("custom/path");
  });
});
