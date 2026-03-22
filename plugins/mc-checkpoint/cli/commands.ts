import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import type { Command } from "commander";
import {
  createCheckpoint,
  listCheckpoints,
  restoreCheckpoint,
  pruneCheckpoints,
} from "../src/checkpoint.js";
import { formatPluginError, formatUserError, DOCTOR_SUGGESTION } from "../../shared/errors/format.js";

export interface CliContext {
  program: Command;
  logger: {
    info: (m: string) => void;
    warn: (m: string) => void;
    error: (m: string) => void;
  };
}

export interface CheckpointConfig {
  defaultMaxAgeDays: number;
}

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function resolveRepo(repoOpt?: string): string {
  if (repoOpt) return resolvePath(repoOpt);
  return process.cwd();
}

// ── Hook content ─────────────────────────────────────────────────────────────

const HOOK_MARKER = "# mc-checkpoint-auto";

function hookScript(operation: string): string {
  return `#!/bin/sh
${HOOK_MARKER}
# Auto-checkpoint before ${operation} — installed by mc-checkpoint
openclaw mc-checkpoint create --reason "auto: before ${operation}" --repo "$(git rev-parse --show-toplevel)" 2>/dev/null || true
`;
}

function installHook(repoPath: string, hookName: string, operation: string): boolean {
  const hooksDir = path.join(repoPath, ".git", "hooks");
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const hookPath = path.join(hooksDir, hookName);
  const script = hookScript(operation);

  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, "utf-8");
    if (existing.includes(HOOK_MARKER)) {
      return false; // Already installed
    }
    // Append to existing hook
    fs.appendFileSync(hookPath, "\n" + script.split("\n").slice(1).join("\n"));
  } else {
    fs.writeFileSync(hookPath, script);
  }

  fs.chmodSync(hookPath, 0o755);
  return true;
}

function removeHook(repoPath: string, hookName: string): boolean {
  const hookPath = path.join(repoPath, ".git", "hooks", hookName);
  if (!fs.existsSync(hookPath)) return false;

  const content = fs.readFileSync(hookPath, "utf-8");
  if (!content.includes(HOOK_MARKER)) return false;

  // If the entire file is our hook, remove it
  const lines = content.split("\n");
  const markerIdx = lines.findIndex((l) => l.includes(HOOK_MARKER));
  if (markerIdx <= 1) {
    // We own the whole file
    fs.unlinkSync(hookPath);
  } else {
    // Remove only our section (from marker to end or next shebang)
    const before = lines.slice(0, markerIdx);
    const after = lines.slice(markerIdx).filter((l) => !l.includes(HOOK_MARKER) && !l.includes("mc-checkpoint"));
    fs.writeFileSync(hookPath, [...before, ...after].join("\n"));
    fs.chmodSync(hookPath, 0o755);
  }
  return true;
}

// ── Commands ─────────────────────────────────────────────────────────────────

export function registerCheckpointCommands(ctx: CliContext, cfg: CheckpointConfig): void {
  const { program } = ctx;

  const checkpoint = program
    .command("mc-checkpoint")
    .description("Git checkpointing system — easy rollback, never lose code again");

  // ── mc-checkpoint create ──
  checkpoint
    .command("create")
    .description("Create a checkpoint at the current HEAD")
    .option("--reason <text>", "Reason for this checkpoint", "manual checkpoint")
    .option("--repo <path>", "Repository path (default: cwd)")
    .action((opts: { reason: string; repo?: string }) => {
      try {
        const repoPath = resolveRepo(opts.repo);
        const cp = createCheckpoint({ repoPath, reason: opts.reason });
        console.log(`Checkpoint created: ${cp.tag}`);
        console.log(`  Branch: ${cp.branch}`);
        console.log(`  SHA:    ${cp.sha.slice(0, 12)}`);
        console.log(`  Reason: ${cp.reason}`);
      } catch (err) {
        console.error(formatPluginError("mc-checkpoint", "create", err, [
          "Ensure you are in a git repository",
          "Check that HEAD has at least one commit",
          DOCTOR_SUGGESTION,
        ]));
        process.exit(1);
      }
    });

  // ── mc-checkpoint list ──
  checkpoint
    .command("list")
    .alias("ls")
    .description("List all checkpoints sorted by date")
    .option("--repo <path>", "Repository path (default: cwd)")
    .action((opts: { repo?: string }) => {
      try {
        const repoPath = resolveRepo(opts.repo);
        const checkpoints = listCheckpoints({ repoPath });

        if (checkpoints.length === 0) {
          console.log("No checkpoints found.");
          return;
        }

        console.log(`Checkpoints in ${repoPath}:\n`);
        for (let i = 0; i < checkpoints.length; i++) {
          const cp = checkpoints[i];
          const date = cp.timestamp.toISOString().slice(0, 19).replace("T", " ");
          console.log(`  [${i}] ${cp.tag}`);
          console.log(`      ${date}  ${cp.branch}  ${cp.sha.slice(0, 12)}  ${cp.reason}`);
        }
        console.log(`\n${checkpoints.length} checkpoint(s)`);
      } catch (err) {
        console.error(formatPluginError("mc-checkpoint", "list", err, [
          "Ensure you are in a git repository",
          DOCTOR_SUGGESTION,
        ]));
        process.exit(1);
      }
    });

  // ── mc-checkpoint restore ──
  checkpoint
    .command("restore <tag-or-index>")
    .description("Restore working tree to a checkpoint (stashes uncommitted work first)")
    .option("--repo <path>", "Repository path (default: cwd)")
    .action((tagOrIndex: string, opts: { repo?: string }) => {
      try {
        const repoPath = resolveRepo(opts.repo);

        // If it's a number, look up by index
        let tag = tagOrIndex;
        const idx = parseInt(tagOrIndex, 10);
        if (!isNaN(idx) && tagOrIndex === String(idx)) {
          const checkpoints = listCheckpoints({ repoPath });
          if (idx < 0 || idx >= checkpoints.length) {
            console.error(formatUserError(
              `Index ${idx} out of range. Use 'mc-checkpoint list' to see available checkpoints.`,
              [`Available indices: 0–${checkpoints.length - 1}`],
            ));
            process.exit(1);
          }
          tag = checkpoints[idx].tag;
        }

        // Add mc-checkpoint/ prefix if not present
        if (!tag.startsWith("mc-checkpoint/")) {
          tag = `mc-checkpoint/${tag}`;
        }

        console.log(`Restoring to checkpoint: ${tag}`);
        const result = restoreCheckpoint({ repoPath, tag });

        if (result.stashCreated) {
          console.log("  Uncommitted changes stashed (use 'git stash pop' to recover)");
        }
        console.log(`  Restored to: ${result.restoredTo.slice(0, 12)}`);
        console.log("Done.");
      } catch (err) {
        console.error(formatPluginError("mc-checkpoint", "restore", err, [
          "Run: openclaw mc-checkpoint list — to see available checkpoints",
          "Use the tag name or index number",
          DOCTOR_SUGGESTION,
        ]));
        process.exit(1);
      }
    });

  // ── mc-checkpoint prune ──
  checkpoint
    .command("prune")
    .description("Delete checkpoints older than a threshold")
    .option("--older-than <days>", "Max age in days", String(cfg.defaultMaxAgeDays))
    .option("--repo <path>", "Repository path (default: cwd)")
    .action((opts: { olderThan: string; repo?: string }) => {
      try {
        const repoPath = resolveRepo(opts.repo);
        const maxAgeDays = parseInt(opts.olderThan, 10);
        if (isNaN(maxAgeDays) || maxAgeDays <= 0) {
          console.error(formatUserError("Invalid --older-than value. Must be a positive number of days."));
          process.exit(1);
        }

        const deleted = pruneCheckpoints({ repoPath, maxAgeDays });
        if (deleted.length === 0) {
          console.log(`No checkpoints older than ${maxAgeDays} days.`);
        } else {
          console.log(`Pruned ${deleted.length} checkpoint(s):`);
          for (const tag of deleted) {
            console.log(`  - ${tag}`);
          }
        }
      } catch (err) {
        console.error(formatPluginError("mc-checkpoint", "prune", err, [DOCTOR_SUGGESTION]));
        process.exit(1);
      }
    });

  // ── mc-checkpoint auto-install ──
  checkpoint
    .command("auto-install")
    .description("Install git hooks that auto-checkpoint before destructive operations")
    .option("--repo <path>", "Repository path (default: cwd)")
    .action((opts: { repo?: string }) => {
      try {
        const repoPath = resolveRepo(opts.repo);
        const gitDir = path.join(repoPath, ".git");
        if (!fs.existsSync(gitDir)) {
          console.error(formatUserError(`Not a git repository: ${repoPath}`));
          process.exit(1);
        }

        const hooks = [
          { name: "pre-merge-commit", op: "merge" },
          { name: "pre-rebase", op: "rebase" },
        ];

        let installed = 0;
        for (const hook of hooks) {
          if (installHook(repoPath, hook.name, hook.op)) {
            console.log(`  Installed: ${hook.name}`);
            installed++;
          } else {
            console.log(`  Already installed: ${hook.name}`);
          }
        }

        console.log(`\n${installed > 0 ? installed + " hook(s) installed" : "All hooks already in place"} in ${repoPath}`);
      } catch (err) {
        console.error(formatPluginError("mc-checkpoint", "auto-install", err, [DOCTOR_SUGGESTION]));
        process.exit(1);
      }
    });

  // ── mc-checkpoint auto-remove ──
  checkpoint
    .command("auto-remove")
    .description("Uninstall auto-checkpoint git hooks")
    .option("--repo <path>", "Repository path (default: cwd)")
    .action((opts: { repo?: string }) => {
      try {
        const repoPath = resolveRepo(opts.repo);
        const hooks = ["pre-merge-commit", "pre-rebase"];

        let removed = 0;
        for (const hookName of hooks) {
          if (removeHook(repoPath, hookName)) {
            console.log(`  Removed: ${hookName}`);
            removed++;
          } else {
            console.log(`  Not found: ${hookName}`);
          }
        }

        console.log(`\n${removed > 0 ? removed + " hook(s) removed" : "No hooks to remove"} in ${repoPath}`);
      } catch (err) {
        console.error(formatPluginError("mc-checkpoint", "auto-remove", err, [DOCTOR_SUGGESTION]));
        process.exit(1);
      }
    });
}
