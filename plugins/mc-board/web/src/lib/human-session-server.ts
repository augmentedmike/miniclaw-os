/**
 * human-session-server.ts — persistent noVNC session sidecar
 *
 * Runs on port 4221 as a module-level singleton, alive for the lifetime
 * of the mc-board web process. Agents call /api/human-session/create to
 * get a one-time URL; humans visit it, get the VNC viewer, click Done.
 *
 * No external deps — pure Node.js (mirrors mc-human/src logic).
 */

import * as http from "node:http";
import * as net from "node:net";
import * as crypto from "node:crypto";
import * as os from "node:os";

export const HUMAN_SESSION_PORT = 4221;
const VNC_HOST = "127.0.0.1";
const VNC_PORT = 5900;
const WS_PATH = "/websockify";

// ── Token store ──────────────────────────────────────────────────────────────

interface TokenRecord {
  token: string;
  reason: string;
  expiresAt: number;
  consumed: boolean;
  resolve: () => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const tokens = new Map<string, TokenRecord>();

export interface CreateSessionResult {
  token: string;
  url: string;
  waitForClose: () => Promise<void>;
}

export function createSession(reason: string, timeoutMs = 30 * 60 * 1000): CreateSessionResult {
  const token = crypto.randomBytes(24).toString("base64url");
  let resolve!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });

  const timer = setTimeout(() => {
    const rec = tokens.get(token);
    if (rec) { tokens.delete(token); rec.reject(new Error(`Human session timed out after ${timeoutMs / 1000}s`)); }
  }, timeoutMs);

  tokens.set(token, { token, reason, expiresAt: Date.now() + timeoutMs, consumed: false, resolve, reject, timer });

  const lanIp = getLanIp();
  const url = `http://${lanIp}:${HUMAN_SESSION_PORT}/?token=${token}`;
  return { token, url, waitForClose: () => promise };
}

export function getSessionStatus(token: string): { exists: boolean; closed: boolean } {
  const rec = tokens.get(token);
  if (!rec) return { exists: false, closed: true }; // expired/closed = treat as closed
  return { exists: true, closed: false };
}

export function closeSession(token: string): boolean {
  const rec = tokens.get(token);
  if (!rec) return false;
  clearTimeout(rec.timer);
  tokens.delete(token);
  rec.resolve();
  return true;
}

/** Check if an IPv4 address is in the CGNAT range (100.64.0.0/10) used by Tailscale. */
function isCgnatIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts[0] !== 100) return false;
  return parts[1] >= 64 && parts[1] <= 127;
}

function getLanIp(): string {
  const ifaces = os.networkInterfaces();
  for (const iface of Object.values(ifaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal && !isCgnatIp(addr.address)) return addr.address;
    }
  }
  return "127.0.0.1";
}

// ── VNC WebSocket proxy (pure Node) ──────────────────────────────────────────

/**
 * Filter VNC server's security type list to only offer VNC Auth (type 2).
 * macOS VNC advertises Apple ARD (type 30) first; noVNC picks it and fails
 * because ARD needs macOS account credentials, not the VNC viewer password.
 */
class VncHandshakeInterceptor {
  private serverBuf = Buffer.alloc(0);
  private serverPhase: "version" | "secTypes" | "passthrough" = "version";
  feedFromServer(data: Buffer): Buffer {
    if (this.serverPhase === "passthrough") return data;
    this.serverBuf = Buffer.concat([this.serverBuf, data]);
    let out = Buffer.alloc(0);
    while (true) {
      if (this.serverPhase === "version") {
        if (this.serverBuf.length < 12) break;
        out = Buffer.concat([out, Buffer.from("RFB 003.008\n")]);
        this.serverBuf = this.serverBuf.slice(12);
        this.serverPhase = "secTypes";
      } else if (this.serverPhase === "secTypes") {
        if (this.serverBuf.length < 1) break;
        const n = this.serverBuf[0];
        if (this.serverBuf.length < 1 + n) break;
        const offered = Array.from(this.serverBuf.slice(1, 1 + n));
        const filtered = offered.filter((t) => t === 2);
        const list = filtered.length > 0 ? filtered : offered;
        out = Buffer.concat([out, Buffer.from([list.length, ...list])]);
        this.serverBuf = this.serverBuf.slice(1 + n);
        this.serverPhase = "passthrough";
        if (this.serverBuf.length > 0) { out = Buffer.concat([out, this.serverBuf]); this.serverBuf = Buffer.alloc(0); }
        break;
      }
    }
    return out;
  }
  private clientBuf = Buffer.alloc(0);
  private clientDone = false;
  feedFromClient(data: Buffer): Buffer {
    if (this.clientDone) return data;
    this.clientBuf = Buffer.concat([this.clientBuf, data]);
    if (this.clientBuf.length < 12) return Buffer.alloc(0);
    const out = Buffer.concat([Buffer.from("RFB 003.889\n"), this.clientBuf.slice(12)]);
    this.clientDone = true;
    return out;
  }
}

class VncSecurityFilter {
  private buf = Buffer.alloc(0);
  private phase: "version" | "secTypes" | "passthrough" = "version";

  feed(data: Buffer): Buffer {
    if (this.phase === "passthrough") return data;
    this.buf = Buffer.concat([this.buf, data]);
    let out = Buffer.alloc(0);
    while (true) {
      if (this.phase === "version") {
        if (this.buf.length < 12) break;
        out = Buffer.concat([out, this.buf.slice(0, 12)]);
        this.buf = this.buf.slice(12);
        this.phase = "secTypes";
      } else if (this.phase === "secTypes") {
        if (this.buf.length < 1) break;
        const n = this.buf[0];
        if (this.buf.length < 1 + n) break;
        const offered = Array.from(this.buf.slice(1, 1 + n));
        const filtered = offered.filter((t) => t === 2);
        const list = filtered.length > 0 ? filtered : offered;
        out = Buffer.concat([out, Buffer.from([list.length, ...list])]);
        this.buf = this.buf.slice(1 + n);
        this.phase = "passthrough";
        if (this.buf.length > 0) { out = Buffer.concat([out, this.buf]); this.buf = Buffer.alloc(0); }
        break;
      }
    }
    return out;
  }
}

function wsAccept(key: string): string {
  return crypto.createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
}

function frameWs(payload: Buffer): Buffer {
  const len = payload.length;
  let hdr: Buffer;
  if (len < 126) { hdr = Buffer.alloc(2); hdr[0] = 0x82; hdr[1] = len; }
  else if (len < 65536) { hdr = Buffer.alloc(4); hdr[0] = 0x82; hdr[1] = 126; hdr.writeUInt16BE(len, 2); }
  else { hdr = Buffer.alloc(10); hdr[0] = 0x82; hdr[1] = 127; hdr.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([hdr, payload]);
}

function parseWsFrame(buf: Buffer): { payload: Buffer; consumed: number; opcode: number } | null {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  const masked = !!(buf[1] & 0x80);
  let payLen = buf[1] & 0x7f;
  let off = 2;
  if (payLen === 126) { if (buf.length < 4) return null; payLen = buf.readUInt16BE(2); off = 4; }
  else if (payLen === 127) { if (buf.length < 10) return null; payLen = Number(buf.readBigUInt64BE(2)); off = 10; }
  const maskLen = masked ? 4 : 0;
  if (buf.length < off + maskLen + payLen) return null;
  let payload = buf.slice(off + maskLen, off + maskLen + payLen);
  if (masked) {
    const mask = buf.slice(off, off + 4);
    payload = Buffer.from(payload);
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
  }
  return { payload, consumed: off + maskLen + payLen, opcode };
}

// ── HTTP request handler ──────────────────────────────────────────────────────

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://localhost:${HUMAN_SESSION_PORT}`);

  // POST /session-done
  if (req.method === "POST" && url.pathname === "/session-done") {
    const t = url.searchParams.get("token") ?? "";
    closeSession(t);
    res.writeHead(200, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
    res.end("ok");
    return;
  }

  // OPTIONS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST" });
    res.end();
    return;
  }

  // GET / — serve noVNC viewer
  if (req.method === "GET" && url.pathname === "/") {
    const t = url.searchParams.get("token") ?? "";
    const rec = tokens.get(t);
    if (!rec || rec.consumed || Date.now() > rec.expiresAt) {
      res.writeHead(403, { "Content-Type": "text/plain" });
      res.end("Invalid or expired token");
      return;
    }
    rec.consumed = true; // prevent sharing
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(buildViewerHtml(rec.reason, t));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}

// ── WS upgrade handler ────────────────────────────────────────────────────────

function handleUpgrade(req: http.IncomingMessage, socket: net.Socket, _head: Buffer): void {
  if (req.url !== WS_PATH) { socket.destroy(); return; }
  const key = req.headers["sec-websocket-key"] as string;
  if (!key) { socket.destroy(); return; }

  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\n" +
    "Upgrade: websocket\r\n" +
    "Connection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${wsAccept(key)}\r\n` +
    "Sec-WebSocket-Protocol: binary\r\n\r\n"
  );

  const vnc = net.createConnection({ host: VNC_HOST, port: VNC_PORT });
  const interceptor = new VncHandshakeInterceptor();
  let wsBuf = Buffer.alloc(0);

  vnc.on("data", (chunk: Buffer) => {
    if (!socket.writable) return;
    const out = interceptor.feedFromServer(chunk);
    if (out.length > 0) socket.write(frameWs(out));
  });
  vnc.on("end", () => { if (socket.writable) { socket.write(Buffer.from([0x88, 0x00])); socket.end(); } });
  vnc.on("error", () => { if (socket.writable) socket.destroy(); });

  socket.on("data", (chunk: Buffer) => {
    wsBuf = Buffer.concat([wsBuf, chunk]);
    while (wsBuf.length > 0) {
      const f = parseWsFrame(wsBuf);
      if (!f) break;
      wsBuf = wsBuf.slice(f.consumed);
      if (f.opcode === 8) { vnc.end(); socket.end(); return; }
      if (f.opcode === 9) { socket.write(Buffer.from([0x8a, 0x00])); continue; }
      if ((f.opcode === 2 || f.opcode === 1) && vnc.writable) vnc.write(interceptor.feedFromClient(f.payload));
    }
  });

  socket.on("error", () => vnc.destroy());
  socket.on("close", () => vnc.destroy());
}

// ── noVNC viewer HTML ─────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function buildViewerHtml(reason: string, token: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Am Human Session</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#1a1a2e; color:#eee; font-family:sans-serif; display:flex; flex-direction:column; height:100vh; }
  #header { padding:10px 16px; background:#16213e; border-bottom:1px solid #0f3460; display:flex; align-items:center; gap:12px; }
  #header h1 { font-size:14px; font-weight:600; }
  #reason { font-size:12px; color:#a0aec0; flex:1; }
  #status { font-size:12px; padding:4px 10px; border-radius:12px; background:#2d3748; }
  #status.connected { background:#276749; color:#9ae6b4; }
  #status.error { background:#742a2a; color:#fc8181; }
  #screen { flex:1; overflow:hidden; position:relative; }
  #overlay { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:16px; background:#1a1a2e; }
  #overlay p { color:#a0aec0; }
  .spinner { width:32px; height:32px; border:3px solid #2d3748; border-top-color:#63b3ed; border-radius:50%; animation:spin 0.8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
  #close-btn { position:fixed; bottom:16px; right:16px; padding:8px 18px; background:#e53e3e; color:#fff; border:none; border-radius:6px; cursor:pointer; font-size:14px; }
  #close-btn:hover { background:#c53030; }
</style>
</head>
<body>
<div id="header">
  <h1>Am Human Session</h1>
  <span id="reason">Reason: ${esc(reason)}</span>
  <span id="status">Connecting…</span>
</div>
<div id="screen">
  <div id="overlay"><div class="spinner"></div><p>Connecting to desktop…</p></div>
</div>
<button id="close-btn" onclick="closeSession()">Done — Resume Am</button>
<script type="module">
import RFB from 'https://cdn.jsdelivr.net/npm/@novnc/novnc@1.5.0/core/rfb.js';
const status = document.getElementById('status');
const overlay = document.getElementById('overlay');
const wsUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '${WS_PATH}';
let rfb;
try {
  rfb = new RFB(document.getElementById('screen'), wsUrl, { credentials: {} });
  rfb.addEventListener('connect', () => {
    overlay.style.display = 'none';
    status.textContent = 'Connected'; status.className = 'connected';
    rfb.scaleViewport = true; rfb.resizeSession = true;
  });
  rfb.addEventListener('disconnect', (e) => {
    status.textContent = e.detail.clean ? 'Disconnected' : 'Lost connection';
    status.className = 'error';
    overlay.innerHTML = '<p>' + (e.detail.clean ? 'Session ended.' : 'Connection lost.') + '</p>';
    overlay.style.display = 'flex';
  });
  rfb.addEventListener('credentialsrequired', () => {
    rfb.sendCredentials({ password: prompt('VNC password (blank if none):') ?? '' });
  });
} catch(err) {
  status.textContent = 'Error'; status.className = 'error';
  overlay.innerHTML = '<p>Failed to load VNC client: ' + err.message + '</p>';
}
window.closeSession = function() {
  if (rfb) rfb.disconnect();
  fetch('/session-done?token=${esc(token)}', { method: 'POST' }).finally(() => {
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#a0aec0;font-family:sans-serif">Session closed. Am is resuming. You can close this tab.</div>';
  });
};
window.addEventListener('beforeunload', () => navigator.sendBeacon('/session-done?token=${esc(token)}'));
</script>
</body>
</html>`;
}

// ── Singleton server ──────────────────────────────────────────────────────────

let _server: http.Server | null = null;

export function ensureSessionServer(): void {
  if (_server) return;
  _server = http.createServer(handleRequest);
  _server.on("upgrade", handleUpgrade);
  _server.listen(HUMAN_SESSION_PORT, "0.0.0.0", () => {
    console.log(`[human-session] server listening on port ${HUMAN_SESSION_PORT}`);
  });
  _server.on("error", (err) => {
    console.error(`[human-session] server error: ${err.message}`);
    _server = null;
  });
}
