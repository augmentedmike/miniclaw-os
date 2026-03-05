import { execFileSync } from "node:child_process";

const OPENCLAW = "/opt/homebrew/bin/openclaw";
const STATE_DIR = "/Users/augmentedmike/am";

function runBoard(args: string[]): string {
  return execFileSync(OPENCLAW, ["mc-board", ...args], {
    encoding: "utf-8",
    timeout: 30000,
    env: { ...process.env, OPENCLAW_STATE_DIR: STATE_DIR, HOME: process.env.HOME ?? "/Users/augmentedmike" },
  });
}

export function moveCard(id: string, target: string, force = false): string {
  const args = ["move", id, target];
  if (force) args.push("--force");
  return runBoard(args);
}

export function updateCard(id: string, updates: Record<string, string>): string {
  const args = ["update", id];
  for (const [k, v] of Object.entries(updates)) {
    args.push(`--${k}`, v);
  }
  return runBoard(args);
}
