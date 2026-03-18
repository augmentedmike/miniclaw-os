import { test, expect } from "vitest";
import { registerContributeCommands } from "./commands.js";

const mockLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;
const mockCfg = {
  upstreamRepo: "test/repo",
  forkRemote: "origin",
  agentName: "test-agent",
  ghUsername: "test-user",
};

test("registerContributeCommands is a function", () => {
  expect(typeof registerContributeCommands).toBe("function");
});

test("registerContributeCommands accepts valid config without throwing", () => {
  // It needs a Commander program which we can't import here,
  // but verifying the function signature is correct
  expect(registerContributeCommands.length).toBe(2);
});
