import { describe, it, expect, vi } from "vitest";
import { Command } from "commander";
import { registerTransduckCommands } from "./commands.js";
import type { TransduckPluginConfig } from "../src/client.js";

const testConfig: TransduckPluginConfig = {
  dbDir: "/tmp/test-transduck",
  provider: "openai",
  apiKeyEnv: "OPENAI_API_KEY",
  defaultSourceLang: "EN",
  defaultTargetLangs: ["DE", "ES", "FR"],
  backendModel: "gpt-4o-mini",
};

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe("registerTransduckCommands", () => {
  it("registers mc-transduck command group", () => {
    const program = new Command();
    const logger = makeLogger();
    registerTransduckCommands({ program, logger }, testConfig);

    const tdCmd = program.commands.find((c) => c.name() === "mc-transduck");
    expect(tdCmd).toBeDefined();
    expect(tdCmd!.description()).toContain("translation");
  });

  it("registers translate subcommand", () => {
    const program = new Command();
    const logger = makeLogger();
    registerTransduckCommands({ program, logger }, testConfig);

    const tdCmd = program.commands.find((c) => c.name() === "mc-transduck")!;
    const translate = tdCmd.commands.find((c) => c.name() === "translate");
    expect(translate).toBeDefined();
    expect(translate!.description()).toContain("Translate");
  });

  it("registers warm subcommand", () => {
    const program = new Command();
    const logger = makeLogger();
    registerTransduckCommands({ program, logger }, testConfig);

    const tdCmd = program.commands.find((c) => c.name() === "mc-transduck")!;
    const warm = tdCmd.commands.find((c) => c.name() === "warm");
    expect(warm).toBeDefined();
  });

  it("registers stats subcommand", () => {
    const program = new Command();
    const logger = makeLogger();
    registerTransduckCommands({ program, logger }, testConfig);

    const tdCmd = program.commands.find((c) => c.name() === "mc-transduck")!;
    const stats = tdCmd.commands.find((c) => c.name() === "stats");
    expect(stats).toBeDefined();
  });

  it("registers clear subcommand", () => {
    const program = new Command();
    const logger = makeLogger();
    registerTransduckCommands({ program, logger }, testConfig);

    const tdCmd = program.commands.find((c) => c.name() === "mc-transduck")!;
    const clear = tdCmd.commands.find((c) => c.name() === "clear");
    expect(clear).toBeDefined();
  });

  it("registers langs subcommand", () => {
    const program = new Command();
    const logger = makeLogger();
    registerTransduckCommands({ program, logger }, testConfig);

    const tdCmd = program.commands.find((c) => c.name() === "mc-transduck")!;
    const langs = tdCmd.commands.find((c) => c.name() === "langs");
    expect(langs).toBeDefined();
  });

  it("registers config subcommand", () => {
    const program = new Command();
    const logger = makeLogger();
    registerTransduckCommands({ program, logger }, testConfig);

    const tdCmd = program.commands.find((c) => c.name() === "mc-transduck")!;
    const config = tdCmd.commands.find((c) => c.name() === "config");
    expect(config).toBeDefined();
  });
});
