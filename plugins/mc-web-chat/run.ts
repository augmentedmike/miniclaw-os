import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { startChatServer } from "./server.js";

const home = homedir();

function resolveClaudeBin(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  try {
    return execFileSync("which", ["claude"], { encoding: "utf8", timeout: 3000 }).trim();
  } catch {}
  return join(home, ".local", "bin", "claude");
}

startChatServer({
  port: parseInt(process.env.MC_WEB_CHAT_PORT || "4221", 10),
  claudeBin: resolveClaudeBin(),
  workspaceDir: join(home, ".openclaw", "workspace"),
});
