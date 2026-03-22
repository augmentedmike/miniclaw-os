import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { startChatServer } from "./server.js";

const home = homedir();

function findClaudeBin(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  try {
    return execFileSync("which", ["claude"], { encoding: "utf8", timeout: 3000 }).trim();
  } catch { /* which failed */ }
  return join(home, ".local/bin/claude");
}

startChatServer({
  port: parseInt(process.env.MC_WEB_CHAT_PORT || "4221", 10),
  claudeBin: findClaudeBin(),
  workspaceDir: join(home, ".openclaw/workspace"),
});
