import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

export const dynamic = "force-dynamic";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");

const LOG_DIRS = [
  "backlog-triage", "in-progress-triage", "in-review-triage",
  "backlog-process", "in-progress-process", "in-review-process",
];

/** Find the most recently modified log file that contains cardId in its name. */
function findActiveLog(cardId: string): string | null {
  let best: { file: string; mtime: number } | null = null;
  for (const dir of LOG_DIRS) {
    const dirPath = path.join(STATE_DIR, "logs", dir);
    if (!fs.existsSync(dirPath)) continue;
    try {
      const files = fs.readdirSync(dirPath).filter(f => f.includes(cardId) && f.endsWith(".log") && !f.endsWith(".debug.log"));
      for (const f of files) {
        const full = path.join(dirPath, f);
        const { mtimeMs } = fs.statSync(full);
        if (!best || mtimeMs > best.mtime) best = { file: full, mtime: mtimeMs };
      }
    } catch {}
  }
  return best?.file ?? null;
}

/** Cards log written directly by the full agent: ~/.openclaw/logs/cards/<cardId>.log */
function cardsLogPath(cardId: string): string {
  return path.join(STATE_DIR, "logs", "cards", `${cardId}.log`);
}

/** Tail a file from a given offset, return new content + new offset. */
function readNewBytes(file: string, lastSize: number): { text: string; size: number } {
  try {
    const stat = fs.statSync(file);
    if (stat.size <= lastSize) return { text: "", size: lastSize };
    const fd = fs.openSync(file, "r");
    const newBytes = stat.size - lastSize;
    const buf = Buffer.alloc(newBytes);
    fs.readSync(fd, buf, 0, newBytes, lastSize);
    fs.closeSync(fd);
    return { text: buf.toString("utf8"), size: stat.size };
  } catch {
    return { text: "", size: lastSize };
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> },
) {
  const { cardId } = await params;
  const encoder = new TextEncoder();
  let lastProcessSize = 0;
  let lastCardsSize = 0;
  let closed = false;
  let logFile = findActiveLog(cardId);
  const cardsLog = cardsLogPath(cardId);

  // Start cards log offset at current end so we only show new lines
  try { lastCardsSize = fs.statSync(cardsLog).size; } catch {}

  const stream = new ReadableStream({
    start(controller) {
      const send = (obj: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch {}
      };

      send({ type: "connected", cardId });
      if (logFile) send({ type: "log", line: `[watch] tailing ${path.basename(logFile)}` });
      else send({ type: "log", line: `[watch] waiting for log file…` });

      const interval = setInterval(() => {
        if (closed) { clearInterval(interval); return; }

        // Primary: process log (process route writes here)
        if (!logFile) {
          logFile = findActiveLog(cardId);
          if (logFile) send({ type: "log", line: `[watch] found ${path.basename(logFile)}` });
        }
        if (logFile && fs.existsSync(logFile)) {
          const { text, size } = readNewBytes(logFile, lastProcessSize);
          if (text) {
            lastProcessSize = size;
            for (const line of text.split("\n")) {
              if (line.trim()) send({ type: "log", line });
            }
          }
        }

        // Secondary: cards log (full agent writes here directly)
        if (fs.existsSync(cardsLog)) {
          const { text, size } = readNewBytes(cardsLog, lastCardsSize);
          if (text) {
            lastCardsSize = size;
            for (const line of text.split("\n")) {
              if (line.trim()) send({ type: "log", line: `[agent] ${line}` });
            }
          }
        }
      }, 200);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
