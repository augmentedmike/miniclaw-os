import { execFileSync } from "node:child_process";

const OPENCLAW = process.env.OPENCLAW_BIN ?? "openclaw";
const STATE_DIR = process.env.MINICLAW_STATE_DIR ?? process.env.OPENCLAW_STATE_DIR ?? require("node:path").join(require("node:os").homedir(), ".miniclaw");

function runBoard(args: string[]): string {
  return execFileSync(OPENCLAW, ["mc-board", ...args], {
    encoding: "utf-8",
    timeout: 30000,
    env: { ...process.env, OPENCLAW_STATE_DIR: process.env.MINICLAW_STATE_DIR ?? process.env.OPENCLAW_STATE_DIR ?? "" },
  });
}

export function moveCard(id: string, target: string, force = false): string {
  const args = ["move", id, target];
  if (force) args.push("--force");
  return runBoard(args);
}

export function pickupCard(id: string, worker: string): string {
  return runBoard(["pickup", id, "--worker", worker]);
}

export function releaseCard(id: string, worker: string): string {
  return runBoard(["release", id, "--worker", worker]);
}

export function updateCard(id: string, updates: Record<string, string>): string {
  const args = ["update", id];
  for (const [k, v] of Object.entries(updates)) {
    args.push(`--${k}`, v);
  }
  return runBoard(args);
}
