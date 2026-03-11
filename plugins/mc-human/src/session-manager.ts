/**
 * session-manager.ts — per-session HTTP server for mc-human
 *
 * Starts a fresh server per invocation on a configured fixed port (default 4221).
 * Routes:
 *   GET  /session?token=<TOKEN>      → noVNC viewer HTML
 *   GET  /novnc/*                    → noVNC static files (local node_modules)
 *   GET  /websockify?token=<TOKEN>   → WebSocket → VNC proxy
 *   POST /session-done?token=<TOKEN> → human signals done
 */

import * as http from "node:http";
import * as path from "node:path";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as child_process from "node:child_process";
import { TokenStore } from "./token-store.js";
import { attachVncProxy } from "./vnc-proxy.js";
import { buildViewerHtml } from "./viewer-html.js";

/** Read a secret from mc-vault (best-effort). */
function readVaultSecret(key: string): string | null {
  try {
    const stateDir = process.env.OPENCLAW_STATE_DIR ?? `${process.env.HOME}/.openclaw`;
    const vaultBin = `${stateDir}/miniclaw/SYSTEM/bin/mc-vault`;
    const result = child_process.spawnSync(vaultBin, ["export", key], { encoding: "utf8", timeout: 3000 });
    if (result.status === 0 && result.stdout) return result.stdout.trim() || null;
  } catch { /* ignore */ }
  return null;
}

/** Get the first non-loopback IPv4 for LAN URLs. */
function getLanIp(): string {
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) return addr.address;
    }
  }
  return "127.0.0.1";
}

/** Try to bind a port. Returns the port number, or throws if both fixed and fallback fail. */
async function bindPort(server: http.Server, preferredPort: number): Promise<number> {
  // Try preferred port first
  const tryPort = (port: number): Promise<number> =>
    new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "0.0.0.0", () => {
        server.removeAllListeners("error");
        resolve((server.address() as net.AddressInfo).port);
      });
    });

  try {
    return await tryPort(preferredPort);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code !== "EADDRINUSE") throw e;
    // Fixed port busy — fall back to random
    server.removeAllListeners("error");
    return await tryPort(0);
  }
}

type Logger = { info(m: string): void; warn(m: string): void; error(m: string): void };

export interface SessionOptions {
  reason: string;
  vncHost: string;
  vncPort: number;
  proxyPort?: number;
  timeoutMs: number;
  logger: Logger;
}

export interface SessionResult {
  url: string;
  waitForClose: () => Promise<void>;
  shutdown: () => void;
}

export async function startSession(opts: SessionOptions): Promise<SessionResult> {
  const { reason, vncHost, vncPort, timeoutMs, logger } = opts;
  const preferredPort = opts.proxyPort ?? 4221;

  const tokens = new TokenStore();
  const token = tokens.generate(timeoutMs);
  const vncPassword = readVaultSecret("vnc-password");
  const wsPath = "/websockify";

  const novncRoot = path.resolve(
    new URL("../novnc-src/core", import.meta.url).pathname
  );
  const novncVendorRoot = path.resolve(
    new URL("../novnc-src/vendor", import.meta.url).pathname
  );

  let resolveClose!: () => void;
  let rejectClose!: (e: Error) => void;
  const closePromise = new Promise<void>((res, rej) => { resolveClose = res; rejectClose = rej; });

  let sessionClosed = false;
  const closeSession = (source: string) => {
    if (sessionClosed) return;
    sessionClosed = true;
    clearTimeout(timer);
    logger.info(`mc-human: session closed (${source})`);
    resolveClose();
    setImmediate(() => server.close());
  };

  const timer = setTimeout(() => {
    if (sessionClosed) return;
    sessionClosed = true;
    logger.warn(`mc-human: session timed out after ${timeoutMs / 1000}s`);
    rejectClose(new Error(`Human session timed out after ${timeoutMs / 1000}s — no response`));
    setImmediate(() => server.close());
  }, timeoutMs);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost`);

    // POST /log — browser console relay
    if (req.method === "POST" && url.pathname === "/log") {
      let body = "";
      req.on("data", (d: Buffer) => { body += d.toString(); });
      req.on("end", () => {
        try { const { level, msg } = JSON.parse(body); logger.info(`mc-human [browser:${level}] ${msg}`); } catch { /* ignore */ }
      });
      res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
      res.end("ok");
      return;
    }

    // POST /session-done
    if (req.method === "POST" && url.pathname === "/session-done") {
      res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
      res.end("ok");
      closeSession("human signaled done");
      return;
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST" });
      res.end();
      return;
    }

    // GET /session?token=...
    if (req.method === "GET" && url.pathname === "/session") {
      const t = url.searchParams.get("token") ?? "";
      if (!tokens.validate(t)) {
        res.writeHead(403, { "Content-Type": "text/plain" });
        res.end("Invalid or expired token");
        return;
      }
      const html = buildViewerHtml({
        wsPath,
        token,
        reason,
        vncPassword: vncPassword ?? undefined,
      });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      logger.info("mc-human: viewer page served");
      return;
    }

    // GET /novnc/* — serve noVNC from local node_modules
    if (req.method === "GET" && url.pathname.startsWith("/novnc/")) {
      const filePath = path.join(novncRoot, url.pathname.slice("/novnc/".length));
      if (!filePath.startsWith(novncRoot)) { res.writeHead(403); res.end(); return; }
      try {
        const data = fs.readFileSync(filePath);
        const ext = path.extname(filePath);
        const mime = ext === ".js" ? "application/javascript" : ext === ".wasm" ? "application/wasm" : "text/plain";
        res.writeHead(200, { "Content-Type": mime });
        res.end(data);
      } catch {
        res.writeHead(404); res.end("Not found");
      }
      return;
    }

    // GET /vendor/* — serve noVNC vendor deps (pako, etc.)
    if (req.method === "GET" && url.pathname.startsWith("/vendor/")) {
      const filePath = path.join(novncVendorRoot, url.pathname.slice("/vendor/".length));
      if (!filePath.startsWith(novncVendorRoot)) { res.writeHead(403); res.end(); return; }
      try {
        const data = fs.readFileSync(filePath);
        const ext = path.extname(filePath);
        const mime = ext === ".js" ? "application/javascript" : "text/plain";
        res.writeHead(200, { "Content-Type": mime });
        res.end(data);
      } catch {
        res.writeHead(404); res.end("Not found");
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });

  attachVncProxy(server, wsPath, logger, (t) => {
    if (!tokens.validate(t)) return null;
    return { host: vncHost, port: vncPort };
  });

  const port = await bindPort(server, preferredPort);
  logger.info(`mc-human: session server listening on port ${port}`);

  const lanIp = getLanIp();
  const url = `http://${lanIp}:${port}/session?token=${token}`;

  return {
    url,
    waitForClose: () => closePromise,
    shutdown: () => closeSession("shutdown"),
  };
}
