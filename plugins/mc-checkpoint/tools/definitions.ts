import * as path from "node:path";
import * as os from "node:os";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import type { Logger } from "pino";
import {
  createCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
} from "../src/checkpoint.js";

function schema(
  props: Record<string, unknown>,
  required?: string[],
): unknown {
  return {
    type: "object",
    properties: props,
    required: required ?? [],
    additionalProperties: false,
  };
}

function ok(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    details: {},
  };
}

function toolErr(text: string) {
  return {
    content: [{ type: "text" as const, text: text.trim() }],
    isError: true,
    details: {},
  };
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function createCheckpointTools(logger: Logger): AnyAgentTool[] {
  return [
    {
      name: "checkpoint_create",
      label: "Create Git Checkpoint",
      description:
        "Create a git checkpoint (annotated tag) at the current HEAD of a repository. " +
        "Use before any destructive operation to ensure code can be recovered.",
      parameters: schema(
        {
          repo_path: {
            type: "string",
            description: "Path to the git repository. Supports ~ expansion.",
          },
          reason: {
            type: "string",
            description: "Reason for creating this checkpoint (e.g. 'before merge', 'before major refactor')",
          },
        },
        ["repo_path"],
      ) as never,
      execute: async (args: { repo_path: string; reason?: string }) => {
        logger.info(`mc-checkpoint/tool checkpoint_create: ${args.repo_path}`);
        try {
          const repoPath = resolvePath(args.repo_path);
          const cp = createCheckpoint({
            repoPath,
            reason: args.reason ?? "agent checkpoint",
          });
          return ok(
            `Checkpoint created: ${cp.tag}\n` +
            `Branch: ${cp.branch}\n` +
            `SHA: ${cp.sha.slice(0, 12)}\n` +
            `Reason: ${cp.reason}`,
          );
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-checkpoint/tool checkpoint_create error: ${msg}`);
          return toolErr(`checkpoint_create failed: ${msg}`);
        }
      },
    },
    {
      name: "checkpoint_list",
      label: "List Git Checkpoints",
      description:
        "List all git checkpoints in a repository, sorted by date (newest first). " +
        "Shows tag name, timestamp, branch, SHA, and reason for each checkpoint.",
      parameters: schema(
        {
          repo_path: {
            type: "string",
            description: "Path to the git repository. Supports ~ expansion.",
          },
        },
        ["repo_path"],
      ) as never,
      execute: async (args: { repo_path: string }) => {
        logger.info(`mc-checkpoint/tool checkpoint_list: ${args.repo_path}`);
        try {
          const repoPath = resolvePath(args.repo_path);
          const checkpoints = listCheckpoints({ repoPath });

          if (checkpoints.length === 0) {
            return ok("No checkpoints found.");
          }

          const lines = checkpoints.map((cp, i) => {
            const date = cp.timestamp.toISOString().slice(0, 19);
            return `[${i}] ${cp.tag}  ${date}  ${cp.branch}  ${cp.sha.slice(0, 12)}  ${cp.reason}`;
          });
          lines.push(`\n${checkpoints.length} checkpoint(s)`);
          return ok(lines.join("\n"));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-checkpoint/tool checkpoint_list error: ${msg}`);
          return toolErr(`checkpoint_list failed: ${msg}`);
        }
      },
    },
    {
      name: "checkpoint_restore",
      label: "Restore Git Checkpoint",
      description:
        "Restore a repository to a previous checkpoint. Stashes uncommitted work first for safety. " +
        "Use 'checkpoint_list' first to find the right checkpoint tag.",
      parameters: schema(
        {
          repo_path: {
            type: "string",
            description: "Path to the git repository. Supports ~ expansion.",
          },
          tag: {
            type: "string",
            description: "The checkpoint tag name (e.g. 'mc-checkpoint/2026-03-22T14-30-00') or index from checkpoint_list",
          },
        },
        ["repo_path", "tag"],
      ) as never,
      execute: async (args: { repo_path: string; tag: string }) => {
        logger.info(`mc-checkpoint/tool checkpoint_restore: ${args.repo_path} → ${args.tag}`);
        try {
          const repoPath = resolvePath(args.repo_path);

          // If numeric, resolve to tag name
          let tag = args.tag;
          const idx = parseInt(tag, 10);
          if (!isNaN(idx) && tag === String(idx)) {
            const checkpoints = listCheckpoints({ repoPath });
            if (idx < 0 || idx >= checkpoints.length) {
              return toolErr(`Index ${idx} out of range. ${checkpoints.length} checkpoints available.`);
            }
            tag = checkpoints[idx].tag;
          }

          if (!tag.startsWith("mc-checkpoint/")) {
            tag = `mc-checkpoint/${tag}`;
          }

          const result = restoreCheckpoint({ repoPath, tag });
          const stashMsg = result.stashCreated
            ? "Uncommitted changes were stashed (use 'git stash pop' to recover).\n"
            : "";
          return ok(`${stashMsg}Restored to: ${result.restoredTo.slice(0, 12)} (${tag})`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          logger.error(`mc-checkpoint/tool checkpoint_restore error: ${msg}`);
          return toolErr(`checkpoint_restore failed: ${msg}`);
        }
      },
    },
  ];
}
