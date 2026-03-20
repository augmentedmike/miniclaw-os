import { test, expect, describe } from "vitest";
import { execFileSync } from "node:child_process";

describe("himalaya CLI availability", () => {
  test("himalaya binary is installed", () => {
    const version = execFileSync("himalaya", ["--version"], { encoding: "utf-8" }).trim();
    expect(version).toMatch(/himalaya/i);
  });
});
