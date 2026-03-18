export const dynamic = "force-dynamic";

import { spawn } from "node:child_process";

/**
 * GET /api/setup/smoke
 *
 * Runs mc-smoke and streams output as Server-Sent Events.
 *
 * Events:
 *   data: {"type":"output","data":"..."}     — line of mc-smoke output
 *   data: {"type":"check","status":"pass"|"fail"|"warn","label":"..."}
 *   data: {"type":"done","code":0,"passed":N,"failed":N,"warned":N}
 */
export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      const home = process.env.HOME || "";
      const stateDir = process.env.OPENCLAW_STATE_DIR || `${home}/.openclaw`;
      // Use bash -c (not -l) to avoid login profile overwriting our PATH
      const proc = spawn("bash", ["-c", "mc-smoke"], {
        env: {
          ...process.env,
          TERM: "dumb",
          NO_COLOR: "1",
          FORCE_COLOR: "0",
          PATH: `${stateDir}/miniclaw/SYSTEM/bin:${home}/.local/bin:${home}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${process.env.PATH || ""}`,
          OPENCLAW_STATE_DIR: stateDir,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });

      let passed = 0;
      let failed = 0;
      let warned = 0;
      let buffer = "";
      let fullOutput = "";

      const processChunk = (chunk: Buffer) => {
        const text = chunk.toString();
        fullOutput += text;
        buffer += text;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          send({ type: "output", data: line });

          // Parse check results
          if (line.includes("✓") || line.includes("[✓]")) {
            passed++;
            const label = line.replace(/.*[✓]\s*/, "").trim();
            send({ type: "check", status: "pass", label });
          } else if (line.includes("✗") || line.includes("[✗]")) {
            failed++;
            const label = line.replace(/.*[✗]\s*/, "").trim();
            send({ type: "check", status: "fail", label });
          } else if (line.includes("⚠") || line.includes("[!]")) {
            warned++;
            const label = line.replace(/.*[⚠!]\s*/, "").trim();
            send({ type: "check", status: "warn", label });
          }
        }
      };

      proc.stdout?.on("data", processChunk);
      proc.stderr?.on("data", processChunk);

      proc.on("close", async (code) => {
        if (buffer.trim()) {
          fullOutput += buffer;
          send({ type: "output", data: buffer });
        }
        send({ type: "done", code: code ?? 1, passed, failed, warned });

        // Self-healing: run mc-doctor --auto to create fix cards
        if (failed > 0) {
          try {
            const doctorProc = spawn("bash", ["-c", "mc-doctor --auto"], {
              env: {
                ...process.env,
                PATH: `${stateDir}/miniclaw/SYSTEM/bin:${home}/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${process.env.PATH || ""}`,
              },
              stdio: ["pipe", "pipe", "pipe"],
            });
            let doctorOut = "";
            doctorProc.stdout?.on("data", (d: Buffer) => { doctorOut += d.toString(); });
            doctorProc.stderr?.on("data", (d: Buffer) => { doctorOut += d.toString(); });
            await new Promise<void>((resolve) => doctorProc.on("close", () => resolve()));
            const cardsCreated = (doctorOut.match(/created card:/g) || []).length;
            send({ type: "healing", cardsCreated });
          } catch (e) {
            send({ type: "healing", error: e instanceof Error ? e.message : "unknown" });
          }
        }

        controller.close();
      });

      proc.on("error", (err) => {
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
