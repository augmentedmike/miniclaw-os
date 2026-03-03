import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

/**
 * Display an image inline in the terminal.
 *
 * Priority:
 *   1. iTerm2 inline images protocol (ESC]1337)  — iTerm2, WezTerm
 *   2. Kitty graphics protocol (ESC_G)            — Kitty
 *   3. chafa (brew install chafa)                 — any terminal, ASCII fallback
 *   4. Print path only
 */
export async function displayImage(imagePath: string): Promise<void> {
  if (!fs.existsSync(imagePath)) return;

  const term = process.env.TERM_PROGRAM ?? "";
  const termName = process.env.TERM ?? "";

  if (term === "iTerm.app" || term === "WezTerm" || isITerm2Available()) {
    displayITerm2(imagePath);
    return;
  }

  if (termName === "xterm-kitty" || term === "kitty") {
    displayKitty(imagePath);
    return;
  }

  if (hasCommand("chafa")) {
    displayChafa(imagePath);
    return;
  }

  // Fallback — print open command so user can view it
  console.log(`  → open ${imagePath}`);
  spawnSync("open", [imagePath], { stdio: "ignore" });
}

// ── iTerm2 / WezTerm inline images protocol ───────────────────────────────────

function displayITerm2(imagePath: string): void {
  const data = fs.readFileSync(imagePath);
  const b64 = data.toString("base64");
  const size = data.length;
  const name = Buffer.from(path.basename(imagePath)).toString("base64");

  // ESC ] 1337 ; File = <params> : <base64> BEL
  const payload =
    `\x1b]1337;File=inline=1;size=${size};name=${name};` +
    `width=auto;height=24;preserveAspectRatio=1:${b64}\x07`;

  process.stdout.write(payload);
  process.stdout.write("\n");
}

// ── Kitty graphics protocol ───────────────────────────────────────────────────

function displayKitty(imagePath: string): void {
  const data = fs.readFileSync(imagePath);
  const b64 = data.toString("base64");

  // Chunk into 4096-byte segments as required by the protocol
  const CHUNK = 4096;
  let offset = 0;
  let first = true;

  while (offset < b64.length) {
    const chunk = b64.slice(offset, offset + CHUNK);
    offset += CHUNK;
    const more = offset < b64.length ? 1 : 0;

    if (first) {
      // First chunk: action=T (transmit+display), format=100 (PNG), medium=d (direct)
      process.stdout.write(`\x1b_Ga=T,f=100,m=${more};${chunk}\x1b\\`);
      first = false;
    } else {
      process.stdout.write(`\x1b_Gm=${more};${chunk}\x1b\\`);
    }
  }

  process.stdout.write("\n");
}

// ── chafa ─────────────────────────────────────────────────────────────────────

function displayChafa(imagePath: string): void {
  spawnSync("chafa", ["--size=80x40", imagePath], { stdio: "inherit" });
}

// ── helpers ───────────────────────────────────────────────────────────────────

function hasCommand(cmd: string): boolean {
  const result = spawnSync("command", ["-v", cmd], { shell: true, stdio: "pipe" });
  return result.status === 0;
}

/**
 * Heuristic: check if we're likely in iTerm2 even when TERM_PROGRAM isn't set
 * (e.g. when launched via OpenClaw's CLI wrapper).
 */
function isITerm2Available(): boolean {
  // iTerm2 sets this env in all child processes
  return !!(
    process.env.ITERM_SESSION_ID ||
    process.env.ITERM_PROFILE ||
    process.env.LC_TERMINAL === "iTerm2"
  );
}
