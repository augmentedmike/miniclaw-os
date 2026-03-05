import { NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

export const dynamic = "force-dynamic";

function resolvePath(p: string) {
  return p.startsWith("~") ? p.replace("~", os.homedir()) : p;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ cardId: string }> }
) {
  const { cardId } = await params;
  const logFile = resolvePath(`~/am/logs/cards/${cardId}.log`);

  const encoder = new TextEncoder();
  let lastSize = 0;
  let closed = false;

  // If file exists, start from beginning; otherwise wait for it
  if (fs.existsSync(logFile)) {
    lastSize = 0;
  }

  const stream = new ReadableStream({
    start(controller) {
      // Send initial ping
      controller.enqueue(encoder.encode(`data: {"type":"connected","cardId":"${cardId}"}\n\n`));

      const interval = setInterval(() => {
        if (closed) {
          clearInterval(interval);
          return;
        }
        try {
          if (!fs.existsSync(logFile)) return;
          const stat = fs.statSync(logFile);
          if (stat.size <= lastSize) return;

          const fd = fs.openSync(logFile, "r");
          const newBytes = stat.size - lastSize;
          const buf = Buffer.alloc(newBytes);
          fs.readSync(fd, buf, 0, newBytes, lastSize);
          fs.closeSync(fd);
          lastSize = stat.size;

          const lines = buf.toString("utf8").split("\n").filter(l => l.trim());
          for (const line of lines) {
            const payload = JSON.stringify({ type: "log", line, ts: Date.now() });
            controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
          }
        } catch {
          // file not ready yet
        }
      }, 500);

      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        controller.close();
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
