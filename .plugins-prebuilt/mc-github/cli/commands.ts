import type { Command } from "commander";
import { execFileSync } from "child_process";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

interface GithubConfig {
  defaultRepo?: string;
}

function run(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { encoding: "utf-8", cwd, timeout: 30_000 }).trim();
}

function resolveRepo(cfg: GithubConfig): string {
  if (cfg.defaultRepo) return cfg.defaultRepo;
  try {
    const remote = run("git", ["remote", "get-url", "origin"]);
    const match = remote.match(/github\.com[:/]([^/]+\/[^/.]+)/);
    if (match) return match[1];
  } catch {}
  throw new Error("No defaultRepo configured and could not detect repo from git remote — set defaultRepo in plugin config");
}

export function registerGithubCommands(
  ctx: { program: Command; logger: Logger },
  cfg: GithubConfig
): void {
  const { program } = ctx;

  const cmd = program
    .command("github")
    .description("Manage GitHub issues, PRs, and workflows");

  cmd
    .command("issues")
    .description("List open issues")
    .option("-s, --state <state>", "Filter by state (open, closed, all)", "open")
    .option("-l, --label <label>", "Filter by label")
    .option("--limit <n>", "Max results", "30")
    .action((opts: { state: string; label?: string; limit: string }) => {
      const repo = resolveRepo(cfg);
      const args = ["issue", "list", "--repo", repo, "--state", opts.state, "--limit", opts.limit];
      if (opts.label) args.push("--label", opts.label);
      try {
        const output = run("gh", args);
        console.log(output || "No issues found");
      } catch (err: unknown) {
        const e = err as { stderr?: string };
        console.error(`Failed to list issues: ${e.stderr || "unknown error"}`);
        process.exit(1);
      }
    });

  cmd
    .command("issue <number>")
    .description("Show issue details")
    .action((number: string) => {
      const repo = resolveRepo(cfg);
      try {
        const output = run("gh", ["issue", "view", number, "--repo", repo]);
        console.log(output);
      } catch (err: unknown) {
        const e = err as { stderr?: string };
        console.error(`Failed to view issue #${number}: ${e.stderr || "unknown error"}`);
        process.exit(1);
      }
    });

  cmd
    .command("prs")
    .description("List open pull requests")
    .option("-s, --state <state>", "Filter by state (open, closed, merged, all)", "open")
    .option("--limit <n>", "Max results", "30")
    .action((opts: { state: string; limit: string }) => {
      const repo = resolveRepo(cfg);
      const args = ["pr", "list", "--repo", repo, "--state", opts.state, "--limit", opts.limit];
      try {
        const output = run("gh", args);
        console.log(output || "No pull requests found");
      } catch (err: unknown) {
        const e = err as { stderr?: string };
        console.error(`Failed to list PRs: ${e.stderr || "unknown error"}`);
        process.exit(1);
      }
    });

  cmd
    .command("pr <number>")
    .description("Show pull request details")
    .action((number: string) => {
      const repo = resolveRepo(cfg);
      try {
        const output = run("gh", ["pr", "view", number, "--repo", repo]);
        console.log(output);
      } catch (err: unknown) {
        const e = err as { stderr?: string };
        console.error(`Failed to view PR #${number}: ${e.stderr || "unknown error"}`);
        process.exit(1);
      }
    });
}
