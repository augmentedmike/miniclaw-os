import { NextRequest } from "next/server";
import { listCards } from "@/lib/data";
import { updateCard, moveCard } from "@/lib/actions";
import { cardToTriageSummary, parseApplyBlock } from "@/lib/card-format";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const dynamic = "force-dynamic";

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".miniclaw");

const APPLY_INSTRUCTION = `

After your analysis, output a JSON array under exactly this header (no markdown fences):
---APPLY---
[{"id":"crd_xxx","priority":"low","tags":["tag1","tag2"],"move_to":"in-progress"}]
---END---

Rules:
- Include every card, even if no changes
- "tags" = complete new tag list
- Do NOT include "research" — research is deferred to the agent pass
- "priority" must be: low, medium, high, or critical
- "move_to": set to "in-progress" ONLY if the card has a clear problem_description, acceptance_criteria, AND implementation_plan and is ready to be worked on. Otherwise omit it.`;

function watchPid(pid: number, t0: number, onEvent: (msg: string) => void) {
  const ts = () => `+${((Date.now() - t0) / 1000).toFixed(2)}s`;
  let seenNet = false, seenEstablished = false, stopped = false, inFlight = false;

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
      if (!seenNet && lines.some(l => /TCP/.test(l))) { seenNet = true; onEvent(`[${ts()}] pid ${pid}: TCP socket opened\n`); }
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

export async function POST(req: NextRequest, { params }: { params: Promise<{ column: string }> }) {
  const { column } = await params;
  const { prompt } = await req.json();
  if (typeof prompt !== "string" || !prompt.trim()) {
    return new Response("prompt required", { status: 400 });
  }

  const colCards = listCards().filter(c => c.column === column);
  if (colCards.length === 0) {
    return new Response(`${column} column is empty — nothing to process.`, {
      headers: { "Content-Type": "text/plain" },
    });
  }

  const cardsSummary = colCards.map(cardToTriageSummary).join("\n\n");
  const fullPrompt = prompt.replace("{{CARDS}}", cardsSummary) + APPLY_INSTRUCTION;

  const logDir = path.join(STATE_DIR, "logs", `${column}-triage`);
  fs.mkdirSync(logDir, { recursive: true });
  const ts0 = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const logFile = path.join(logDir, `${ts0}.log`);
  const logStream = fs.createWriteStream(logFile, { flags: "a" });

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const enc = new TextEncoder();
  const t0 = Date.now();
  const ts = () => `+${((Date.now() - t0) / 1000).toFixed(2)}s`;
  let fullOutput = "";

  function log(msg: string) {
    try { writer.write(enc.encode(msg)); } catch {}
    logStream.write(msg);
  }

  const { CLAUDECODE: _cc, ...env } = process.env;
  if (!env.TMPDIR) env.TMPDIR = os.tmpdir();

  const runDir = path.join(STATE_DIR, "tmp", ts0);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "CLAUDE.md"), [
    `# ${column} Triage`,
    "",
    `You are a triage processor for the ${column} column of the Brain board.`,
    "This is a sandboxed non-interactive session. Do not use tools.",
    "Respond only with your analysis and the APPLY block.",
  ].join("\n"));

  const debugFile = path.join(logDir, `${ts0}.debug.log`);
  log(`log:   ${logFile}\n`);
  log(`[${ts()}] server: spawning claude (${colCards.length} card${colCards.length === 1 ? "" : "s"})\n`);

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
  const NOISE = /ENOENT|Broken symlink|detectFileEncoding|managed-settings|settings\.local/;
  tail.stdout.on("data", (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n").filter(l => l.trim())) {
      if (NOISE.test(line)) continue;
      try {
        const entry = JSON.parse(line);
        const msg = entry.message ?? entry.msg ?? line;
        if (!NOISE.test(msg)) log(`  [dbg] ${msg}\n`);
      } catch { log(`  [dbg] ${line}\n`); }
    }
  });

  const pid = proc.pid!;
  log(`[${ts()}] server: process spawned (pid ${pid})\n`);
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
          if (firstToken) { log(`[${ts()}] server: first token\n\n`); firstToken = false; }
          fullOutput += msg.delta.text;
          writer.write(enc.encode(msg.delta.text));
          logStream.write(msg.delta.text);
        }
        if (msg.type === "result" && typeof msg.result === "string") {
          if (firstToken) { log(`[${ts()}] server: result\n\n`); firstToken = false; }
          fullOutput += msg.result;
          writer.write(enc.encode(msg.result));
          logStream.write(msg.result);
        }
      } catch { writer.write(enc.encode(line + "\n")); logStream.write(line + "\n"); }
    }
  });

  proc.stderr.on("data", (chunk: Buffer) => { log(chunk.toString()); });

  proc.on("close", (code) => {
    stopWatcher();
    setTimeout(() => tail.kill(), 300);
    if (buf.trim()) { fullOutput += buf; writer.write(enc.encode(buf)); logStream.write(buf); }
    log(`\n[${ts()}] done (exit ${code})\n`);

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
          const changed: string[] = [];
          if (Object.keys(fields).length > 0) {
            updateCard(u.id, fields);
            changed.push(...Object.keys(fields));
          }
          if (u.move_to) {
            try {
              moveCard(u.id, u.move_to);
              changed.push(`→${u.move_to}`);
            } catch (me) { log(`  [move] ${u.id}: failed — ${String(me)}\n`); }
          }
          if (changed.length > 0) {
            applied++;
            log(`  [apply] ${u.id}: ${changed.join(", ")}\n`);
          }
        } catch (e) { log(`  [apply] ${u.id}: error — ${String(e)}\n`); }
      }
      log(`[${ts()}] applied ${applied}/${updates.length} updates\n`);
    } else {
      log(`[${ts()}] no APPLY block found — nothing written\n`);
    }

    logStream.end();
    writer.close();
  });

  proc.on("error", (err) => {
    stopWatcher(); tail.kill();
    log(`\n[${ts()}] error: ${err.message}\n`);
    logStream.end(); writer.close();
  });

  return new Response(stream.readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Card-Count": String(colCards.length) },
  });
}
