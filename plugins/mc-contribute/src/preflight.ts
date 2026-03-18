import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

export interface PreflightResult {
  passed: boolean;
  checks: PreflightCheck[];
  summary: string;
}

export interface PreflightCheck {
  name: string;
  passed: boolean;
  message: string;
}

function run(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { encoding: "utf-8", cwd, timeout: 30_000 }).trim();
}

/**
 * Run pre-flight checks before a PR can be submitted.
 * Blocks if:
 *   1. No test files in the diff
 *   2. Tests not passing
 *   3. Docs not updated (README check for new commands/tools)
 *   4. Security check not clean
 */
export function runPreflight(repoRoot: string, logger: Logger): PreflightResult {
  const checks: PreflightCheck[] = [];

  // 1. Check for test files in the diff
  let diffFiles: string[] = [];
  try {
    const diff = run("git", ["diff", "--name-only", "main...HEAD"], repoRoot);
    diffFiles = diff ? diff.split("\n") : [];
  } catch {
    // If main doesn't exist or diff fails, try staged
    try {
      const diff = run("git", ["diff", "--name-only", "--cached"], repoRoot);
      diffFiles = diff ? diff.split("\n") : [];
    } catch {
      diffFiles = [];
    }
  }

  const testFiles = diffFiles.filter(
    (f) => f.includes(".test.") || f.includes(".spec.") || f.includes("__tests__/")
  );
  checks.push({
    name: "test-files-in-diff",
    passed: testFiles.length > 0,
    message:
      testFiles.length > 0
        ? `Found ${testFiles.length} test file(s) in diff: ${testFiles.join(", ")}`
        : "No test files found in diff. Add or update tests before submitting a PR.",
  });

  // 2. Run tests (look for vitest config or package.json test script)
  let testsPass = false;
  let testOutput = "";
  try {
    // Find which plugins are affected and run their tests
    const affectedPlugins = new Set(
      diffFiles
        .filter((f) => f.startsWith("plugins/"))
        .map((f) => f.split("/").slice(0, 2).join("/"))
    );

    if (affectedPlugins.size > 0) {
      let allPassed = true;
      const results: string[] = [];
      for (const pluginPath of affectedPlugins) {
        const fullPath = path.join(repoRoot, pluginPath);
        const hasVitest =
          fs.existsSync(path.join(fullPath, "vitest.config.ts")) ||
          fs.existsSync(path.join(fullPath, "smoke.test.ts"));
        if (hasVitest) {
          try {
            const result = run("npx", ["vitest", "run", "--reporter=verbose"], fullPath);
            results.push(`${pluginPath}: PASS`);
          } catch (err: unknown) {
            const e = err as { stdout?: string };
            results.push(`${pluginPath}: FAIL\n${e.stdout || ""}`);
            allPassed = false;
          }
        }
      }
      testsPass = allPassed;
      testOutput = results.join("\n");
    } else {
      testsPass = true;
      testOutput = "No plugin files changed — test check skipped.";
    }
  } catch (err: unknown) {
    const e = err as { stdout?: string };
    testOutput = e.stdout || "Test execution failed";
  }
  checks.push({
    name: "tests-passing",
    passed: testsPass,
    message: testsPass ? "All tests passing." : `Tests failed:\n${testOutput}`,
  });

  // 3. Check docs updated (if new tools or CLI commands added, README should be touched)
  const newToolFiles = diffFiles.filter(
    (f) => f.includes("tools/definitions.ts") || f.includes("cli/commands.ts")
  );
  const docsUpdated = diffFiles.some(
    (f) => f.includes("README.md") || f.includes("docs/") || f.includes("PLUGIN.md")
  );
  const docsNeeded = newToolFiles.length > 0 && !docsUpdated;
  checks.push({
    name: "docs-updated",
    passed: !docsNeeded,
    message: docsNeeded
      ? `Tools or CLI commands were changed (${newToolFiles.join(", ")}) but no docs were updated. Update README.md or docs/.`
      : "Docs check passed.",
  });

  // 4. Security check
  let securityPassed = false;
  let securityOutput = "";
  const script = path.join(repoRoot, "scripts", "security-check.sh");
  if (fs.existsSync(script)) {
    try {
      securityOutput = execFileSync("bash", [script, "--all"], {
        encoding: "utf-8",
        cwd: repoRoot,
        timeout: 120_000,
      }).trim();
      securityPassed = true;
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; killed?: boolean; signal?: string };
      if (e.killed || e.signal) {
        securityOutput = "Security scan timed out.";
      } else {
        securityOutput = e.stdout || e.stderr || "Security check failed";
      }
    }
  } else {
    securityPassed = true;
    securityOutput = "No security-check.sh found — skipped.";
  }
  checks.push({
    name: "security-clean",
    passed: securityPassed,
    message: securityPassed ? "Security check passed." : `Security issues found:\n${securityOutput}`,
  });

  const passed = checks.every((c) => c.passed);
  const summary = checks
    .map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}: ${c.message.split("\n")[0]}`)
    .join("\n");

  logger.info(`Preflight ${passed ? "PASSED" : "FAILED"}:\n${summary}`);

  return { passed, checks, summary };
}

/**
 * Format preflight results for display.
 */
export function formatPreflight(result: PreflightResult): string {
  const lines = result.checks.map((c) => {
    const icon = c.passed ? "\u2705" : "\u274C";
    return `${icon} **${c.name}**: ${c.message}`;
  });
  return (
    `## Pre-flight Checklist\n\n` +
    lines.join("\n\n") +
    `\n\n**Result:** ${result.passed ? "All checks passed" : "BLOCKED \u2014 fix the issues above before submitting"}`
  );
}
