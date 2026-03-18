import type { Command } from "commander";
import type { ContributeConfig } from "../src/config.js";
import { CONTRIBUTION_GUIDELINES } from "../src/guidelines.js";
import {
  sanitizePluginName,
  sanitizeBranchTopic,
  sanitizeTitle,
  sanitizeBody,
  sanitizeFreeText,
  validateRepo,
  validateRemote,
} from "../src/sanitize.js";
import { ensureForkRemote, validatePushTarget } from "../src/fork-detect.js";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

function run(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { encoding: "utf-8", cwd, timeout: 30_000 }).trim();
}

/**
 * Run security-check.sh and decide pass/fail based on exit code only.
 * Uses a longer timeout (120s) since --all scans the entire repo.
 */
function runSecurityCheck(script: string, args: string[], cwd: string): { passed: boolean; output: string } {
  try {
    const output = execFileSync("bash", [script, ...args], {
      encoding: "utf-8",
      cwd,
      timeout: 120_000,
    }).trim();
    return { passed: true, output };
  } catch (err: unknown) {
    const e = err as { status?: number | null; stdout?: string; stderr?: string; killed?: boolean; signal?: string };
    // Timeout or signal kill — not a security finding
    if (e.killed || e.signal) {
      return {
        passed: false,
        output: `Security scan timed out or was killed (signal: ${e.signal || "unknown"}). Run manually: ./scripts/security-check.sh --all`,
      };
    }
    // Non-zero exit code means the script found real issues
    return {
      passed: false,
      output: e.stdout || e.stderr || "Security check failed (unknown error)",
    };
  }
}

function ghWithBodyFile(
  subcmd: string[],
  body: string,
  extraArgs: string[],
  cwd?: string
): string {
  const tmpFile = path.join(os.tmpdir(), `mc-contribute-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  try {
    fs.writeFileSync(tmpFile, body, "utf-8");
    return run("gh", [...subcmd, "--body-file", tmpFile, ...extraArgs], cwd);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

function collectCloneIdentity(): string {
  const hostname = os.hostname();
  const stateDir = process.env.OPENCLAW_STATE_DIR || "(not set)";
  let botId = "(unknown)";
  try {
    const agentConfig = path.join(stateDir, "agents", "main", "agent", "agent.json");
    if (fs.existsSync(agentConfig)) {
      const cfg = JSON.parse(fs.readFileSync(agentConfig, "utf-8"));
      botId = cfg.id || cfg.botId || cfg.name || "(unknown)";
    }
  } catch {}
  return `- Clone hostname: ${hostname}\n- Bot ID: ${botId}\n- State dir: ${stateDir}`;
}

export function registerContributeCommands(
  ctx: { program: Command; logger: Logger },
  cfg: ContributeConfig
): void {
  const { program, logger } = ctx;
  const upstreamRepo = validateRepo(cfg.upstreamRepo);
  const forkRemote = validateRemote(cfg.forkRemote);

  const cmd = program
    .command("mc-contribute")
    .description("Contribute to MiniClaw — scaffold plugins, submit PRs, report bugs");

  cmd
    .command("scaffold <name>")
    .description("Scaffold a new plugin (e.g. scaffold weather -> mc-weather)")
    .requiredOption("-d, --description <desc>", "Plugin description")
    .option("-r, --region <region>", "Brain region category", "utility")
    .action(async (name: string, opts: { description: string; region: string }) => {
      const pluginName = sanitizePluginName(name);
      const fullName = `mc-${pluginName}`;
      const description = sanitizeFreeText(opts.description, "description");
      const repoRoot = run("git", ["rev-parse", "--show-toplevel"]);
      const pluginDir = path.join(repoRoot, "plugins", fullName);

      if (fs.existsSync(pluginDir)) {
        console.log(`Plugin ${fullName} already exists at ${pluginDir}`);
        return;
      }

      for (const sub of ["src", "tools", "cli", "docs"]) {
        fs.mkdirSync(path.join(pluginDir, sub), { recursive: true });
      }

      const cap = pluginName.charAt(0).toUpperCase() + pluginName.slice(1);

      fs.writeFileSync(
        path.join(pluginDir, "openclaw.plugin.json"),
        JSON.stringify({
          id: fullName, name: `MiniClaw ${cap}`, description,
          version: "0.1.0",
          configSchema: { type: "object", additionalProperties: false, properties: {} },
        }, null, 2)
      );

      fs.writeFileSync(
        path.join(pluginDir, "package.json"),
        JSON.stringify({
          name: fullName, version: "0.1.0", description,
          type: "module", main: "index.ts",
        }, null, 2)
      );

      fs.writeFileSync(path.join(pluginDir, "index.ts"),
`import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { register${cap}Commands } from "./cli/commands.js";
import { create${cap}Tools } from "./tools/definitions.js";

export default function register(api: OpenClawPluginApi): void {
  api.logger.info("${fullName} loaded");

  api.registerCli((ctx) => {
    register${cap}Commands({ program: ctx.program, logger: api.logger });
  });

  for (const tool of create${cap}Tools(api.logger)) {
    api.registerTool(tool);
  }
}
`);

      fs.writeFileSync(path.join(pluginDir, "tools", "definitions.ts"),
`import type { AnyAgentTool } from "openclaw/plugin-sdk";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

export function create${cap}Tools(logger: Logger): AnyAgentTool[] {
  return [];
}
`);

      fs.writeFileSync(path.join(pluginDir, "cli", "commands.ts"),
`import type { Command } from "commander";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

export function register${cap}Commands(
  ctx: { program: Command; logger: Logger }
): void {
  const { program } = ctx;
  program.command("${fullName}").description("${description}");
}
`);

      fs.writeFileSync(path.join(pluginDir, "docs", "README.md"),
        `# ${fullName}\n\n**Brain region:** ${opts.region}\n\n${description}\n`
      );

      logger.info(`Scaffolded ${fullName} at ${pluginDir}`);
      console.log(`Scaffolded ${fullName} at plugins/${fullName}/`);
      console.log(`\nFiles created:`);
      for (const f of ["openclaw.plugin.json", "package.json", "index.ts", "tools/definitions.ts", "cli/commands.ts", "docs/README.md"]) {
        console.log(`  ${fullName}/${f}`);
      }
      console.log(`\nNext steps:`);
      console.log(`  1. Add tools in tools/definitions.ts`);
      console.log(`  2. Add CLI commands in cli/commands.ts`);
      console.log(`  3. Test with: mc plugin test ${fullName}`);
    });

  cmd
    .command("branch <topic>")
    .description("Create a contribution branch (e.g. branch mc-weather)")
    .action(async (topic: string) => {
      const slug = sanitizeBranchTopic(topic);
      const branch = `contrib/${slug}`;
      const repoRoot = run("git", ["rev-parse", "--show-toplevel"]);

      run("git", ["checkout", "main"], repoRoot);
      try { run("git", ["pull", "--ff-only"], repoRoot); } catch {}
      run("git", ["checkout", "-b", branch], repoRoot);

      logger.info(`Created branch ${branch}`);
      console.log(`Created branch: ${branch}`);
      console.log(`Make your changes, then use 'mc mc-contribute pr' to submit.`);
    });

  cmd
    .command("security")
    .description("Run security scan on the repo")
    .option("-a, --all", "Scan full repo (default: staged files only)")
    .action(async (opts: { all?: boolean }) => {
      const repoRoot = run("git", ["rev-parse", "--show-toplevel"]);
      const script = path.join(repoRoot, "scripts", "security-check.sh");
      const args = opts.all ? ["--all"] : [];

      const result = runSecurityCheck(script, args, repoRoot);
      console.log(result.output);
      if (!result.passed) {
        console.error(`\nFix these before committing.`);
        process.exit(1);
      }
    });

  cmd
    .command("pr")
    .description("Submit a pull request to miniclaw-os")
    .requiredOption("-t, --title <title>", "PR title (short, under 70 chars)")
    .requiredOption("-s, --summary <summary>", "What this PR does (1-3 bullet points)")
    .option("-p, --plugins <plugins>", "Comma-separated list of affected plugins")
    .action(async (opts: { title: string; summary: string; plugins?: string }) => {
      const title = sanitizeTitle(opts.title);
      const summary = sanitizeBody(opts.summary);
      const plugins = opts.plugins ? sanitizeFreeText(opts.plugins, "plugins") : "N/A";
      const repoRoot = run("git", ["rev-parse", "--show-toplevel"]);

      const script = path.join(repoRoot, "scripts", "security-check.sh");
      const secResult = runSecurityCheck(script, ["--all"], repoRoot);
      if (!secResult.passed) {
        console.error(`PR blocked — security issues found:\n\n${secResult.output}`);
        process.exit(1);
      }

      // Detect fork ownership — auto-fork if origin is not user-owned
      const forkResult = ensureForkRemote(repoRoot, upstreamRepo, forkRemote, logger);
      const pushRemote = forkResult.pushRemote;
      logger.info(`Fork detection: ${forkResult.message}`);

      // Validate we're not pushing directly to upstream when we don't own it
      const pushError = validatePushTarget(repoRoot, pushRemote, upstreamRepo, logger);
      if (pushError) {
        console.error(`PR blocked — ${pushError}`);
        process.exit(1);
      }

      // Push branch to the correct remote (fork or origin)
      const branch = run("git", ["branch", "--show-current"], repoRoot);
      try {
        run("git", ["push", "-u", pushRemote, branch], repoRoot);
      } catch {
        console.error(`Failed to push branch ${branch} to '${pushRemote}'. ${forkResult.isFork ? "Check your fork remote." : "Make sure your remote is set up."}`);
        process.exit(1);
      }

      const body =
        `## Summary\n\n${summary}\n\n` +
        `## Plugin(s) affected\n\n${plugins}\n\n` +
        `## Security check\n\n- [x] Ran ./scripts/security-check.sh (passed)\n- [x] No secrets, tokens, or PII in this PR\n\n` +
        `## Clone identity\n\n${collectCloneIdentity()}\n\n` +
        `---\nSubmitted via mc-contribute`;

      try {
        const prUrl = ghWithBodyFile(
          ["pr", "create"],
          body,
          ["--repo", upstreamRepo, "--title", title],
          repoRoot
        );
        console.log(`PR created: ${prUrl}`);
      } catch (err: unknown) {
        const e = err as { stderr?: string };
        console.error(`Failed to create PR: ${e.stderr || "unknown error"}`);
        process.exit(1);
      }
    });

  cmd
    .command("bug <title>")
    .description("File a bug report with auto-collected diagnostics")
    .requiredOption("-w, --what <what>", "What happened")
    .requiredOption("-e, --expected <expected>", "What should have happened")
    .option("-s, --steps <steps>", "Steps to reproduce")
    .option("-p, --plugins <plugins>", "Affected plugins")
    .action(async (title: string, opts: { what: string; expected: string; steps?: string; plugins?: string }) => {
      const safeTitle = sanitizeTitle(title);
      const what = sanitizeBody(opts.what);
      const expected = sanitizeBody(opts.expected);
      const steps = opts.steps ? sanitizeBody(opts.steps) : "(not provided)";
      const plugins = opts.plugins ? sanitizeFreeText(opts.plugins, "plugins") : "N/A";

      let macosVersion = "unknown";
      let nodeVersion = "unknown";
      let mcVersion = "unknown";
      let doctorOutput = "(mc-doctor not available)";

      try { macosVersion = run("sw_vers", ["-productVersion"]); } catch {}
      try { nodeVersion = run("node", ["--version"]); } catch {}
      try { mcVersion = run("mc", ["--version"]); } catch {}
      try { doctorOutput = run("mc-doctor", []); } catch {}

      const body =
        `**What happened?**\n${what}\n\n` +
        `**What did you expect?**\n${expected}\n\n` +
        `**Steps to reproduce**\n${steps}\n\n` +
        `**Environment**\n` +
        `- macOS version: ${macosVersion}\n` +
        `- Node version: ${nodeVersion}\n` +
        `- MiniClaw version: ${mcVersion}\n` +
        `- Plugin(s) involved: ${plugins}\n\n` +
        `**Clone identity**\n${collectCloneIdentity()}\n\n` +
        `**mc-doctor output**\n\n${doctorOutput}\n\n` +
        `---\nFiled via mc-contribute`;

      try {
        const issueUrl = ghWithBodyFile(
          ["issue", "create"],
          body,
          ["--repo", upstreamRepo, "--title", `[Bug] ${safeTitle}`, "--label", "bug"],
        );
        console.log(`Bug report filed: ${issueUrl}`);
      } catch (err: unknown) {
        const e = err as { stderr?: string };
        console.error(`Failed to file bug report: ${e.stderr || "unknown error"}`);
        console.error(`File manually at: https://github.com/${upstreamRepo}/issues/new`);
        process.exit(1);
      }
    });

  cmd
    .command("feature <title>")
    .description("Submit a feature request or plugin idea")
    .requiredOption("-p, --problem <problem>", "What problem does this solve?")
    .requiredOption("-s, --solution <solution>", "How should it work?")
    .option("-r, --region <region>", "Brain region / plugin")
    .option("--new-plugin", "This is a new plugin proposal")
    .option("--plugin-name <name>", "Proposed plugin name (mc-???)")
    .action(async (title: string, opts: { problem: string; solution: string; region?: string; newPlugin?: boolean; pluginName?: string }) => {
      const safeTitle = sanitizeTitle(title);
      const problem = sanitizeBody(opts.problem);
      const solution = sanitizeBody(opts.solution);
      const region = opts.region ? sanitizeFreeText(opts.region, "region") : "N/A";

      let body: string;
      let label: string;
      let prefix: string;

      if (opts.newPlugin) {
        const pluginName = opts.pluginName ? sanitizeFreeText(opts.pluginName, "plugin name") : "mc-???";
        label = "plugin-idea";
        prefix = "[Plugin]";
        body =
          `**Plugin name**\n${pluginName}\n\n` +
          `**Brain region**\n${region}\n\n` +
          `**What it does**\n${solution}\n\n` +
          `**Problem it solves**\n${problem}\n\n` +
          `**Clone identity**\n${collectCloneIdentity()}\n\n` +
          `---\nSubmitted via mc-contribute`;
      } else {
        label = "enhancement";
        prefix = "[Feature]";
        body =
          `**What problem does this solve?**\n${problem}\n\n` +
          `**Proposed solution**\n${solution}\n\n` +
          `**Which plugin/brain region?**\n${region}\n\n` +
          `**Clone identity**\n${collectCloneIdentity()}\n\n` +
          `---\nSubmitted via mc-contribute`;
      }

      try {
        const issueUrl = ghWithBodyFile(
          ["issue", "create"],
          body,
          ["--repo", upstreamRepo, "--title", `${prefix} ${safeTitle}`, "--label", label],
        );
        console.log(`Feature request filed: ${issueUrl}`);
      } catch (err: unknown) {
        const e = err as { stderr?: string };
        console.error(`Failed: ${e.stderr || "unknown error"}`);
        process.exit(1);
      }
    });

  cmd
    .command("status")
    .description("Check contribution status — branch, changes, open PRs")
    .action(async () => {
      const repoRoot = run("git", ["rev-parse", "--show-toplevel"]);
      const branch = run("git", ["branch", "--show-current"], repoRoot);
      const status = run("git", ["status", "--short"], repoRoot);
      const log = run("git", ["log", "--oneline", "-5"], repoRoot);

      let prs = "none";
      try {
        prs = run("gh", ["pr", "list", "--repo", upstreamRepo, "--author", "@me", "--state", "open"], repoRoot);
        if (!prs) prs = "none";
      } catch {
        prs = "(could not check — gh auth may be needed)";
      }

      console.log(`Branch: ${branch}\n`);
      console.log(`Uncommitted changes:\n${status || "(clean)"}\n`);
      console.log(`Recent commits:\n${log}\n`);
      console.log(`Open PRs:\n${prs}`);
    });

  cmd
    .command("guidelines")
    .description("Print the full MiniClaw contribution guidelines")
    .action(async () => {
      console.log(CONTRIBUTION_GUIDELINES);
    });
}
