import { NextRequest, NextResponse } from "next/server";
import { getCard, getProject } from "@/lib/data";
import { pickupCard, releaseCard, moveCard } from "@/lib/actions";
import { cardToMarkdown } from "@/lib/card-format";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

export const dynamic = "force-dynamic";

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const OPENCLAW_BIN = process.env.OPENCLAW_BIN ?? "openclaw";
const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".miniclaw");

// Full-agent columns use claude directly with tool access
const FULL_AGENT_COLUMNS = new Set(["backlog", "in-progress", "in-review"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ column: string; cardId: string }> },
) {
  const { column, cardId } = await params;
  const { prompt } = await req.json();
  if (typeof prompt !== "string" || !prompt.trim()) {
    return new Response("prompt required", { status: 400 });
  }

  const card = getCard(cardId);
  if (!card) return new Response(`Card not found: ${cardId}`, { status: 404 });
  if (card.column !== column) {
    return new Response(`Card ${cardId} is in "${card.column}", not "${column}"`, { status: 409 });
  }

  // Backlog cards move to in-progress immediately before the agent starts
  if (column === "backlog") {
    try { moveCard(cardId, "in-progress"); } catch {}
  }
  const effectiveColumn = column === "backlog" ? "in-progress" : column;

  const project = card.project_id ? getProject(card.project_id) : null;
  const fullAgent = FULL_AGENT_COLUMNS.has(effectiveColumn);

  const ts0 = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const { CLAUDECODE: _cc, ...env } = process.env;
  if (!env.TMPDIR) env.TMPDIR = os.tmpdir();

  const runDir = path.join(STATE_DIR, "tmp", `${ts0}-${cardId}`);
  fs.mkdirSync(runDir, { recursive: true });

  let proc: ReturnType<typeof spawn>;

  if (fullAgent) {
    const cardMd = cardToMarkdown(card);
    const logDir = path.join(STATE_DIR, "logs", `${effectiveColumn}-process`);
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `${ts0}-${cardId}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: "a" });
    const t0 = Date.now();
    const ts = () => `+${((Date.now() - t0) / 1000).toFixed(2)}s`;
    function log(msg: string) { logStream.write(msg); }
    const debugFile = path.join(logDir, `${ts0}-${cardId}.debug.log`);
    log(`card:  ${cardId} — ${card.title}\n`);
    log(`log:   ${logFile}\n`);
    // Full agent: real tool access, fire-and-forget, agent updates card via openclaw CLI
    const fullPrompt = prompt.replace("{{CARD}}", cardMd).replace(/\{\{CARD_ID\}\}/g, cardId);
    // Use project work_dir if set, otherwise fall back to runDir
    const agentCwd = (project?.work_dir && fs.existsSync(project.work_dir)) ? project.work_dir : runDir;
    fs.writeFileSync(path.join(runDir, "CLAUDE.md"), [
      `# Work Session: ${card.title}`,
      "",
      `Card: ${cardId} (${column})`,
      `State dir: ${STATE_DIR}`,
      agentCwd !== runDir ? `Working directory: ${agentCwd}` : "",
      project?.github_repo ? `GitHub repo: ${project.github_repo}` : "",
      "",
      "You are a full autonomous agent. Use tools freely to do the actual work.",
      "Update the card via: openclaw mc-board update / move / release",
      "Log progress to: " + path.join(STATE_DIR, "logs", "cards", cardId + ".log"),
    ].filter(Boolean).join("\n"));

    // Pickup immediately so green dot appears on card
    try { pickupCard(cardId, "board-worker-web"); } catch {}
    log(`[${ts()}] spawning claude (full agent) cwd=${agentCwd}\n`);
    proc = spawn(CLAUDE_BIN, [
      "-p", fullPrompt,
      "--output-format", "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--debug-file", debugFile,
      "--dangerously-skip-permissions",
    ], { env, cwd: agentCwd, stdio: ["ignore", "pipe", "pipe"] });

    fs.writeFileSync(debugFile, "");

    log(`[${ts()}] pid ${proc.pid}\n`);

    let buf = "";
    let currentTool = "";
    let currentToolInput = "";

    // Parse stream output → write to log only (no HTTP streaming)
    proc.stdout!.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === "content_block_delta" && msg.delta?.type === "text_delta") {
            logStream.write(msg.delta.text);
          }
          if (msg.type === "content_block_start" && msg.content_block?.type === "tool_use") {
            currentTool = msg.content_block.name ?? "tool";
            currentToolInput = "";
          }
          if (msg.type === "content_block_delta" && msg.delta?.type === "input_json_delta") {
            currentToolInput += msg.delta.partial_json ?? "";
          }
          if (msg.type === "content_block_stop" && currentTool) {
            let snippet = currentTool;
            try {
              const input = JSON.parse(currentToolInput);
              const detail = input.command ?? input.path ?? input.file_path ?? input.query ?? input.id ?? "";
              if (detail) snippet += ` ${String(detail).split("\n")[0].slice(0, 120)}`;
            } catch {}
            log(`  [→ ${snippet}]\n`);
            currentTool = "";
            currentToolInput = "";
          }
          if (msg.type === "result" && typeof msg.result === "string") {
            logStream.write(msg.result);
          }
        } catch {}
      }
    });

    const NOISE = /ENOENT|Broken symlink|detectFileEncoding|managed-settings|settings\.local/;
    proc.stderr!.on("data", (chunk: Buffer) => { log(chunk.toString()); });

    // Tail debug file
    const tail = spawn("tail", ["-f", debugFile]);
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

    proc.on("close", (code) => {
      setTimeout(() => tail.kill(), 300);
      log(`\n[${ts()}] done (exit ${code})\n`);
      try { releaseCard(cardId, "board-worker-web"); } catch {}
      logStream.end();
    });

    proc.on("error", (err) => {
      tail.kill();
      log(`\n[${ts()}] error: ${err.message}\n`);
      logStream.end();
    });

    // Return immediately — agent runs in background
    return NextResponse.json({ ok: true, pid: proc.pid, logFile, cardId });

  } else {
    // Triage mode: delegate entirely to the CLI triage command
    // openclaw mc-board triage handles: pickup, claude haiku, APPLY parsing, move-if-ready, release
    const logDir = path.join(STATE_DIR, "logs", "backlog-triage");
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `${ts0}-${cardId}.log`);

    proc = spawn(OPENCLAW_BIN, [
      "mc-board", "triage", cardId,
      "--worker", "board-worker-web",
      "--log", logFile,
    ], { env, cwd: runDir, stdio: "ignore", detached: true });
    proc.unref();

    // Fire-and-forget — triage runs in background via CLI
    return NextResponse.json({ ok: true, pid: proc.pid, logFile, cardId });
  }
}
