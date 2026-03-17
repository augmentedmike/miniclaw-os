import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

interface GithubConfig {
  defaultRepo?: string;
}

function ok(text: string) {
  return { content: [{ type: "text" as const, text: text.trim() }], details: {} };
}

function run(cmd: string, args: string[], cwd?: string): string {
  return execFileSync(cmd, args, { encoding: "utf-8", cwd, timeout: 30_000 }).trim();
}

function ghWithBodyFile(
  subcmd: string[],
  body: string,
  extraArgs: string[],
  cwd?: string
): string {
  const tmpFile = path.join(os.tmpdir(), `mc-github-${Date.now()}-${Math.random().toString(36).slice(2)}.md`);
  try {
    fs.writeFileSync(tmpFile, body, "utf-8");
    return run("gh", [...subcmd, "--body-file", tmpFile, ...extraArgs], cwd);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
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

export function createGithubTools(cfg: GithubConfig, logger: Logger): AnyAgentTool[] {
  return [
    // ── Create an issue ─────────────────────────────────────────────────
    {
      name: "github_issue_create",
      label: "github_issue_create",
      description:
        "Create a GitHub issue with title, body, and optional labels.",
      parameters: {
        type: "object",
        required: ["title", "body"],
        properties: {
          title: { type: "string", description: "Issue title" },
          body: { type: "string", description: "Issue body (markdown)" },
          labels: { type: "string", description: "Comma-separated labels" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, string>;
        const repo = resolveRepo(cfg);
        const args = ["--repo", repo, "--title", p.title];
        if (p.labels) args.push("--label", p.labels);
        try {
          const url = ghWithBodyFile(["issue", "create"], p.body, args);
          logger.info(`Issue created: ${url}`);
          return ok(`Issue created: ${url}`);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to create issue: ${e.stderr || "unknown error"}`);
        }
      },
    } as AnyAgentTool,

    // ── Update an issue ─────────────────────────────────────────────────
    {
      name: "github_issue_update",
      label: "github_issue_update",
      description:
        "Update a GitHub issue — change title, body, state, labels, or assignees.",
      parameters: {
        type: "object",
        required: ["issueNumber"],
        properties: {
          issueNumber: { type: "number", description: "Issue number" },
          title: { type: "string", description: "New title" },
          body: { type: "string", description: "New body (markdown)" },
          state: { type: "string", enum: ["open", "closed"], description: "Set state" },
          addLabels: { type: "string", description: "Comma-separated labels to add" },
          removeLabels: { type: "string", description: "Comma-separated labels to remove" },
          assignees: { type: "string", description: "Comma-separated assignees to set" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const repo = resolveRepo(cfg);
        const num = String(p.issueNumber);
        const args = ["issue", "edit", num, "--repo", repo];

        if (p.title) args.push("--title", p.title as string);
        if (p.addLabels) args.push("--add-label", p.addLabels as string);
        if (p.removeLabels) args.push("--remove-label", p.removeLabels as string);
        if (p.assignees) args.push("--add-assignee", p.assignees as string);

        try {
          if (p.body) {
            ghWithBodyFile(["issue", "edit", num], p.body as string, ["--repo", repo]);
          }
          if (args.length > 4) {
            run("gh", args);
          }
          if (p.state === "closed") {
            run("gh", ["issue", "close", num, "--repo", repo]);
          } else if (p.state === "open") {
            run("gh", ["issue", "reopen", num, "--repo", repo]);
          }
          logger.info(`Issue #${num} updated`);
          return ok(`Issue #${num} updated`);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to update issue #${num}: ${e.stderr || "unknown error"}`);
        }
      },
    } as AnyAgentTool,

    // ── List issues ─────────────────────────────────────────────────────
    {
      name: "github_issue_list",
      label: "github_issue_list",
      description:
        "List GitHub issues with optional filters for state, labels, and assignee.",
      parameters: {
        type: "object",
        required: [],
        properties: {
          state: { type: "string", enum: ["open", "closed", "all"], description: "Filter by state (default: open)" },
          labels: { type: "string", description: "Comma-separated labels to filter by" },
          assignee: { type: "string", description: "Filter by assignee" },
          limit: { type: "number", description: "Max results (default: 30)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const repo = resolveRepo(cfg);
        const args = ["issue", "list", "--repo", repo];
        args.push("--state", (p.state as string) || "open");
        if (p.labels) args.push("--label", p.labels as string);
        if (p.assignee) args.push("--assignee", p.assignee as string);
        args.push("--limit", String(p.limit || 30));

        try {
          const output = run("gh", args);
          return ok(output || "No issues found");
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to list issues: ${e.stderr || "unknown error"}`);
        }
      },
    } as AnyAgentTool,

    // ── Comment on an issue ─────────────────────────────────────────────
    {
      name: "github_issue_comment",
      label: "github_issue_comment",
      description:
        "Add a comment to a GitHub issue.",
      parameters: {
        type: "object",
        required: ["issueNumber", "body"],
        properties: {
          issueNumber: { type: "number", description: "Issue number" },
          body: { type: "string", description: "Comment body (markdown)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const repo = resolveRepo(cfg);
        const num = String(p.issueNumber);
        try {
          ghWithBodyFile(["issue", "comment", num], p.body as string, ["--repo", repo]);
          logger.info(`Commented on issue #${num}`);
          return ok(`Comment added to issue #${num}`);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to comment on issue #${num}: ${e.stderr || "unknown error"}`);
        }
      },
    } as AnyAgentTool,

    // ── Create a PR ─────────────────────────────────────────────────────
    {
      name: "github_pr_create",
      label: "github_pr_create",
      description:
        "Create a GitHub pull request with title, body, and base branch.",
      parameters: {
        type: "object",
        required: ["title", "body"],
        properties: {
          title: { type: "string", description: "PR title" },
          body: { type: "string", description: "PR body (markdown)" },
          base: { type: "string", description: "Base branch (default: main)" },
          draft: { type: "boolean", description: "Create as draft PR" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const repo = resolveRepo(cfg);
        const args = ["--repo", repo, "--title", p.title as string];
        args.push("--base", (p.base as string) || "main");
        if (p.draft) args.push("--draft");

        try {
          const url = ghWithBodyFile(["pr", "create"], p.body as string, args);
          logger.info(`PR created: ${url}`);
          return ok(`PR created: ${url}`);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to create PR: ${e.stderr || "unknown error"}`);
        }
      },
    } as AnyAgentTool,

    // ── List PRs ────────────────────────────────────────────────────────
    {
      name: "github_pr_list",
      label: "github_pr_list",
      description:
        "List GitHub pull requests with optional filters.",
      parameters: {
        type: "object",
        required: [],
        properties: {
          state: { type: "string", enum: ["open", "closed", "merged", "all"], description: "Filter by state (default: open)" },
          base: { type: "string", description: "Filter by base branch" },
          author: { type: "string", description: "Filter by author" },
          limit: { type: "number", description: "Max results (default: 30)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const repo = resolveRepo(cfg);
        const args = ["pr", "list", "--repo", repo];
        args.push("--state", (p.state as string) || "open");
        if (p.base) args.push("--base", p.base as string);
        if (p.author) args.push("--author", p.author as string);
        args.push("--limit", String(p.limit || 30));

        try {
          const output = run("gh", args);
          return ok(output || "No pull requests found");
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to list PRs: ${e.stderr || "unknown error"}`);
        }
      },
    } as AnyAgentTool,

    // ── Merge a PR ──────────────────────────────────────────────────────
    {
      name: "github_pr_merge",
      label: "github_pr_merge",
      description:
        "Merge a GitHub pull request.",
      parameters: {
        type: "object",
        required: ["prNumber"],
        properties: {
          prNumber: { type: "number", description: "PR number" },
          method: { type: "string", enum: ["merge", "squash", "rebase"], description: "Merge method (default: merge)" },
          deleteRemoteBranch: { type: "boolean", description: "Delete the remote branch after merge (default: true)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const repo = resolveRepo(cfg);
        const num = String(p.prNumber);
        const method = (p.method as string) || "merge";
        const deleteBranch = p.deleteRemoteBranch !== false;
        const args = ["pr", "merge", num, "--repo", repo, `--${method}`];
        if (deleteBranch) args.push("--delete-branch");

        try {
          const output = run("gh", args);
          logger.info(`PR #${num} merged`);
          return ok(output || `PR #${num} merged via ${method}`);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to merge PR #${num}: ${e.stderr || "unknown error"}`);
        }
      },
    } as AnyAgentTool,

    // ── Create a release ────────────────────────────────────────────────
    {
      name: "github_release_create",
      label: "github_release_create",
      description:
        "Create a GitHub release with a tag, title, and body.",
      parameters: {
        type: "object",
        required: ["tag", "title"],
        properties: {
          tag: { type: "string", description: "Git tag for the release (e.g. v1.0.0)" },
          title: { type: "string", description: "Release title" },
          body: { type: "string", description: "Release notes (markdown)" },
          draft: { type: "boolean", description: "Create as draft release" },
          prerelease: { type: "boolean", description: "Mark as prerelease" },
          target: { type: "string", description: "Target commitish (branch or SHA)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const repo = resolveRepo(cfg);
        const args = ["--repo", repo, "--title", p.title as string];
        if (p.draft) args.push("--draft");
        if (p.prerelease) args.push("--prerelease");
        if (p.target) args.push("--target", p.target as string);

        try {
          let url: string;
          if (p.body) {
            url = ghWithBodyFile(["release", "create", p.tag as string], p.body as string, args);
          } else {
            url = run("gh", ["release", "create", p.tag as string, ...args, "--notes", ""]);
          }
          logger.info(`Release created: ${url}`);
          return ok(`Release created: ${url}`);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to create release: ${e.stderr || "unknown error"}`);
        }
      },
    } as AnyAgentTool,

    // ── Check workflow run status ───────────────────────────────────────
    {
      name: "github_actions_status",
      label: "github_actions_status",
      description:
        "Check the status of GitHub Actions workflow runs.",
      parameters: {
        type: "object",
        required: [],
        properties: {
          workflow: { type: "string", description: "Workflow filename or name to filter" },
          branch: { type: "string", description: "Filter by branch" },
          limit: { type: "number", description: "Max results (default: 10)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const repo = resolveRepo(cfg);
        const args = ["run", "list", "--repo", repo];
        if (p.workflow) args.push("--workflow", p.workflow as string);
        if (p.branch) args.push("--branch", p.branch as string);
        args.push("--limit", String(p.limit || 10));

        try {
          const output = run("gh", args);
          return ok(output || "No workflow runs found");
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to list workflow runs: ${e.stderr || "unknown error"}`);
        }
      },
    } as AnyAgentTool,

    // ── View a PR (diff + checks + review status) ───────────────────────
    {
      name: "github_pr_view",
      label: "github_pr_view",
      description:
        "View a pull request — diff, CI check status, review comments, and files changed. Use before merging or reviewing any PR.",
      parameters: {
        type: "object",
        required: ["prNumber"],
        properties: {
          prNumber: { type: "number", description: "PR number" },
          repo: { type: "string", description: "Override repo (owner/name)" },
          diff: { type: "boolean", description: "Include full diff (default: false — shows summary only)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const repo = (p.repo as string) || resolveRepo(cfg);
        const num = String(p.prNumber);
        const parts: string[] = [];

        try {
          // PR metadata + review status
          const meta = run("gh", ["pr", "view", num, "--repo", repo,
            "--json", "title,state,author,baseRefName,headRefName,body,reviewDecision,statusCheckRollup,files,additions,deletions,changedFiles"]);
          parts.push("## PR Metadata\n" + meta);

          // CI checks
          try {
            const checks = run("gh", ["pr", "checks", num, "--repo", repo]);
            parts.push("## CI Checks\n" + (checks || "No checks found"));
          } catch { parts.push("## CI Checks\nUnable to fetch checks"); }

          // Review comments
          try {
            const reviews = run("gh", ["pr", "view", num, "--repo", repo, "--json", "reviews,comments"]);
            parts.push("## Reviews & Comments\n" + reviews);
          } catch { /* skip */ }

          // Full diff if requested
          if (p.diff) {
            try {
              const diff = run("gh", ["pr", "diff", num, "--repo", repo]);
              parts.push("## Diff\n" + diff);
            } catch { parts.push("## Diff\nUnable to fetch diff"); }
          }

          return ok(parts.join("\n\n---\n\n"));
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to view PR #${num}: ${e.stderr || "unknown error"}`);
        }
      },
    } as AnyAgentTool,

    // ── Review a PR (approve / request-changes / comment) ───────────────
    {
      name: "github_pr_review",
      label: "github_pr_review",
      description:
        "Submit a review on a pull request — approve, request changes, or leave a comment.",
      parameters: {
        type: "object",
        required: ["prNumber", "action"],
        properties: {
          prNumber: { type: "number", description: "PR number" },
          action: { type: "string", enum: ["approve", "request-changes", "comment"], description: "Review action" },
          body: { type: "string", description: "Review comment body (required for request-changes and comment)" },
          repo: { type: "string", description: "Override repo (owner/name)" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const repo = (p.repo as string) || resolveRepo(cfg);
        const num = String(p.prNumber);
        const action = p.action as string;
        const body = (p.body as string) || "";

        if ((action === "request-changes" || action === "comment") && !body) {
          return ok(`Error: body is required for action '${action}'`);
        }

        try {
          const args = ["pr", "review", num, "--repo", repo, `--${action}`];
          if (body) {
            const result = ghWithBodyFile(["pr", "review", num], body, ["--repo", repo, `--${action}`]);
            logger.info(`PR #${num} review submitted: ${action}`);
            return ok(result || `PR #${num} review submitted: ${action}`);
          }
          const result = run("gh", args);
          logger.info(`PR #${num} review submitted: ${action}`);
          return ok(result || `PR #${num} review submitted: ${action}`);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to review PR #${num}: ${e.stderr || "unknown error"}`);
        }
      },
    } as AnyAgentTool,

    // ── Trigger a workflow dispatch ─────────────────────────────────────
    {
      name: "github_actions_trigger",
      label: "github_actions_trigger",
      description:
        "Trigger a GitHub Actions workflow_dispatch event.",
      parameters: {
        type: "object",
        required: ["workflow"],
        properties: {
          workflow: { type: "string", description: "Workflow filename (e.g. deploy.yml)" },
          ref: { type: "string", description: "Git ref to run on (default: main)" },
          inputs: { type: "string", description: "JSON string of workflow inputs" },
        },
      },
      async execute(_id: string, params: unknown) {
        const p = params as Record<string, unknown>;
        const repo = resolveRepo(cfg);
        const ref = (p.ref as string) || "main";
        const args = ["workflow", "run", p.workflow as string, "--repo", repo, "--ref", ref];

        if (p.inputs) {
          const parsed = JSON.parse(p.inputs as string) as Record<string, string>;
          for (const [key, value] of Object.entries(parsed)) {
            args.push("--field", `${key}=${value}`);
          }
        }

        try {
          run("gh", args);
          logger.info(`Workflow ${p.workflow} triggered on ${ref}`);
          return ok(`Workflow ${p.workflow} triggered on ref ${ref}`);
        } catch (err: unknown) {
          const e = err as { stderr?: string };
          return ok(`Failed to trigger workflow: ${e.stderr || "unknown error"}`);
        }
      },
    } as AnyAgentTool,
  ];
}
