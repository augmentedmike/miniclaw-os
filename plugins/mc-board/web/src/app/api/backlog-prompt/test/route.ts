import { listCards } from "@/lib/data";
import { updateCard } from "@/lib/actions";
import { cardToTriageSummary, parseApplyBlock } from "@/lib/card-format";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const dynamic = "force-dynamic";

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
const LOG_DIR = path.join(STATE_DIR, "logs", "backlog-tests");

const APPLY_INSTRUCTION = `

After your analysis, output a JSON array under exactly this header (no markdown fences):
---APPLY---
[{"id":"crd_xxx","priority":"low","tags":["tag1","tag2"]}]
---END---

Rules:
- Include every card, even if no changes
- "tags" = complete new tag list
- Do NOT include "research" — research is deferred to the agent pass
- "priority" must be: low, medium, high, or critical`;

function watchPid(pid: number, t0: number, onEvent: (msg: string) => void) {
  const ts = () => `+${((Date.now() - t0) / 1000).toFixed(2)}s`;
  let seenNet = false;
  let seenEstablished = false;
  let stopped = false;
  let inFlight = false;

  function poll() {
    if (stopped || inFlight) return;
    inFlight = true;
    let out = "";
    const lsof = spawn("lsof", ["-p", String(pid), "-i", "TCP"], { stdio: ["ignore", "pipe", "ignore"] });
    lsof.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    lsof.on("close", (code) => {
      inFlight = false;
      if (stopped) return;
      if (code !== 0) { stopped = true; return; }
      const lines = out.split("\n");
      if (!seenNet && lines.some(l => /TCP/.test(l))) {
        seenNet = true;
        onEvent(`[${ts()}] pid ${pid}: TCP socket opened\n`);
      }
      if (!seenEstablished && lines.some(l => /ESTABLISHED/.test(l))) {
        seenEstablished = true;
        const conn = lines.find(l => /ESTABLISHED/.test(l)) ?? "";
        const host = conn.match(/->(.+?)\(ESTABLISHED\)/)?.[1]?.trim() ?? "remote";
        onEvent(`[${ts()}] pid ${pid}: connected → ${host}\n`);
      }
    });
  }

  const interval = setInterval(poll, 250);
  return () => { stopped = true; clearInterval(interval); };
}

export async function POST(req: Request) {
  const { prompt, debug = false } = await req.json();
  if (typeof prompt !== "string" || !prompt.trim()) {
    return new Response("prompt required", { status: 400 });
  }

  const backlogCards = listCards().filter(c => c.column === "backlog");
  if (backlogCards.length === 0) {
    return new Response("Backlog is empty — nothing to process.", {
      headers: { "Content-Type": "text/plain" },
    });
  }

  const cardsSummary = backlogCards.map(cardToTriageSummary).join("\n\n");
  const fullPrompt = prompt.replace("{{CARDS}}", cardsSummary) + APPLY_INSTRUCTION;

  fs.mkdirSync(LOG_DIR, { recursive: true });
  const ts0 = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const logFile = path.join(LOG_DIR, `${ts0}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const enc = new TextEncoder();
  const t0 = Date.now();
  const ts = () => `+${((Date.now() - t0) / 1000).toFixed(2)}s`;

  let fullOutput = "";
  // Track whether last write to each sink ended with \n (for merging-safe debug lines)
  let streamAtLineStart = true;
  let fileAtLineStart = true;

  function writeStream(msg: string) {
    if (!msg) return;
    try { writer.write(enc.encode(msg)); } catch (err) {
    // client-disconnected — stream already closed
    console.debug(`[backlog-prompt/test] Failed to write to stream:`, err);
  }
    if (msg.length > 0) streamAtLineStart = msg[msg.length - 1] === "\n";
  }

  function writeFile(msg: string) {
    if (!msg) return;
    logStream.write(msg);
    if (msg.length > 0) fileAtLineStart = msg[msg.length - 1] === "\n";
  }

  function log(msg: string) {
    writeStream(msg);
    writeFile(msg);
  }

  function logDbg(msg: string) {
    // Always write to file, ensuring it starts on a new line
    const filePfx = fileAtLineStart ? "  [dbg] " : "\n  [dbg] ";
    writeFile(`${filePfx}${msg}\n`);
    // Only write to stream if debug mode is enabled
    if (debug) {
      const streamPfx = streamAtLineStart ? "  [dbg] " : "\n  [dbg] ";
      writeStream(`${streamPfx}${msg}\n`);
    }
  }

  const { CLAUDECODE: _cc, ...env } = process.env;
  if (!env.TMPDIR) env.TMPDIR = os.tmpdir();

  const runDir = path.join(STATE_DIR, "tmp", ts0);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "CLAUDE.md"), [
    "# Backlog Triage",
    "",
    "You are running as a backlog triage processor for the Brain board.",
    "This is a sandboxed non-interactive session. Do not use tools.",
    "Respond only with your analysis and the APPLY block.",
  ].join("\n"));

  const debugFile = path.join(LOG_DIR, `${ts0}.debug.log`);
  log(`log:   ${logFile}\n`);
  log(`debug: ${debugFile}\n`);
  log(`run:   ${runDir}\n`);
  log(`[${ts()}] server: spawning claude (${backlogCards.length} card${backlogCards.length === 1 ? "" : "s"})\n`);

  const proc = spawn(CLAUDE_BIN, [
    "-p", fullPrompt,
    "--model", "claude-haiku-4-5-20251001",
    "--output-format", "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--debug-file", debugFile,
    "--mcp-config", '{"mcpServers":{}}',
    "--strict-mcp-config",
  ], { env, cwd: runDir, stdio: ["ignore", "pipe", "pipe"] });

  fs.writeFileSync(debugFile, "");
  const tail = spawn("tail", ["-f", debugFile]);
  const NOISE = /ENOENT|Broken symlink|detectFileEncoding|managed-settings|settings\.local|\[DEBUG\]/;
  tail.stdout.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(l => l.trim());
    for (const line of lines) {
      if (NOISE.test(line)) continue;
      try {
        const entry = JSON.parse(line);
        const msg = entry.message ?? entry.msg ?? line;
        if (NOISE.test(msg)) continue;
        logDbg(msg);
      } catch (err) {

        // Failed to parse as JSON — treat as raw debug line

        logDbg(line);
      }
    }
  });

  const pid = proc.pid!;
  log(`[${ts()}] server: process spawned (pid ${pid}) — watching...\n`);

  const stopWatcher = watchPid(pid, t0, log);

  let buf = "";
  let firstToken = true;

  proc.stdout.on("data", (chunk: Buffer) => {
    buf += chunk.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.type === "content_block_delta" && msg.delta?.type === "text_delta") {
          if (firstToken) {
            log(`[${ts()}] server: first token\n\n`);
            firstToken = false;
          }
          fullOutput += msg.delta.text;
          writeStream(msg.delta.text);
          writeFile(msg.delta.text);
        }
        if (msg.type === "result" && typeof msg.result === "string") {
          if (firstToken) {
            log(`[${ts()}] server: result\n\n`);
            firstToken = false;
          }
          fullOutput += msg.result;
          writeStream(msg.result);
          writeFile(msg.result);
        }
      } catch {
        writeStream(line + "\n");
        writeFile(line + "\n");
      }
    }
  });

  proc.stderr.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) {
      if (!line.trim()) continue;
      if (NOISE.test(line)) continue;
      logDbg(line);
    }
  });

  proc.on("close", (code) => {
    stopWatcher();
    setTimeout(() => tail.kill(), 300);
    if (buf.trim()) { fullOutput += buf; writeStream(buf); writeFile(buf); }
    log(`\n[${ts()}] done (exit ${code})\n`);

    // Parse and apply updates
    const updates = parseApplyBlock(fullOutput);
    if (updates.length > 0) {
      log(`\n[${ts()}] applying ${updates.length} update(s)...\n`);
      let applied = 0;
      for (const u of updates) {
        try {
          const fields: Record<string, string> = {};
          if (u.priority) fields.priority = u.priority;
          if (u.tags) fields.tags = u.tags.join(",");
          if (u.research) fields.research = u.research;
          if (Object.keys(fields).length > 0) {
            updateCard(u.id, fields);
            applied++;
            log(`  [apply] ${u.id}: ${Object.keys(fields).join(", ")}\n`);
          }
        } catch (e) {
          log(`  [apply] ${u.id}: error — ${String(e)}\n`);
        }
      }
      log(`[${ts()}] applied ${applied}/${updates.length} updates\n`);
    } else {
      log(`[${ts()}] no APPLY block found — nothing written\n`);
    }

    logStream.end();
    writer.close();
  });

  proc.on("error", (err) => {
    stopWatcher();
    tail.kill();
    log(`\n[${ts()}] error: ${err.message}\n`);
    logStream.end();
    writer.close();
  });

  return new Response(stream.readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Card-Count": String(backlogCards.length) },
  });
}
