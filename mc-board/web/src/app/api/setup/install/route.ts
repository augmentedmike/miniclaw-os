export const dynamic = "force-dynamic";

import { spawn, spawnSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(process.env.HOME || "", ".openclaw");

const LOCK_FILE = path.join(process.env.OPENCLAW_STATE_DIR ?? path.join(process.env.HOME || "", ".openclaw"), ".install-lock");

function isInstallRunning(): boolean {
  try {
    if (!fs.existsSync(LOCK_FILE)) return false;
    const pid = parseInt(fs.readFileSync(LOCK_FILE, "utf-8").trim(), 10);
    if (isNaN(pid)) return false;
    // Check if process is alive
    process.kill(pid, 0);
    return true;
  } catch {
    // Process not running or file doesn't exist
    try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
    return false;
  }
}

/**
 * POST /api/setup/install
 *
 * Kicks off install.sh in the background and streams output as SSE.
 * No password required — bootstrap.sh already handled sudo caching.
 * If a password is provided, it's used to refresh the sudo timestamp.
 *
 * Events:
 *   data: {"type":"output","data":"..."}     — stdout/stderr line
 *   data: {"type":"step","name":"..."}       — detected install.sh step header
 *   data: {"type":"done","code":0}           — install finished
 *   data: {"type":"error","message":"..."}   — fatal error
 */
export async function POST(req: Request) {
  if (isInstallRunning()) {
    return new Response(JSON.stringify({ ok: false, error: "Install already running" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }

  let password: string | undefined;
  try {
    const body = await req.json();
    password = body?.password;
  } catch { /* no body is fine */ }

  // If password provided, validate and cache sudo
  if (password) {
    const sudoCheck = spawnSync("sudo", ["-S", "-v"], {
      input: password + "\n",
      encoding: "utf-8",
      timeout: 10_000,
    });
    if (sudoCheck.status !== 0) {
      return new Response(JSON.stringify({ ok: false, error: "Incorrect password" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Wait up to 60s for the repo to be cloned (bootstrap clones in background)
  let repoDir = findRepoDir();
  if (!repoDir) {
    const fs = require("node:fs");
    const STATE_DIR_LOCAL = process.env.OPENCLAW_STATE_DIR ?? path.join(process.env.HOME || "", ".openclaw");
    const expected = path.join(STATE_DIR_LOCAL, "projects", "miniclaw-os", "install.sh");
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (fs.existsSync(expected)) {
        repoDir = path.dirname(expected);
        break;
      }
    }
  }
  if (!repoDir) {
    return new Response(JSON.stringify({ ok: false, error: "Repo still downloading — click Retry in a moment" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Will write PID to lock file when process starts

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (obj: Record<string, unknown>) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* closed */ }
      };

      // Keep sudo alive if we have a password
      let sudoKeepAlive: ReturnType<typeof setInterval> | null = null;
      if (password) {
        sudoKeepAlive = setInterval(() => {
          spawnSync("sudo", ["-S", "-v"], { input: password + "\n", timeout: 5_000 });
        }, 30_000);
      }

      const proc = spawn("bash", [path.join(repoDir!, "install.sh")], {
        cwd: repoDir!,
        env: {
          ...process.env,
          HOME: process.env.HOME || "",
          PATH: buildPath(),
          OPENCLAW_STATE_DIR: STATE_DIR,
          TERM: "dumb",
          NO_COLOR: "1",
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      // Write lock file with PID
      try { fs.writeFileSync(LOCK_FILE, String(proc.pid)); } catch { /* ignore */ }

      // Auto-answer "y" to migration prompts
      proc.stdin?.write("y\n");
      proc.stdin?.end();

      let buffer = "";
      const processChunk = (chunk: Buffer) => {
        const text = chunk.toString();
        buffer += text;
        const parts = buffer.split("\n");
        buffer = parts.pop() || "";

        for (const line of parts) {
          const stepMatch = line.match(/^──\s+(Step\s+\S+:?\s*.*)$/);
          if (stepMatch) {
            send({ type: "step", name: stepMatch[1].trim() });
          }
          send({ type: "output", data: line });
        }
      };

      proc.stdout?.on("data", processChunk);
      proc.stderr?.on("data", processChunk);

      proc.on("close", (code) => {
        if (buffer.trim()) send({ type: "output", data: buffer });
        if (sudoKeepAlive) clearInterval(sudoKeepAlive);
        try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
        send({ type: "done", code: code ?? 1 });
        controller.close();
      });

      proc.on("error", (err) => {
        if (sudoKeepAlive) clearInterval(sudoKeepAlive);
        try { fs.unlinkSync(LOCK_FILE); } catch { /* ignore */ }
        send({ type: "error", message: err.message });
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * GET /api/setup/install
 *
 * Returns the current install status (for polling when the SSE stream
 * wasn't connected from the start).
 */
export async function GET() {
  // Check if an evacuated install exists (for the "we backed up your data" banner)
  // Only match what bootstrap.sh creates: .openclaw/projects/miniclaw-os.previous-*
  const evacPatterns = [
    path.join(STATE_DIR, "projects", "miniclaw-os.previous-*"),
  ];

  let evacPath: string | null = null;
  for (const pattern of evacPatterns) {
    if (pattern.includes("*")) {
      // glob not available in simple check, check common pattern
      const dir = path.dirname(pattern);
      const prefix = path.basename(pattern).replace("*", "");
      try {
        const entries = fs.readdirSync(dir);
        const match = entries.find((e) => e.startsWith(prefix));
        if (match) evacPath = path.join(dir, match);
      } catch { /* dir doesn't exist */ }
    } else if (fs.existsSync(pattern)) {
      evacPath = pattern;
    }
  }

  return new Response(JSON.stringify({
    running: isInstallRunning(),
    evacuatedInstall: evacPath,
  }), {
    headers: { "Content-Type": "application/json" },
  });
}

function findRepoDir(): string | null {
  // Check env first
  if (process.env.MINICLAW_OS_DIR) return process.env.MINICLAW_OS_DIR;

  // Walk up from CWD
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "install.sh")) && fs.existsSync(path.join(dir, "MANIFEST.json"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // Known locations
  const known = [
    path.join(STATE_DIR, "projects", "miniclaw-os"),
    path.join(process.env.HOME || "", "newam", "projects", "miniclaw-os"),
  ];
  for (const k of known) {
    if (fs.existsSync(path.join(k, "install.sh"))) return k;
  }

  return null;
}

function buildPath(): string {
  const home = process.env.HOME || "";
  return [
    `${home}/.bun/bin`,
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    process.env.PATH || "",
  ].join(":");
}
