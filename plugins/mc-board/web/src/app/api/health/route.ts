import { NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as net from "node:net";

export const dynamic = "force-dynamic";

const stateDir = process.env.OPENCLAW_STATE_DIR || path.join(process.env.HOME || "", ".openclaw");

function getVersion(): string {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(stateDir, "miniclaw", "MANIFEST.json"), "utf-8"));
    return manifest.version || "0.0.0";
  } catch { // MANIFEST.json missing or unreadable — return default version
    return "0.0.0";
  }
}

async function checkWeb(): Promise<{ status: "ok" | "down" }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch("http://127.0.0.1:4221/health", { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) return { status: "ok" };
    return { status: "down" };
  } catch { // fetch failed — web service unreachable or timed out
    return { status: "down" };
  }
}

async function checkChat(): Promise<{ status: "ok" | "down" }> {
  const sockPath = path.join(stateDir, "chat.sock");
  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(sockPath)) {
        resolve({ status: "down" });
        return;
      }
      const sock = net.createConnection(sockPath, () => {
        sock.destroy();
        resolve({ status: "ok" });
      });
      sock.on("error", () => {
        sock.destroy();
        resolve({ status: "down" });
      });
      sock.setTimeout(3000, () => {
        sock.destroy();
        resolve({ status: "down" });
      });
    } catch { // socket connection setup failed — chat service down
      resolve({ status: "down" });
    }
  });
}

async function checkTelegram(): Promise<{ status: "ok" | "down" | "unconfigured" }> {
  try {
    const setupPath = path.join(stateDir, "setup-state.json");
    if (!fs.existsSync(setupPath)) return { status: "unconfigured" };
    const setup = JSON.parse(fs.readFileSync(setupPath, "utf-8"));
    const token = setup?.telegram?.bot_token || setup?.telegramBotToken;
    if (!token) return { status: "unconfigured" };
    // Token exists — try getMe to verify
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 3000);
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: ctrl.signal });
      clearTimeout(timer);
      const data = await res.json();
      return { status: data.ok ? "ok" : "down" };
    } catch { // Telegram API unreachable or timed out — token exists but service down
      return { status: "down" };
    }
  } catch { // setup-state.json missing or malformed — Telegram not configured
    return { status: "unconfigured" };
  }
}

export async function GET() {
  const [web, chat, telegram] = await Promise.all([checkWeb(), checkChat(), checkTelegram()]);
  return NextResponse.json({
    ok: true,
    version: getVersion(),
    time: new Date().toISOString(),
    services: { web, chat, telegram },
  });
}
