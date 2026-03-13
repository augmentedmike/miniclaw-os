import { describe, expect, it } from "vitest";
import { resolveConfig } from "./config.js";

describe("resolveConfig", () => {
  it("returns default vaultBin when not provided", () => {
    const cfg = resolveConfig({});
    expect(cfg.vaultBin).toContain("miniclaw/SYSTEM/bin/mc-vault");
  });

  it("uses provided vaultBin", () => {
    const cfg = resolveConfig({ vaultBin: "/custom/path/mc-vault" });
    expect(cfg.vaultBin).toBe("/custom/path/mc-vault");
  });

  it("ignores unknown keys", () => {
    const cfg = resolveConfig({ vaultBin: "/bin/vault", foo: "bar" });
    expect(cfg.vaultBin).toBe("/bin/vault");
    expect((cfg as Record<string, unknown>).foo).toBeUndefined();
  });
});
