import type { Command } from "commander";
import type { ContributeConfig } from "../src/config.js";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

export function registerContributeCommands(
  ctx: { program: Command; logger: Logger },
  cfg: ContributeConfig
): void {
  const { program, logger } = ctx;

  const cmd = program
    .command("mc-contribute")
    .description("Contribute to MiniClaw — scaffold plugins, submit PRs, report bugs");

  cmd
    .command("scaffold <name>")
    .description("Scaffold a new plugin (e.g. scaffold weather → mc-weather)")
    .requiredOption("-d, --description <desc>", "Plugin description")
    .option("-r, --region <region>", "Brain region category", "utility")
    .action(async (name: string, opts: { description: string; region: string }) => {
      logger.info(`Scaffolding mc-${name}...`);
      console.log(`Use the contribute_scaffold_plugin tool for full scaffolding.`);
    });

  cmd
    .command("branch <topic>")
    .description("Create a contribution branch (e.g. branch mc-weather)")
    .action(async (topic: string) => {
      logger.info(`Creating branch contrib/${topic}...`);
      console.log(`Use the contribute_branch tool to create the branch.`);
    });

  cmd
    .command("security")
    .description("Run security scan on the repo")
    .option("-a, --all", "Scan full repo (default: staged files only)")
    .action(async (opts: { all?: boolean }) => {
      logger.info("Running security scan...");
      console.log(`Use the contribute_security_check tool.`);
    });

  cmd
    .command("pr")
    .description("Submit a pull request to miniclaw-os")
    .action(async () => {
      logger.info("Submitting PR...");
      console.log(`Use the contribute_pr tool to create the PR.`);
    });

  cmd
    .command("status")
    .description("Check contribution status — branch, changes, open PRs")
    .action(async () => {
      console.log(`Use the contribute_status tool.`);
    });
}
