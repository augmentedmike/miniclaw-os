import { join } from "node:path";
import { startChatServer } from "./server.js";

const home = process.env.HOME || "";

startChatServer({
  port: parseInt(process.env.MC_WEB_CHAT_PORT || "4221", 10),
  claudeBin: join(home, ".local/bin/claude"),
  workspaceDir: join(home, ".openclaw/workspace"),
});
