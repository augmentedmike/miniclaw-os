import { execFileSync } from "node:child_process";

export interface VerifyResult {
  passed: boolean;
  output: string;
  exitCode: number;
}

/**
 * Run mc-smoke as a child process and return pass/fail result.
 * mc-smoke is expected to be available on PATH via openclaw CLI.
 */
export function runSmoke(timeoutMs: number = 60_000): VerifyResult {
  try {
    const output = execFileSync("openclaw", ["mc-smoke"], {
      encoding: "utf-8",
      timeout: timeoutMs,
      env: { ...process.env },
    });
    return { passed: true, output: output.trim(), exitCode: 0 };
  } catch (err: unknown) {
    const e = err as { status?: number | null; stdout?: string; stderr?: string; killed?: boolean; signal?: string };

    if (e.killed || e.signal) {
      return {
        passed: false,
        output: `mc-smoke timed out after ${timeoutMs}ms (signal: ${e.signal || "unknown"})`,
        exitCode: -1,
      };
    }

    return {
      passed: false,
      output: (e.stdout || e.stderr || "mc-smoke failed with unknown error").trim(),
      exitCode: e.status ?? 1,
    };
  }
}
