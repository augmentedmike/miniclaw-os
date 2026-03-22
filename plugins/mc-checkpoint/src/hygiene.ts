/**
 * src/hygiene.ts
 *
 * Git hygiene enforcement: protected branches, auto-stash,
 * dirty-state warnings, and pre-commit checks.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// ── Types ────────────────────────────────────────────────────────────────────

export interface HygieneConfig {
  protectedBranches: string[];
  autoStashOnMerge: boolean;
  autoStashOnRebase: boolean;
  warnDirtyBranchSwitch: boolean;
}

export const DEFAULT_HYGIENE_CONFIG: HygieneConfig = {
  protectedBranches: ["main", "master"],
  autoStashOnMerge: true,
  autoStashOnRebase: true,
  warnDirtyBranchSwitch: true,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function git(repoPath: string, args: string[]): string {
  return execFileSync("git", ["-C", repoPath, ...args], {
    encoding: "utf-8",
    timeout: 15_000,
  }).trim();
}

function isGitRepo(repoPath: string): boolean {
  try {
    git(repoPath, ["rev-parse", "--git-dir"]);
    return true;
  } catch {
    return false;
  }
}

// ── Config persistence ───────────────────────────────────────────────────────

function configPath(repoPath: string): string {
  return path.join(repoPath, ".git", "mc-hygiene.json");
}

export function loadConfig(repoPath: string): HygieneConfig {
  const cfgFile = configPath(repoPath);
  if (fs.existsSync(cfgFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(cfgFile, "utf-8"));
      return { ...DEFAULT_HYGIENE_CONFIG, ...raw };
    } catch {
      return { ...DEFAULT_HYGIENE_CONFIG };
    }
  }
  return { ...DEFAULT_HYGIENE_CONFIG };
}

export function saveConfig(repoPath: string, config: HygieneConfig): void {
  fs.writeFileSync(configPath(repoPath), JSON.stringify(config, null, 2));
}

// ── Hook scripts ─────────────────────────────────────────────────────────────

const HYGIENE_MARKER = "# mc-hygiene-hook";

function preCommitScript(protectedBranches: string[]): string {
  const branchList = protectedBranches.map(b => `"${b}"`).join(" ");
  return `#!/bin/sh
${HYGIENE_MARKER}
# Block direct commits to protected branches — installed by mc-checkpoint hygiene
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
PROTECTED_BRANCHES=(${branchList})
for pb in "\${PROTECTED_BRANCHES[@]}"; do
  if [ "$BRANCH" = "$pb" ]; then
    echo ""
    echo "⚠️  mc-hygiene: Direct commit to protected branch '$BRANCH' is blocked."
    echo "   Create a feature branch first: git checkout -b my-feature"
    echo "   To bypass: git commit --no-verify"
    echo ""
    exit 1
  fi
done
`;
}

function preMergeStashScript(): string {
  return `#!/bin/sh
${HYGIENE_MARKER}
# Auto-stash dirty changes before merge — installed by mc-checkpoint hygiene
if [ -n "$(git status --porcelain)" ]; then
  echo "[mc-hygiene] Auto-stashing dirty changes before merge..."
  git stash push -m "mc-hygiene: auto-stash before merge" 2>/dev/null
  # Write marker so post-merge can pop
  echo "1" > "$(git rev-parse --git-dir)/mc-hygiene-stashed"
fi
`;
}

function postMergePopScript(): string {
  return `#!/bin/sh
${HYGIENE_MARKER}
# Auto-pop stash after merge — installed by mc-checkpoint hygiene
STASH_MARKER="$(git rev-parse --git-dir)/mc-hygiene-stashed"
if [ -f "$STASH_MARKER" ]; then
  rm -f "$STASH_MARKER"
  echo "[mc-hygiene] Restoring auto-stashed changes after merge..."
  git stash pop 2>/dev/null || echo "[mc-hygiene] Warning: could not auto-pop stash. Run 'git stash pop' manually."
fi
`;
}

function preRebaseStashScript(): string {
  return `#!/bin/sh
${HYGIENE_MARKER}
# Auto-stash dirty changes before rebase — installed by mc-checkpoint hygiene
if [ -n "$(git status --porcelain)" ]; then
  echo "[mc-hygiene] Auto-stashing dirty changes before rebase..."
  git stash push -m "mc-hygiene: auto-stash before rebase" 2>/dev/null
  echo "1" > "$(git rev-parse --git-dir)/mc-hygiene-stashed"
fi
`;
}

function postRewritePopScript(): string {
  return `#!/bin/sh
${HYGIENE_MARKER}
# Auto-pop stash after rebase — installed by mc-checkpoint hygiene
STASH_MARKER="$(git rev-parse --git-dir)/mc-hygiene-stashed"
if [ -f "$STASH_MARKER" ]; then
  rm -f "$STASH_MARKER"
  echo "[mc-hygiene] Restoring auto-stashed changes after rebase..."
  git stash pop 2>/dev/null || echo "[mc-hygiene] Warning: could not auto-pop stash. Run 'git stash pop' manually."
fi
`;
}

function postCheckoutWarnScript(): string {
  return `#!/bin/sh
${HYGIENE_MARKER}
# Warn about dirty state after branch switch — installed by mc-checkpoint hygiene
# post-checkout receives: prev_HEAD new_HEAD flag (flag=1 for branch switch)
if [ "$3" = "1" ]; then
  DIRTY=$(git status --porcelain 2>/dev/null)
  if [ -n "$DIRTY" ]; then
    COUNT=$(echo "$DIRTY" | wc -l | tr -d ' ')
    echo ""
    echo "⚠️  mc-hygiene: You have $COUNT uncommitted change(s) on this branch."
    echo "   Run 'git stash' or commit before switching branches."
    echo ""
  fi
fi
`;
}

// ── Hook installation ────────────────────────────────────────────────────────

function installHookScript(repoPath: string, hookName: string, script: string): boolean {
  const hooksDir = path.join(repoPath, ".git", "hooks");
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const hookPath = path.join(hooksDir, hookName);

  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, "utf-8");
    if (existing.includes(HYGIENE_MARKER)) {
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

function removeHookScript(repoPath: string, hookName: string): boolean {
  const hookPath = path.join(repoPath, ".git", "hooks", hookName);
  if (!fs.existsSync(hookPath)) return false;

  const content = fs.readFileSync(hookPath, "utf-8");
  if (!content.includes(HYGIENE_MARKER)) return false;

  const lines = content.split("\n");
  const markerIdx = lines.findIndex(l => l.includes(HYGIENE_MARKER));
  if (markerIdx <= 1) {
    fs.unlinkSync(hookPath);
  } else {
    const before = lines.slice(0, markerIdx);
    fs.writeFileSync(hookPath, before.join("\n"));
    fs.chmodSync(hookPath, 0o755);
  }
  return true;
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface HygieneStatus {
  isGitRepo: boolean;
  branch: string;
  dirty: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  protectedBranch: boolean;
  hooksInstalled: string[];
  config: HygieneConfig;
}

export function getHygieneStatus(repoPath: string): HygieneStatus {
  if (!isGitRepo(repoPath)) {
    return {
      isGitRepo: false, branch: "", dirty: false,
      stagedCount: 0, unstagedCount: 0, untrackedCount: 0,
      protectedBranch: false, hooksInstalled: [], config: DEFAULT_HYGIENE_CONFIG,
    };
  }

  const config = loadConfig(repoPath);
  const branch = (() => { try { return git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]); } catch { return "unknown"; } })();
  const porcelain = (() => { try { return git(repoPath, ["status", "--porcelain"]); } catch { return ""; } })();

  let staged = 0, unstaged = 0, untracked = 0;
  for (const line of porcelain.split("\n")) {
    if (!line) continue;
    const x = line[0], y = line[1];
    if (x === "?") untracked++;
    else {
      if (x !== " " && x !== "?") staged++;
      if (y !== " " && y !== "?") unstaged++;
    }
  }

  const hooksDir = path.join(repoPath, ".git", "hooks");
  const installed: string[] = [];
  for (const hookName of ["pre-commit", "pre-merge-commit", "post-merge", "pre-rebase", "post-rewrite", "post-checkout"]) {
    const hookPath = path.join(hooksDir, hookName);
    if (fs.existsSync(hookPath)) {
      const content = fs.readFileSync(hookPath, "utf-8");
      if (content.includes(HYGIENE_MARKER)) installed.push(hookName);
    }
  }

  return {
    isGitRepo: true,
    branch,
    dirty: staged + unstaged + untracked > 0,
    stagedCount: staged,
    unstagedCount: unstaged,
    untrackedCount: untracked,
    protectedBranch: config.protectedBranches.includes(branch),
    hooksInstalled: installed,
    config,
  };
}

export function installHygiene(repoPath: string): { installed: string[]; skipped: string[] } {
  if (!isGitRepo(repoPath)) {
    throw new Error(`Not a git repository: ${repoPath}`);
  }

  const config = loadConfig(repoPath);
  saveConfig(repoPath, config); // Ensure config file exists

  const installed: string[] = [];
  const skipped: string[] = [];

  const hooks: { name: string; script: string }[] = [
    { name: "pre-commit", script: preCommitScript(config.protectedBranches) },
    { name: "post-checkout", script: postCheckoutWarnScript() },
  ];

  if (config.autoStashOnMerge) {
    hooks.push({ name: "pre-merge-commit", script: preMergeStashScript() });
    hooks.push({ name: "post-merge", script: postMergePopScript() });
  }

  if (config.autoStashOnRebase) {
    hooks.push({ name: "pre-rebase", script: preRebaseStashScript() });
    hooks.push({ name: "post-rewrite", script: postRewritePopScript() });
  }

  for (const h of hooks) {
    if (installHookScript(repoPath, h.name, h.script)) {
      installed.push(h.name);
    } else {
      skipped.push(h.name);
    }
  }

  return { installed, skipped };
}

export function removeHygiene(repoPath: string): { removed: string[] } {
  const hookNames = ["pre-commit", "pre-merge-commit", "post-merge", "pre-rebase", "post-rewrite", "post-checkout"];
  const removed: string[] = [];
  for (const name of hookNames) {
    if (removeHookScript(repoPath, name)) removed.push(name);
  }
  return { removed };
}
