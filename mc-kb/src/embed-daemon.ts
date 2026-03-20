/**
 * mc-kb — Embedding Daemon Server
 *
 * Loads EmbeddingGemma-300M once and serves embedding vectors over a Unix domain socket.
 * Protocol: newline-delimited JSON (NDJSON) over Unix socket.
 *
 * Request:  {"id":"<uuid>","text":"..."}\n
 * Response: {"id":"<uuid>","vector":[...]}\n
 *
 * Health:   {"id":"<uuid>","ping":true}\n
 * Response: {"id":"<uuid>","pong":true}\n
 *
 * Socket: ~/.openclaw/run/embedder.sock
 * PID:    ~/.openclaw/run/embedder.pid
 */

import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Embedder } from "./embedder.js";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
const RUN_DIR = path.join(STATE_DIR, "run");
const SOCK_PATH = path.join(RUN_DIR, "embedder.sock");
const PID_PATH = path.join(RUN_DIR, "embedder.pid");

const MODEL_PATH = process.env.EMBEDDER_MODEL_PATH ?? path.join(
  os.homedir(),
  ".cache/qmd/models/hf_ggml-org_embeddinggemma-300M-Q8_0.gguf",
);

interface EmbedRequest {
  id: string;
  text?: string;
  ping?: boolean;
}

interface EmbedResponse {
  id: string;
  vector?: number[];
  pong?: boolean;
  error?: string;
}

function log(msg: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [embed-daemon] ${msg}`);
}

function cleanup(): void {
  try { fs.unlinkSync(SOCK_PATH); } catch {}
  try { fs.unlinkSync(PID_PATH); } catch {}
}

async function main(): Promise<void> {
  // Ensure run directory exists
  fs.mkdirSync(RUN_DIR, { recursive: true });

  // Clean up stale socket
  if (fs.existsSync(SOCK_PATH)) {
    try {
      const client = net.createConnection(SOCK_PATH);
      await new Promise<void>((resolve, reject) => {
        client.on("connect", () => { client.destroy(); reject(new Error("Socket in use")); });
        client.on("error", () => resolve());
        setTimeout(() => { client.destroy(); resolve(); }, 500);
      });
      // If we get here, socket is stale — remove it
      fs.unlinkSync(SOCK_PATH);
    } catch (err) {
      if ((err as Error).message === "Socket in use") {
        log("Another daemon is already running. Exiting.");
        process.exit(1);
      }
    }
  }

  // Write PID file
  fs.writeFileSync(PID_PATH, String(process.pid));

  // Load model
  log(`Loading model from ${MODEL_PATH}...`);
  const embedder = new Embedder(MODEL_PATH);
  await embedder.load();

  if (!embedder.isReady()) {
    log("Model failed to load. Exiting.");
    cleanup();
    process.exit(1);
  }

  log("Model loaded successfully.");

  // Create Unix domain socket server
  const server = net.createServer((conn) => {
    let buffer = "";

    conn.on("data", (chunk) => {
      buffer += chunk.toString();

      // Process complete lines (NDJSON)
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);

        if (!line) continue;

        handleRequest(line, conn, embedder);
      }
    });

    conn.on("error", (err) => {
      // Client disconnected — ignore
      if ((err as NodeJS.ErrnoException).code !== "ECONNRESET") {
        log(`Connection error: ${err.message}`);
      }
    });
  });

  server.listen(SOCK_PATH, () => {
    // Make socket accessible
    fs.chmodSync(SOCK_PATH, 0o660);
    log(`Listening on ${SOCK_PATH} (pid=${process.pid})`);
  });

  server.on("error", (err) => {
    log(`Server error: ${err.message}`);
    cleanup();
    process.exit(1);
  });

  // Graceful shutdown
  const shutdown = async () => {
    log("Shutting down...");
    server.close();
    await embedder.dispose();
    cleanup();
    log("Goodbye.");
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // Handle sleep/wake — re-validate model on SIGCONT
  process.on("SIGCONT", () => {
    log("Received SIGCONT (wake from sleep) — model should still be resident in GPU memory.");
  });
}

async function handleRequest(
  line: string,
  conn: net.Socket,
  embedder: Embedder,
): Promise<void> {
  let req: EmbedRequest;
  try {
    req = JSON.parse(line);
  } catch {
    const resp: EmbedResponse = { id: "unknown", error: "Invalid JSON" };
    conn.write(JSON.stringify(resp) + "\n");
    return;
  }

  // Health check
  if (req.ping) {
    const resp: EmbedResponse = { id: req.id, pong: true };
    conn.write(JSON.stringify(resp) + "\n");
    return;
  }

  // Embedding request
  if (!req.text) {
    const resp: EmbedResponse = { id: req.id, error: "Missing 'text' field" };
    conn.write(JSON.stringify(resp) + "\n");
    return;
  }

  try {
    const vector = await embedder.embed(req.text);
    if (!vector) {
      const resp: EmbedResponse = { id: req.id, error: "Embedding failed (model not ready)" };
      conn.write(JSON.stringify(resp) + "\n");
      return;
    }

    const resp: EmbedResponse = { id: req.id, vector: Array.from(vector) };
    conn.write(JSON.stringify(resp) + "\n");
  } catch (err) {
    const resp: EmbedResponse = { id: req.id, error: `Embed error: ${(err as Error).message}` };
    conn.write(JSON.stringify(resp) + "\n");
  }
}

main().catch((err) => {
  log(`Fatal: ${err}`);
  cleanup();
  process.exit(1);
});
