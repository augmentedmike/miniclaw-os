import { join } from "node:path";
import { existsSync } from "node:fs";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

function resolvePath(p: string): string {
  if (p.startsWith("~/")) return p.replace("~", process.env.HOME || "/tmp");
  return p;
}

export default function register(api: OpenClawPluginApi): void {
  const raw = (api.pluginConfig ?? {}) as Record<string, unknown>;
  const stateDir = resolvePath(process.env.OPENCLAW_STATE_DIR ?? "~/.openclaw");
  const port = (raw.port as number) || 4221;
  const claudeBin = (raw.claudeBin as string) || join(process.env.HOME || "", ".local/bin/claude");
  const workspaceDir = (raw.workspaceDir as string) || join(stateDir, "workspace");

  // Verify claude binary exists
  if (!existsSync(claudeBin)) {
    api.logger.info(`[mc-web-chat] claude binary not found at ${claudeBin} — chat disabled`);
    return;
  }

  // Start WebSocket server
  import("./server.js").then(({ startChatServer }) => {
    startChatServer({ port, claudeBin, workspaceDir });
  }).catch((err) => {
    api.logger.error(`[mc-web-chat] failed to start: ${err}`);
  });

  // CLI commands
  api.registerCli((ctx) => {
    ctx.program
      .command("mc-web-chat status")
      .description("Check mc-web-chat server status")
      .action(async () => {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/health`);
          const data = await res.json();
          console.log(`mc-web-chat: ${data.status} (${data.sessions} active sessions)`);
        } catch {
          console.log("mc-web-chat: not running");
        }
      });
  });
}
