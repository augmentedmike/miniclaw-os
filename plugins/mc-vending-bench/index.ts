/**
 * mc-vending-bench — VendingBench 2 benchmark plugin for MiniClaw
 *
 * Runs MiniClaw against the VendingBench 2 autonomous agent benchmark.
 * The agent manages a simulated vending machine business for 1 year,
 * scored on final bank balance.
 *
 * Uses inspect-ai framework with MiniClaw's memory and planning systems
 * as cognitive backend for long-term coherence.
 */

import type { Command } from "commander";

interface PluginContext {
  program: Command;
  logger: { info: (m: string) => void; warn: (m: string) => void; error: (m: string) => void };
  stateDir: string;
  config: Record<string, unknown>;
}

export default function register(ctx: PluginContext) {
  const { program, logger, stateDir } = ctx;

  const bench = program
    .command("mc-vending-bench")
    .description("VendingBench 2 — benchmark MiniClaw on autonomous business operations");

  bench
    .command("run")
    .description("Start a VendingBench 2 benchmark run")
    .option("--model <model>", "Model to use", "anthropic/claude-sonnet-4-6")
    .option("--max-messages <n>", "Maximum messages", "6000")
    .option("--dry-run", "Validate setup without running")
    .action(async (opts: { model: string; maxMessages: string; dryRun?: boolean }) => {
      const { execSync } = await import("node:child_process");
      const path = await import("node:path");
      const fs = await import("node:fs");

      const harnessDir = path.join(stateDir, "miniclaw", "plugins", "mc-vending-bench", "harness");
      const script = path.join(harnessDir, "vending_bench_task.py");
      const venvPython = path.join(harnessDir, ".venv", "bin", "python3");

      if (!fs.existsSync(script)) {
        logger.error(`Harness not found at ${script}`);
        logger.error("Run: mc-vending-bench setup");
        process.exit(1);
      }

      const pythonBin = fs.existsSync(venvPython) ? venvPython : "python3";
      const args = [pythonBin, script, "--model", opts.model, "--max-messages", opts.maxMessages];
      if (opts.dryRun) args.push("--dry-run");

      try {
        execSync(args.join(" "), { stdio: "inherit", timeout: opts.dryRun ? 30_000 : 0 });
      } catch (e) {
        logger.error(`Benchmark failed: ${e}`);
        process.exit(1);
      }
    });

  bench
    .command("setup")
    .description("Install Python dependencies for VendingBench 2")
    .action(async () => {
      const { execSync } = await import("node:child_process");
      const path = await import("node:path");

      const harnessDir = path.join(stateDir, "miniclaw", "plugins", "mc-vending-bench", "harness");
      const reqFile = path.join(harnessDir, "requirements.txt");

      logger.info("Installing VendingBench 2 dependencies...");
      try {
        execSync(`pip install -r "${reqFile}"`, { stdio: "inherit" });
        logger.info("Dependencies installed. Run: mc-vending-bench run --dry-run");
      } catch (e) {
        logger.error(`Failed to install dependencies: ${e}`);
        process.exit(1);
      }
    });

  bench
    .command("results")
    .description("Show past benchmark results")
    .action(async () => {
      const path = await import("node:path");
      const fs = await import("node:fs");

      const resultsDir = path.join(stateDir, "USER", "benchmarks", "vending-bench");
      if (!fs.existsSync(resultsDir)) {
        console.log("No benchmark results yet. Run: mc-vending-bench run");
        return;
      }

      const files = fs.readdirSync(resultsDir)
        .filter((f: string) => f.endsWith(".json") && f.startsWith("run-"))
        .sort()
        .reverse();

      if (files.length === 0) {
        console.log("No benchmark results yet. Run: mc-vending-bench run");
        return;
      }

      console.log(`\nVendingBench 2 Results (${files.length} runs):\n`);
      for (const file of files.slice(0, 10)) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(resultsDir, file), "utf-8"));
          const date = file.replace("run-", "").replace(".json", "");
          const status = data.profitable ? "PROFITABLE" : data.survived ? "survived" : "FAILED";
          console.log(`  ${date}  $${data.balance?.toFixed(2) ?? "?"}\t${status}`);
        } catch { /* skip corrupt files */ }
      }
    });

  bench
    .command("doctor")
    .description("Check VendingBench 2 prerequisites")
    .action(async () => {
      const { execSync } = await import("node:child_process");

      console.log("\nVendingBench 2 — Prerequisites Check\n");

      // Python
      try {
        const pyVer = execSync("python3 --version", { encoding: "utf-8" }).trim();
        console.log(`  ✓ ${pyVer}`);
      } catch {
        console.log("  ✗ python3 not found");
      }

      // inspect-ai
      try {
        execSync("python3 -c 'import inspect_ai'", { encoding: "utf-8" });
        console.log("  ✓ inspect-ai installed");
      } catch {
        console.log("  ✗ inspect-ai not installed (pip install inspect-ai)");
      }

      // multiagent-inspect
      try {
        execSync("python3 -c 'import multiagent_inspect'", { encoding: "utf-8" });
        console.log("  ✓ multiagent-inspect installed");
      } catch {
        console.log("  ✗ multiagent-inspect not installed (pip install multiagent-inspect)");
      }

      // MiniClaw tools
      for (const tool of ["mc-kb", "mc-memo", "mc-memory", "mc-board"]) {
        try {
          execSync(`openclaw ${tool} --help`, { encoding: "utf-8", timeout: 15_000 });
          console.log(`  ✓ ${tool} available`);
        } catch {
          console.log(`  ✗ ${tool} not available`);
        }
      }

      console.log("\nTo install missing dependencies: mc-vending-bench setup");
    });

  logger.info("mc-vending-bench loaded");
}
