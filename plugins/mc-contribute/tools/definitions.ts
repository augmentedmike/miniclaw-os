import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { ContributeConfig } from "../src/config.js";
import { CONTRIBUTION_GUIDELINES } from "../src/guidelines.js";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

function ok(text: string) {
  return { content: [{ type: "text" as const, text: text.trim() }], details: {} };
}

function run(cmd: string, cwd?: string): string {
  return execSync(cmd, { encoding: "utf-8", cwd, timeout: 30_000 }).trim();
}

export function createContributeTools(cfg: ContributeConfig, logger: Logger): AnyAgentTool[] {
  return [
    // ── Scaffold a new plugin ──────────────────────────────────────────
    {
      name: "contribute_scaffold_plugin",
      label: "contribute_scaffold_plugin",
      description:
        "Scaffold a new MiniClaw plugin with the correct directory structure, " +
        "openclaw.plugin.json, package.json, index.ts, tools/, and cli/. " +
        "Returns the file paths created so the agent can fill in the implementation.",
      parameters: {
        type: "object",
        required: ["pluginName", "description", "brainRegion"],
        properties: {
          pluginName: {
            type: "string",
            description: "Plugin name without mc- prefix (e.g. 'weather' becomes mc-weather)",
          },
          description: {
            type: "string",
            description: "One-sentence description of what the plugin does",
          },
          brainRegion: {
            type: "string",
            description: "Cognitive category: planning, memory, communication, creation, security, utility",
          },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const name = p.pluginName.replace(/^mc-/, "");
        const fullName = `mc-${name}`;
        const repoRoot = run("git rev-parse --show-toplevel");
        const pluginDir = path.join(repoRoot, "plugins", fullName);

        if (fs.existsSync(pluginDir)) {
          return ok(`Plugin ${fullName} already exists at ${pluginDir}`);
        }

        // Create directories
        for (const sub of ["src", "tools", "cli", "docs"]) {
          fs.mkdirSync(path.join(pluginDir, sub), { recursive: true });
        }

        // openclaw.plugin.json
        fs.writeFileSync(
          path.join(pluginDir, "openclaw.plugin.json"),
          JSON.stringify(
            {
              id: fullName,
              name: `MiniClaw ${name.charAt(0).toUpperCase() + name.slice(1)}`,
              description: p.description,
              version: "0.1.0",
              configSchema: {
                type: "object",
                additionalProperties: false,
                properties: {},
              },
            },
            null,
            2
          )
        );

        // package.json
        fs.writeFileSync(
          path.join(pluginDir, "package.json"),
          JSON.stringify(
            {
              name: fullName,
              version: "0.1.0",
              description: p.description,
              type: "module",
              main: "index.ts",
            },
            null,
            2
          )
        );

        // index.ts
        fs.writeFileSync(
          path.join(pluginDir, "index.ts"),
          `import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { register${name.charAt(0).toUpperCase() + name.slice(1)}Commands } from "./cli/commands.js";
import { create${name.charAt(0).toUpperCase() + name.slice(1)}Tools } from "./tools/definitions.js";

export default function register(api: OpenClawPluginApi): void {
  api.logger.info("${fullName} loaded");

  api.registerCli((ctx) => {
    register${name.charAt(0).toUpperCase() + name.slice(1)}Commands({ program: ctx.program, logger: api.logger });
  });

  for (const tool of create${name.charAt(0).toUpperCase() + name.slice(1)}Tools(api.logger)) {
    api.registerTool(tool);
  }
}
`
        );

        // tools/definitions.ts stub
        fs.writeFileSync(
          path.join(pluginDir, "tools", "definitions.ts"),
          `import type { AnyAgentTool } from "openclaw/plugin-sdk";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

export function create${name.charAt(0).toUpperCase() + name.slice(1)}Tools(logger: Logger): AnyAgentTool[] {
  return [
    // TODO: Add your tools here
  ];
}
`
        );

        // cli/commands.ts stub
        fs.writeFileSync(
          path.join(pluginDir, "cli", "commands.ts"),
          `import type { Command } from "commander";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

export function register${name.charAt(0).toUpperCase() + name.slice(1)}Commands(
  ctx: { program: Command; logger: Logger }
): void {
  const { program } = ctx;

  program
    .command("${fullName}")
    .description("${p.description}");

  // TODO: Add subcommands here
}
`
        );

        // docs/README.md
        fs.writeFileSync(
          path.join(pluginDir, "docs", "README.md"),
          `# ${fullName}\n\n**Brain region:** ${p.brainRegion}\n\n${p.description}\n`
        );

        const files = [
          "openclaw.plugin.json",
          "package.json",
          "index.ts",
          "tools/definitions.ts",
          "cli/commands.ts",
          "docs/README.md",
        ];

        logger.info(`Scaffolded ${fullName} at ${pluginDir}`);
        return ok(
          `Scaffolded ${fullName} at plugins/${fullName}/\n\n` +
            `Files created:\n${files.map((f) => `  ${fullName}/${f}`).join("\n")}\n\n` +
            `Next steps:\n` +
            `1. Add tools in tools/definitions.ts\n` +
            `2. Add CLI commands in cli/commands.ts\n` +
            `3. Add config properties in openclaw.plugin.json\n` +
            `4. Test with: mc plugin test ${fullName}`
        );
      },
    } as AnyAgentTool,

    // ── Prepare a contribution branch ──────────────────────────────────
    {
      name: "contribute_branch",
      label: "contribute_branch",
      description:
        "Create a feature branch for a contribution. Names the branch " +
        "following the convention: contrib/<plugin-or-topic>.",
      parameters: {
        type: "object",
        required: ["topic"],
        properties: {
          topic: {
            type: "string",
            description: "Branch topic slug (e.g. 'mc-weather' or 'fix-kb-search')",
          },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const slug = p.topic.replace(/\s+/g, "-").toLowerCase();
        const branch = `contrib/${slug}`;
        const repoRoot = run("git rev-parse --show-toplevel");

        // Make sure we're on main and up to date
        run("git checkout main", repoRoot);
        try {
          run("git pull --ff-only", repoRoot);
        } catch {
          // May fail if no upstream — that's fine
        }
        run(`git checkout -b ${branch}`, repoRoot);

        logger.info(`Created branch ${branch}`);
        return ok(
          `Created branch: ${branch}\n\n` +
            `You're now on a clean branch from main.\n` +
            `Make your changes, then use contribute_pr to submit.`
        );
      },
    } as AnyAgentTool,

    // ── Run security check ─────────────────────────────────────────────
    {
      name: "contribute_security_check",
      label: "contribute_security_check",
      description:
        "Run the MiniClaw security scanner on the repo. " +
        "Checks for hardcoded secrets, API keys, tokens, and PII. " +
        "Use --staged to check only staged files, or --all for the full repo.",
      parameters: {
        type: "object",
        required: [],
        properties: {
          scope: {
            type: "string",
            enum: ["staged", "all"],
            description: "Scan staged files only (default) or full repo",
          },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const repoRoot = run("git rev-parse --show-toplevel");
        const script = path.join(repoRoot, "scripts", "security-check.sh");
        const flag = p.scope === "all" ? "--all" : "";

        try {
          const output = run(`bash ${script} ${flag}`, repoRoot);
          return ok(output);
        } catch (err: unknown) {
          const e = err as { stdout?: string; stderr?: string };
          return ok(
            `SECURITY ISSUES FOUND:\n\n${e.stdout || ""}\n${e.stderr || ""}\n\n` +
              `Fix these before committing.`
          );
        }
      },
    } as AnyAgentTool,

    // ── Submit a PR ────────────────────────────────────────────────────
    {
      name: "contribute_pr",
      label: "contribute_pr",
      description:
        "Push the current branch and create a pull request to the upstream " +
        "miniclaw-os repo. Runs the security check first. " +
        "Generates a PR title and body from the commit history.",
      parameters: {
        type: "object",
        required: ["title", "summary"],
        properties: {
          title: {
            type: "string",
            description: "PR title (short, under 70 chars)",
          },
          summary: {
            type: "string",
            description: "What this PR does (1-3 bullet points)",
          },
          pluginsAffected: {
            type: "string",
            description: "Comma-separated list of plugins this PR touches",
          },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const repoRoot = run("git rev-parse --show-toplevel");

        // Run security check first
        const script = path.join(repoRoot, "scripts", "security-check.sh");
        try {
          run(`bash ${script} --all`, repoRoot);
        } catch (err: unknown) {
          const e = err as { stdout?: string };
          return ok(
            `PR blocked — security issues found:\n\n${e.stdout || ""}\n\n` +
              `Fix these first, then try again.`
          );
        }

        // Push branch
        const branch = run("git branch --show-current", repoRoot);
        try {
          run(`git push -u ${cfg.forkRemote} ${branch}`, repoRoot);
        } catch {
          return ok(`Failed to push branch ${branch}. Make sure your fork remote is set up.`);
        }

        // Create PR
        const plugins = p.pluginsAffected || "N/A";
        const body =
          `## Summary\n\n${p.summary}\n\n` +
          `## Plugin(s) affected\n\n${plugins}\n\n` +
          `## Security check\n\n- [x] Ran \`./scripts/security-check.sh\` (passed)\n- [x] No secrets, tokens, or PII in this PR\n\n` +
          `---\nSubmitted via mc-contribute`;

        try {
          const prUrl = run(
            `gh pr create --repo ${cfg.upstreamRepo} --title "${p.title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}"`,
            repoRoot
          );
          logger.info(`PR created: ${prUrl}`);
          return ok(`PR created: ${prUrl}`);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to create PR: ${e.stderr || "unknown error"}`);
        }
      },
    } as AnyAgentTool,

    // ── Check contribution status ──────────────────────────────────────
    {
      name: "contribute_status",
      label: "contribute_status",
      description:
        "Check the status of your contribution — current branch, " +
        "uncommitted changes, open PRs, and security scan result.",
      parameters: {
        type: "object",
        required: [],
        properties: {},
      },
      async execute() {
        const repoRoot = run("git rev-parse --show-toplevel");
        const branch = run("git branch --show-current", repoRoot);
        const status = run("git status --short", repoRoot);
        const log = run("git log --oneline -5", repoRoot);

        let prs = "none";
        try {
          prs = run(`gh pr list --repo ${cfg.upstreamRepo} --author @me --state open`, repoRoot);
          if (!prs) prs = "none";
        } catch {
          prs = "(could not check — gh auth may be needed)";
        }

        return ok(
          `Branch: ${branch}\n\n` +
            `Uncommitted changes:\n${status || "(clean)"}\n\n` +
            `Recent commits:\n${log}\n\n` +
            `Open PRs:\n${prs}`
        );
      },
    } as AnyAgentTool,

    // ── Get contribution guidelines ────────────────────────────────────
    {
      name: "contribute_guidelines",
      label: "contribute_guidelines",
      description:
        "Get the full MiniClaw contribution guidelines — architecture rules, " +
        "code style, security requirements, branch naming, PR format, " +
        "bug report format, and discussion etiquette. " +
        "Read this FIRST before making any contribution.",
      parameters: {
        type: "object",
        required: [],
        properties: {},
      },
      async execute() {
        return ok(CONTRIBUTION_GUIDELINES);
      },
    } as AnyAgentTool,

    // ── File a bug report ──────────────────────────────────────────────
    {
      name: "contribute_bug_report",
      label: "contribute_bug_report",
      description:
        "File a bug report on the miniclaw-os repo. Automatically collects " +
        "environment info (macOS version, Node version, mc version) and " +
        "runs mc-doctor for diagnostics.",
      parameters: {
        type: "object",
        required: ["title", "whatHappened", "expected", "stepsToReproduce"],
        properties: {
          title: {
            type: "string",
            description: "Bug title (concise, descriptive)",
          },
          whatHappened: {
            type: "string",
            description: "What actually happened",
          },
          expected: {
            type: "string",
            description: "What should have happened",
          },
          stepsToReproduce: {
            type: "string",
            description: "Steps to reproduce (numbered list)",
          },
          pluginsInvolved: {
            type: "string",
            description: "Which plugin(s) are affected",
          },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;

        // Collect environment info
        let macosVersion = "unknown";
        let nodeVersion = "unknown";
        let mcVersion = "unknown";
        let doctorOutput = "(mc-doctor not available)";

        try { macosVersion = run("sw_vers -productVersion"); } catch {}
        try { nodeVersion = run("node --version"); } catch {}
        try { mcVersion = run("mc --version 2>/dev/null || echo 'unknown'"); } catch {}
        try { doctorOutput = run("mc-doctor 2>&1 || echo '(failed)'"); } catch {}

        const body =
          `**What happened?**\n${p.whatHappened}\n\n` +
          `**What did you expect?**\n${p.expected}\n\n` +
          `**Steps to reproduce**\n${p.stepsToReproduce}\n\n` +
          `**Environment**\n` +
          `- macOS version: ${macosVersion}\n` +
          `- Node version: ${nodeVersion}\n` +
          `- MiniClaw version: ${mcVersion}\n` +
          `- Plugin(s) involved: ${p.pluginsInvolved || "N/A"}\n\n` +
          `**mc-doctor output**\n\`\`\`\n${doctorOutput}\n\`\`\`\n\n` +
          `---\nFiled via mc-contribute`;

        try {
          const issueUrl = run(
            `gh issue create --repo ${cfg.upstreamRepo} ` +
              `--title "[Bug] ${p.title.replace(/"/g, '\\"')}" ` +
              `--label bug ` +
              `--body "${body.replace(/"/g, '\\"').replace(/`/g, "\\`")}"`,
          );
          logger.info(`Bug report filed: ${issueUrl}`);
          return ok(`Bug report filed: ${issueUrl}`);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to file bug report: ${e.stderr || "unknown error"}\n\nYou can file it manually at: https://github.com/${cfg.upstreamRepo}/issues/new?template=bug_report.md`);
        }
      },
    } as AnyAgentTool,

    // ── Request a feature ──────────────────────────────────────────────
    {
      name: "contribute_feature_request",
      label: "contribute_feature_request",
      description:
        "Submit a feature request or plugin idea to miniclaw-os.",
      parameters: {
        type: "object",
        required: ["title", "problem", "proposedSolution"],
        properties: {
          title: {
            type: "string",
            description: "Feature title",
          },
          problem: {
            type: "string",
            description: "What problem does this solve?",
          },
          proposedSolution: {
            type: "string",
            description: "How should it work?",
          },
          brainRegion: {
            type: "string",
            description: "Which brain region / plugin does this belong to?",
          },
          isNewPlugin: {
            type: "boolean",
            description: "Is this a proposal for a new plugin?",
          },
          pluginName: {
            type: "string",
            description: "If new plugin, proposed name (mc-???)",
          },
          exampleUsage: {
            type: "string",
            description: "Example CLI commands showing how it would work",
          },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const isPlugin = p.isNewPlugin as boolean;

        let body: string;
        let label: string;
        let titlePrefix: string;

        if (isPlugin) {
          label = "plugin-idea";
          titlePrefix = "[Plugin]";
          body =
            `**Plugin name**\n${(p.pluginName as string) || "mc-???"}\n\n` +
            `**Brain region / cognitive function**\n${(p.brainRegion as string) || "N/A"}\n\n` +
            `**What it does**\n${p.proposedSolution as string}\n\n` +
            `**Problem it solves**\n${p.problem as string}\n\n` +
            (p.exampleUsage ? `**Example usage**\n\`\`\`bash\n${p.exampleUsage as string}\n\`\`\`\n\n` : "") +
            `---\nSubmitted via mc-contribute`;
        } else {
          label = "enhancement";
          titlePrefix = "[Feature]";
          body =
            `**What problem does this solve?**\n${p.problem as string}\n\n` +
            `**Proposed solution**\n${p.proposedSolution as string}\n\n` +
            `**Which plugin/brain region?**\n${(p.brainRegion as string) || "N/A"}\n\n` +
            (p.exampleUsage ? `**Example usage**\n\`\`\`bash\n${p.exampleUsage as string}\n\`\`\`\n\n` : "") +
            `---\nSubmitted via mc-contribute`;
        }

        try {
          const title = `${titlePrefix} ${(p.title as string).replace(/"/g, '\\"')}`;
          const issueUrl = run(
            `gh issue create --repo ${cfg.upstreamRepo} ` +
              `--title "${title}" ` +
              `--label ${label} ` +
              `--body "${body.replace(/"/g, '\\"').replace(/`/g, "\\`")}"`,
          );
          logger.info(`Feature request filed: ${issueUrl}`);
          return ok(`Feature request filed: ${issueUrl}`);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to file feature request: ${e.stderr || "unknown error"}\n\nFile manually at: https://github.com/${cfg.upstreamRepo}/issues/new?template=feature_request.md`);
        }
      },
    } as AnyAgentTool,

    // ── Start or reply to a discussion ─────────────────────────────────
    {
      name: "contribute_discussion",
      label: "contribute_discussion",
      description:
        "Start a new GitHub Discussion on the miniclaw-os repo, or list " +
        "recent discussions. Use for architecture ideas, questions, and community talk.",
      parameters: {
        type: "object",
        required: ["action"],
        properties: {
          action: {
            type: "string",
            enum: ["list", "create"],
            description: "'list' to see recent discussions, 'create' to start a new one",
          },
          title: {
            type: "string",
            description: "Discussion title (required for create)",
          },
          body: {
            type: "string",
            description: "Discussion body (required for create)",
          },
          category: {
            type: "string",
            enum: ["Ideas", "Q&A", "Show and tell", "General"],
            description: "Discussion category (default: Ideas)",
          },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;

        if (p.action === "list") {
          try {
            const discussions = run(
              `gh api repos/${cfg.upstreamRepo}/discussions --jq '.[] | "\\(.number) \\(.title) (\\(.category.name))"' 2>/dev/null || ` +
                `gh discussion list --repo ${cfg.upstreamRepo} --limit 10 2>/dev/null || ` +
                `echo "(discussions API not available — visit https://github.com/${cfg.upstreamRepo}/discussions)"`
            );
            return ok(`Recent discussions:\n\n${discussions}`);
          } catch {
            return ok(`Visit discussions at: https://github.com/${cfg.upstreamRepo}/discussions`);
          }
        }

        if (!p.title || !p.body) {
          return ok("Both title and body are required to create a discussion.");
        }

        const category = p.category || "Ideas";
        const body = `${p.body}\n\n---\nStarted via mc-contribute`;

        try {
          const url = run(
            `gh discussion create --repo ${cfg.upstreamRepo} ` +
              `--title "${p.title.replace(/"/g, '\\"')}" ` +
              `--body "${body.replace(/"/g, '\\"')}" ` +
              `--category "${category}"`
          );
          return ok(`Discussion created: ${url}`);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(
            `Failed to create discussion: ${e.stderr || "unknown error"}\n\n` +
              `Create manually at: https://github.com/${cfg.upstreamRepo}/discussions/new`
          );
        }
      },
    } as AnyAgentTool,
  ];
}
