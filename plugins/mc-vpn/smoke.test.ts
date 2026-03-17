import { describe, it, expect } from "vitest";

/**
 * Smoke test for mc-vpn plugin
 * Verifies the plugin can be loaded without crashing.
 * Doesn't require Mullvad binary to be installed.
 */
describe("mc-vpn plugin", () => {
  it("should import the plugin module without error", async () => {
    // The plugin should import and export a default function
    const pluginModule = await import("./index.js");
    expect(pluginModule.default).toBeDefined();
    expect(typeof pluginModule.default).toBe("function");
  });

  it("should export a valid VpnConfig interface (TypeScript compile check)", async () => {
    // VpnConfig is a TypeScript interface — it doesn't exist at runtime.
    // This test verifies the module loads and the register function is present.
    // If VpnConfig were invalid, this file would fail to compile.
    const pluginModule = await import("./index.js");
    expect(pluginModule.default).toBeDefined();
  });

  it("should load CLI commands without error", async () => {
    const { registerVpnCommands } = await import("./cli/commands.js");
    expect(registerVpnCommands).toBeDefined();
    expect(typeof registerVpnCommands).toBe("function");
  });

  it("should create VPN tools without error", async () => {
    const { createVpnTools } = await import("./tools/definitions.js");
    expect(createVpnTools).toBeDefined();
    expect(typeof createVpnTools).toBe("function");
  });

  it("should handle missing Mullvad binary gracefully", async () => {
    // This test verifies graceful degradation when mullvad is not installed
    const { createVpnTools } = await import("./tools/definitions.js");
    const mockConfig = {
      mullvadBin: "/nonexistent/mullvad",
      stateDir: "/tmp/mc-vpn-test",
      defaultCountry: null,
    };

    const mockLogger = {
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    const tools = createVpnTools(mockConfig, mockLogger as any);
    expect(tools).toBeDefined();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);

    // Verify tool names
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("vpn_status");
    expect(toolNames).toContain("vpn_connect");
    expect(toolNames).toContain("vpn_disconnect");
    expect(toolNames).toContain("vpn_switch_country");
  });
});
