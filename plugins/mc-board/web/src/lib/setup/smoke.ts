import { spawnSync } from "node:child_process";
import { findBin } from "./constants";

/**
 * Run mc-smoke and return the output.
 */
export function runSmoke(): { output: string; passed: boolean } {
  const smokeBin = findBin("mc-smoke");
  if (!smokeBin) return { output: "mc-smoke not found on PATH", passed: false };

  const result = spawnSync(smokeBin, [], {
    encoding: "utf-8",
    timeout: 120_000,
    env: { ...process.env, FORCE_COLOR: "0" }, // no ANSI in JSON response
  });
  const output = (result.stdout || "") + (result.stderr || "");
  return { output, passed: result.status === 0 };
}
