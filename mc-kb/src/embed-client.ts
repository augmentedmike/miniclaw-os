/**
 * mc-kb — Embedding Daemon Client
 *
 * Connects to the embedding daemon over Unix domain socket.
 * Implements IEmbedder interface for transparent use by mc-kb and mc-memory.
 */

import * as net from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import type { IEmbedder } from "./types.js";

const STATE_DIR = process.env.OPENCLAW_STATE_DIR ?? path.join(os.homedir(), ".openclaw");
const SOCK_PATH = path.join(STATE_DIR, "run", "embedder.sock");

const DEFAULT_TIMEOUT_MS = 5000;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class EmbedClient implements IEmbedder {
  private readonly sockPath: string;
  private readonly timeoutMs: number;
  private readonly dims: number = 768;

  constructor(sockPath?: string, timeoutMs?: number) {
    this.sockPath = sockPath ?? SOCK_PATH;
    this.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  isReady(): boolean {
    return fs.existsSync(this.sockPath);
  }

  getDims(): number {
    return this.dims;
  }

  async load(): Promise<void> {
    // No-op for client — daemon manages model loading
  }

  async dispose(): Promise<void> {
    // No-op for client
  }

  /**
   * Check if the daemon is available and responding.
   */
  async isAvailable(): Promise<boolean> {
    if (!fs.existsSync(this.sockPath)) return false;
    try {
      const id = crypto.randomUUID();
      const resp = await this._request({ id, ping: true });
      return (resp as { pong?: boolean }).pong === true;
    } catch {
      return false;
    }
  }

  /**
   * Get embedding vector for text via daemon.
   */
  async embed(text: string): Promise<Float32Array | null> {
    const id = crypto.randomUUID();
    try {
      const resp = await this._request({ id, text }) as {
        id: string;
        vector?: number[];
        error?: string;
      };

      if (resp.error) {
        console.warn(`[embed-client] Daemon error: ${resp.error}`);
        return null;
      }

      if (!resp.vector) return null;

      return new Float32Array(resp.vector);
    } catch (err) {
      console.warn(`[embed-client] Request failed: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Send a request to the daemon and wait for the matching response.
   */
  private _request(payload: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const conn = net.createConnection(this.sockPath);
      let buffer = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          conn.destroy();
          reject(new Error("Daemon request timed out"));
        }
      }, this.timeoutMs);

      conn.on("connect", () => {
        conn.write(JSON.stringify(payload) + "\n");
      });

      conn.on("data", (chunk) => {
        buffer += chunk.toString();
        const newlineIdx = buffer.indexOf("\n");
        if (newlineIdx !== -1) {
          const line = buffer.slice(0, newlineIdx).trim();
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            conn.destroy();
            try {
              resolve(JSON.parse(line));
            } catch (err) {
              reject(new Error(`Invalid JSON from daemon: ${line}`));
            }
          }
        }
      });

      conn.on("error", (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });

      conn.on("close", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(new Error("Connection closed before response"));
        }
      });
    });
  }
}
